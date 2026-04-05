'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { getTwilioBusinessClient } from '@/lib/twilio-client';
import { logTwilioError } from '@/lib/twilio-logging';
import { provisionPhoneNumber } from '@/lib/twilio-provision';
import { syncTwilioIncomingPhoneNumberWebhooks } from '@/lib/twilio';
import { businessSettingsSchema, buyNumberSchema } from '@/lib/validators';

async function getBusinessForOwner() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const business = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (!business) redirect('/app/onboarding');
  return business;
}

async function saveBusinessTwilioNumber(businessId: string, params: { phoneNumber: string | null; phoneNumberSid: string; syncedAt: Date }) {
  await db.business.update({
    where: { id: businessId },
    data: {
      twilioPhoneNumber: normalizePhoneNumber(params.phoneNumber),
      twilioPhoneNumberSid: params.phoneNumberSid,
      twilioWebhookSyncedAt: params.syncedAt,
    },
  });
}

export async function saveBusinessSettingsAction(formData: FormData) {
  const business = await getBusinessForOwner();
  const parsed = businessSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/app/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid form data')}`);
  }

  await db.business.update({
    where: { id: business.id },
    data: {
      name: parsed.data.name,
      forwardingNumber: normalizePhoneNumber(parsed.data.forwardingNumber),
      notifyPhone: normalizePhoneNumber(parsed.data.notifyPhone || '') || null,
      missedCallSeconds: parsed.data.missedCallSeconds,
      serviceLabel1: parsed.data.serviceLabel1,
      serviceLabel2: parsed.data.serviceLabel2,
      serviceLabel3: parsed.data.serviceLabel3,
      timezone: parsed.data.timezone,
    },
  });

  revalidatePath('/app/settings');
  revalidatePath('/app/leads');
  redirect('/app/settings?saved=1');
}

export async function buyTwilioNumberAction(formData: FormData) {
  const business = await getBusinessForOwner();
  const parsed = buyNumberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect('/app/settings?error=Invalid%20area%20code');
  }

  if (business.twilioPhoneNumber) {
    redirect('/app/settings?error=This%20business%20already%20has%20a%20Twilio%20number');
  }

  const correlationId = `settings_buy_${business.id}`;
  try {
    await provisionPhoneNumber({
      businessId: business.id,
      businessName: business.name,
      areaCode: parsed.data.areaCode,
      correlationId,
    });
  } catch (error) {
    logTwilioError(
      'provisioning',
      'settings_manual_provision_failed',
      {
        correlationId,
        businessId: business.id,
        decision: 'redirect_with_error',
      },
      error
    );
    const message = error instanceof Error ? error.message : 'Failed to buy number';
    redirect(`/app/settings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath('/app/settings');
  redirect('/app/settings?numberBought=1');
}

export async function connectExistingTwilioNumberAction(formData: FormData) {
  void formData;
  redirect(
    '/app/settings?error=' +
      encodeURIComponent(
        'Existing Twilio numbers are connected manually during founder-led pilots so shared account inventory is not exposed in self-serve settings.'
      )
  );
}

export async function resyncTwilioWebhooksAction() {
  const business = await getBusinessForOwner();
  if (!business.twilioPhoneNumberSid) {
    redirect('/app/settings?error=No%20Twilio%20number%20is%20assigned%20to%20this%20business');
  }

  try {
    const client = getTwilioBusinessClient(business.twilioSubaccountSid);
    const { number } = await syncTwilioIncomingPhoneNumberWebhooks(business.twilioPhoneNumberSid, client);
    const syncedAt = new Date();

    await saveBusinessTwilioNumber(business.id, {
      phoneNumber: number.phoneNumber,
      phoneNumberSid: number.sid,
      syncedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync Twilio webhooks';
    redirect(`/app/settings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath('/app/settings');
  redirect('/app/settings?twilioSynced=1');
}
