import { NextResponse } from 'next/server';
import { SubscriptionStatus } from '@prisma/client';

import { findBusinessByTwilioNumber } from '@/lib/business';
import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { getServicePrompt } from '@/lib/sms-state-machine';
import { isSubscriptionActive } from '@/lib/subscription';
import { sendAndPersistOutboundMessage } from '@/lib/twilio-messaging';
import { hasValidTwilioWebhookToken } from '@/lib/twilio-webhook';
import { messagingTwiML } from '@/lib/twiml';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function toInt(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMissedDialStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  return ['no-answer', 'busy', 'failed', 'canceled'].includes(normalized);
}

export async function POST(request: Request) {
  if (!hasValidTwilioWebhookToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const payload = Object.fromEntries(formData.entries()) as Record<string, string>;
  const to = normalizePhoneNumber(formField(formData, 'To'));
  const from = normalizePhoneNumber(formField(formData, 'From'));
  const callSid = formField(formData, 'CallSid');
  const dialCallSid = formField(formData, 'DialCallSid') || null;
  const dialCallStatus = formField(formData, 'DialCallStatus') || '';

  if (!to || !callSid) {
    return new NextResponse(messagingTwiML(), { headers: { 'Content-Type': 'text/xml' } });
  }

  const business = await findBusinessByTwilioNumber(to);
  if (!business) {
    return new NextResponse(messagingTwiML(), { headers: { 'Content-Type': 'text/xml' } });
  }

  const answered = dialCallStatus.trim().toLowerCase() === 'completed';
  const missed = isMissedDialStatus(dialCallStatus);

  const call = await db.call.upsert({
    where: { twilioCallSid: callSid },
    create: {
      businessId: business.id,
      twilioCallSid: callSid,
      parentCallSid: formField(formData, 'ParentCallSid') || null,
      dialCallSid,
      fromPhone: from || formField(formData, 'From'),
      fromPhoneNormalized: from || formField(formData, 'From'),
      toPhone: to || formField(formData, 'To'),
      toPhoneNormalized: to || formField(formData, 'To'),
      dialCallStatus: dialCallStatus || null,
      status: answered ? 'ANSWERED' : missed ? 'MISSED' : 'COMPLETED',
      callDurationSeconds: toInt(formField(formData, 'CallDuration')),
      dialCallDurationSeconds: toInt(formField(formData, 'DialCallDuration')),
      answered,
      missed,
      rawPayload: payload,
    },
    update: {
      parentCallSid: formField(formData, 'ParentCallSid') || undefined,
      dialCallSid,
      dialCallStatus: dialCallStatus || null,
      status: answered ? 'ANSWERED' : missed ? 'MISSED' : 'COMPLETED',
      callDurationSeconds: toInt(formField(formData, 'CallDuration')),
      dialCallDurationSeconds: toInt(formField(formData, 'DialCallDuration')),
      answered,
      missed,
      rawPayload: payload,
    },
  });

  if (!missed) {
    return new NextResponse(messagingTwiML(), { headers: { 'Content-Type': 'text/xml' } });
  }

  const callerPhone = from || formField(formData, 'From');
  const callerPhoneNormalized = normalizePhoneNumber(callerPhone) || callerPhone;

  let lead = await db.lead.findUnique({ where: { callId: call.id } });
  if (!lead) {
    lead = await db.lead.create({
      data: {
        businessId: business.id,
        callId: call.id,
        callerPhone,
        callerPhoneNormalized,
        billingRequired: !isSubscriptionActive(business.subscriptionStatus),
        smsState: 'NOT_STARTED',
        lastInteractionAt: new Date(),
      },
    });
  }

  if (!isSubscriptionActive(business.subscriptionStatus)) {
    if (!lead.billingRequired) {
      await db.lead.update({ where: { id: lead.id }, data: { billingRequired: true } });
    }
    return new NextResponse(messagingTwiML(), { headers: { 'Content-Type': 'text/xml' } });
  }

  if (!business.twilioPhoneNumber || lead.smsStartedAt) {
    return new NextResponse(messagingTwiML(), { headers: { 'Content-Type': 'text/xml' } });
  }

  try {
    const prompt = getServicePrompt(business);
    await sendAndPersistOutboundMessage({
      businessId: business.id,
      leadId: lead.id,
      fromPhone: business.twilioPhoneNumber,
      toPhone: callerPhoneNormalized,
      body: prompt,
    });

    await db.lead.update({
      where: { id: lead.id },
      data: {
        billingRequired: false,
        smsState: 'AWAITING_SERVICE',
        smsStartedAt: new Date(),
        lastOutboundAt: new Date(),
        lastInteractionAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Failed to send initial missed-call SMS', error);
    await db.lead.update({
      where: { id: lead.id },
      data: {
        billingRequired: business.subscriptionStatus !== SubscriptionStatus.ACTIVE,
        lastInteractionAt: new Date(),
      },
    });
  }

  return new NextResponse(messagingTwiML(), { headers: { 'Content-Type': 'text/xml' } });
}
