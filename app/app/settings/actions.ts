'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { getTwilioClient, getTwilioWebhookConfig, syncTwilioIncomingPhoneNumberWebhooks } from '@/lib/twilio';
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

async function pickExistingTwilioIncomingNumber(phoneNumberSid?: string) {
  const client = getTwilioClient();
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
    const client = getTwilioClient();
    const webhookConfig = getTwilioWebhookConfig();
    const areaCode = parsed.data.areaCode?.trim() || undefined;
    const areaCodeNumber = areaCode ? Number.parseInt(areaCode, 10) : undefined;
    const candidates = await client.availablePhoneNumbers('US').local.list({
      limit: 1,
      smsEnabled: true,
      voiceEnabled: true,
      ...(areaCodeNumber ? { areaCode: areaCodeNumber } : {}),
    });

    const candidate = candidates[0];
    if (!candidate?.phoneNumber) {
      redirect('/app/settings?error=No%20US%20local%20numbers%20available');
    }

    const number = await client.incomingPhoneNumbers.create({
      phoneNumber: candidate.phoneNumber,
      friendlyName: `${business.name} - CallbackCloser`,
      voiceUrl: webhookConfig.voiceUrl,
      voiceMethod: 'POST',
      smsUrl: webhookConfig.smsUrl,
      smsMethod: 'POST',
      statusCallback: webhookConfig.statusUrl,
      statusCallbackMethod: 'POST',
    });

    const syncedAt = new Date();
    await saveBusinessTwilioNumber(business.id, {
      phoneNumber: number.phoneNumber,
      phoneNumberSid: number.sid,
      syncedAt,
    });

    console.info('Twilio webhook sync applied', {
      phoneNumberSid: number.sid,
      phoneNumber: number.phoneNumber,
      appBaseUrl: webhookConfig.appBaseUrl,
    });

    revalidatePath('/app/settings');
    redirect('/app/settings?numberBought=1');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to buy number';
    redirect(`/app/settings?error=${encodeURIComponent(message)}`);
  }
}

export async function connectExistingTwilioNumberAction(formData: FormData) {
  const business = await getBusinessForOwner();

  try {
    const phoneNumberSid = parseTwilioPhoneNumberSid(formData);
    const selectedNumber = await pickExistingTwilioIncomingNumber(phoneNumberSid);
    const { number } = await syncTwilioIncomingPhoneNumberWebhooks(selectedNumber.sid);
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
    const { number } = await syncTwilioIncomingPhoneNumberWebhooks(business.twilioPhoneNumberSid);
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
