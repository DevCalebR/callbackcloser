import { NextResponse } from 'next/server';

import { findBusinessByTwilioNumber } from '@/lib/business';
import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { hasValidTwilioWebhookToken } from '@/lib/twilio-webhook';
import { voiceTwiML } from '@/lib/twiml';
import { absoluteUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function withWebhookToken(url: string) {
  const token = process.env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim();
  if (!token) return url;
  const next = new URL(url);
  next.searchParams.set('webhook_token', token);
  return next.toString();
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

  const business = to ? await findBusinessByTwilioNumber(to) : null;
  if (!business) {
    const xml = voiceTwiML((response) => {
      response.say('Sorry, this number is not configured.');
      response.hangup();
    });
    return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } });
  }

  if (callSid) {
    await db.call.upsert({
      where: { twilioCallSid: callSid },
      create: {
        businessId: business.id,
        twilioCallSid: callSid,
        parentCallSid: formField(formData, 'ParentCallSid') || null,
        fromPhone: from || formField(formData, 'From'),
        fromPhoneNormalized: from || formField(formData, 'From'),
        toPhone: to || formField(formData, 'To'),
        toPhoneNormalized: to || formField(formData, 'To'),
        status: 'RECEIVED',
        rawPayload: payload,
      },
      update: {
        parentCallSid: formField(formData, 'ParentCallSid') || undefined,
        rawPayload: payload,
      },
    });
  }

  const actionUrl = withWebhookToken(absoluteUrl('/api/twilio/status'));
  const xml = voiceTwiML((response) => {
    const dial = response.dial({
      timeout: business.missedCallSeconds,
      action: actionUrl,
      method: 'POST',
      callerId: business.twilioPhoneNumber || undefined,
    });
    dial.number(business.forwardingNumber);
  });

  return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } });
}
