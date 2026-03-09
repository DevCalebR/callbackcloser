'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { logTwilioError } from '@/lib/twilio-logging';
import { provisionPhoneNumber } from '@/lib/twilio-provision';
import { getTwilioBusinessClient } from '@/lib/twilio-client';
import { syncTwilioIncomingPhoneNumberWebhooks } from '@/lib/twilio';
import { businessSettingsSchema, buyNumberSchema } from '@/lib/validators';

async function getBusinessForOwner() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const business = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (!business) redirect('/app/onboarding');
  return business;
}

function parseTwilioPhoneNumberSid(formData: FormData) {
  const raw = formData.get('phoneNumberSid');
  if (typeof raw !== 'string') return undefined;
  const sid = raw.trim();
  if (!sid) return undefined;
  if (!/^PN[0-9a-fA-F]{32}$/.test(sid)) {
    throw new Error('Invalid Twilio phone number SID');
  }
  return sid;
}

async function pickExistingTwilioIncomingNumber(
  business: Awaited<ReturnType<typeof getBusinessForOwner>>,
  phoneNumberSid?: string
) {
  const client = getTwilioBusinessClient(business.twilioSubaccountSid);
  if (phoneNumberSid) {
    return client.incomingPhoneNumbers(phoneNumberSid).fetch();
  }

  const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });
  const firstActive = numbers.find((number) => `${number.status || ''}`.toLowerCase() === 'in-use');
  const selected = firstActive ?? numbers[0];
  if (!selected) {
    throw new Error('No Twilio incoming phone numbers found on this account');
  }
  return selected;
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

  try {
    const correlationId = `settings_buy_${business.id}`;
    await provisionPhoneNumber({
      businessId: business.id,
      businessName: business.name,
      areaCode: parsed.data.areaCode,
      correlationId,
    });

    revalidatePath('/app/settings');
    redirect('/app/settings?numberBought=1');
  } catch (error) {
    logTwilioError(
      'provisioning',
      'settings_manual_provision_failed',
      {
        correlationId: `settings_buy_${business.id}`,
        businessId: business.id,
        decision: 'redirect_with_error',
      },
      error
    );
    const message = error instanceof Error ? error.message : 'Failed to buy number';
    redirect(`/app/settings?error=${encodeURIComponent(message)}`);
  }
}

export async function connectExistingTwilioNumberAction(formData: FormData) {
  const business = await getBusinessForOwner();

  try {
    const client = getTwilioBusinessClient(business.twilioSubaccountSid);
    const phoneNumberSid = parseTwilioPhoneNumberSid(formData);
    const selectedNumber = await pickExistingTwilioIncomingNumber(business, phoneNumberSid);
    const { number } = await syncTwilioIncomingPhoneNumberWebhooks(selectedNumber.sid, client);
    const syncedAt = new Date();

    await saveBusinessTwilioNumber(business.id, {
      phoneNumber: number.phoneNumber,
      phoneNumberSid: number.sid,
      syncedAt,
    });

    revalidatePath('/app/settings');
    redirect('/app/settings?twilioConnected=1');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to connect existing Twilio number';
    redirect(`/app/settings?error=${encodeURIComponent(message)}`);
  }
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

    revalidatePath('/app/settings');
    redirect('/app/settings?twilioSynced=1');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync Twilio webhooks';
    redirect(`/app/settings?error=${encodeURIComponent(message)}`);
  }
}
