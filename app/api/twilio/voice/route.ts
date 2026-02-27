import { NextResponse } from 'next/server';

import { findBusinessByTwilioNumber } from '@/lib/business';
import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { buildDialRecordingOptions } from '@/lib/twilio-recording';
import { hasValidTwilioWebhookRequest } from '@/lib/twilio-webhook';
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
  let callSid: string | null = null;
  try {
    const formData = await request.formData();
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;

    if (!hasValidTwilioWebhookRequest(request, payload)) {
      logTwilioWarn('voice', 'webhook_unauthorized', { decision: 'reject_401' });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const to = normalizePhoneNumber(formField(formData, 'To'));
    const from = normalizePhoneNumber(formField(formData, 'From'));
    callSid = formField(formData, 'CallSid') || null;

    logTwilioInfo('voice', 'webhook_received', {
      callSid,
      eventType: 'incoming_call',
      decision: 'processing',
    });

    const business = to ? await findBusinessByTwilioNumber(to) : null;
    if (!business) {
      logTwilioWarn('voice', 'business_not_found', {
        callSid,
        eventType: 'incoming_call',
        decision: 'respond_not_configured',
      });

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

      logTwilioInfo('voice', 'call_persisted', {
        callSid,
        eventType: 'incoming_call',
        businessId: business.id,
        decision: 'upsert_call',
      });
    }

    const actionUrl = withWebhookToken(absoluteUrl('/api/twilio/status'));
    const xml = voiceTwiML((response) => {
      const dial = response.dial({
        timeout: business.missedCallSeconds,
        action: actionUrl,
        method: 'POST',
        callerId: business.twilioPhoneNumber || undefined,
        ...buildDialRecordingOptions(actionUrl),
      });
      dial.number(business.forwardingNumber);
    });

    logTwilioInfo('voice', 'twiml_returned', {
      callSid,
      eventType: 'incoming_call',
      businessId: business.id,
      decision: 'dial_forwarding_number_with_recording',
    });

    return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } });
  } catch (error) {
    logTwilioError('voice', 'route_error', { callSid, eventType: 'incoming_call', decision: 'fallback_hangup' }, error);
    const xml = voiceTwiML((response) => {
      response.say('Sorry, we are having trouble connecting your call right now.');
      response.hangup();
    });
    return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } });
  }
}
