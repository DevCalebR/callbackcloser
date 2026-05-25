import { NextResponse } from 'next/server';
import { BusinessPhoneSetupPath, ForwardedCallAnswerMode, ForwardingVerificationStatus } from '@prisma/client';

import { findBusinessByTwilioNumber } from '@/lib/business';
import { getBusinessRoutingNumber } from '@/lib/business-phone-setup';
import { db } from '@/lib/db';
import { getCorrelationIdFromRequest, withCorrelationIdHeader } from '@/lib/observability';
import { formatPhoneDetail, recordBusinessOperatorEvent } from '@/lib/operator-events';
import { normalizePhoneNumber, normalizePhoneNumberToE164 } from '@/lib/phone';
import { buildRateLimitHeaders, consumeRateLimit, getClientIpAddress } from '@/lib/rate-limit';
import { RATE_LIMIT_TWILIO_AUTH_MAX, RATE_LIMIT_TWILIO_UNAUTH_MAX, RATE_LIMIT_WINDOW_MS } from '@/lib/rate-limit-config';
import { buildDialRecordingOptions } from '@/lib/twilio-recording';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { hasValidTwilioWebhookRequest, isTwilioSignatureValidationEnabled } from '@/lib/twilio-webhook';
import { voiceTwiML } from '@/lib/twiml';
import { absoluteUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OWNER_SCREEN_STAGE = 'screen-forwarded-call';
const OWNER_SCREEN_RESULT_STAGE = 'screen-forwarded-call-result';

function formField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function withWebhookToken(url: string) {
  if (isTwilioSignatureValidationEnabled()) {
    return url;
  }

  const token = process.env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim();
  if (!token) return url;
  const next = new URL(url);
  next.searchParams.set('webhook_token', token);
  return next.toString();
}

function rateLimitVoiceResponse(retryAfterSeconds: number) {
  const xml = voiceTwiML((response) => {
    response.say('Too many requests. Please try again shortly.');
    response.hangup();
  });
  return new NextResponse(xml, {
    status: 429,
    headers: {
      'Content-Type': 'text/xml',
      'Retry-After': String(retryAfterSeconds),
    },
  });
}

function getStage(request: Request) {
  return new URL(request.url).searchParams.get('stage')?.trim() || null;
}

function getQueryParam(request: Request, key: string) {
  return new URL(request.url).searchParams.get(key)?.trim() || '';
}

export async function POST(request: Request) {
  let callSid: string | null = null;
  const correlationId = getCorrelationIdFromRequest(request);
  const withCorrelation = (response: NextResponse) => withCorrelationIdHeader(response, correlationId);

  try {
    const formData = await request.formData();
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;
    const clientIp = getClientIpAddress(request);
    const stage = getStage(request);

    const authorized = await hasValidTwilioWebhookRequest(request, payload);
    if (!authorized) {
      const rateLimit = consumeRateLimit({
        key: `twilio:voice:unauth:${clientIp}`,
        limit: RATE_LIMIT_TWILIO_UNAUTH_MAX,
        windowMs: RATE_LIMIT_WINDOW_MS,
      });
      if (!rateLimit.allowed) {
        logTwilioWarn('voice', 'webhook_unauthorized_rate_limited', {
          callSid,
          correlationId,
          eventType: stage ? 'call_screening' : 'incoming_call',
          decision: 'reject_429',
          clientIp,
        });
        return withCorrelation(new NextResponse(JSON.stringify({ error: 'Too many unauthorized requests' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', ...buildRateLimitHeaders(rateLimit) },
        }));
      }

      logTwilioWarn('voice', 'webhook_unauthorized', { correlationId, decision: 'reject_401' });
      return withCorrelation(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    const to = normalizePhoneNumberToE164(formField(formData, 'To')) || normalizePhoneNumber(formField(formData, 'To'));
    const from = normalizePhoneNumberToE164(formField(formData, 'From')) || normalizePhoneNumber(formField(formData, 'From'));
    callSid = formField(formData, 'CallSid') || null;
    const accountSid = formField(formData, 'AccountSid');

    const rateLimit = consumeRateLimit({
      key: `twilio:voice:auth:${accountSid || clientIp}`,
      limit: RATE_LIMIT_TWILIO_AUTH_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!rateLimit.allowed) {
      logTwilioWarn('voice', 'webhook_rate_limited', {
        callSid,
        correlationId,
        eventType: stage ? 'call_screening' : 'incoming_call',
        decision: 'reject_429',
        accountSid: accountSid || null,
        clientIp,
      });
      const response = rateLimitVoiceResponse(rateLimit.retryAfterSeconds);
      Object.entries(buildRateLimitHeaders(rateLimit)).forEach(([name, value]) => {
        response.headers.set(name, value);
      });
      return withCorrelation(response);
    }

    logTwilioInfo('voice', 'webhook_received', {
      callSid,
      correlationId,
      eventType: stage ? 'call_screening' : 'incoming_call',
      decision: 'processing',
    });

    if (stage === OWNER_SCREEN_STAGE) {
      const parentCallSid = getQueryParam(request, 'parentCallSid') || formField(formData, 'ParentCallSid') || callSid || '';
      const businessId = getQueryParam(request, 'businessId');
      const actionUrl = withWebhookToken(
        absoluteUrl(
          `/api/twilio/voice?stage=${OWNER_SCREEN_RESULT_STAGE}&businessId=${encodeURIComponent(businessId)}&parentCallSid=${encodeURIComponent(parentCallSid)}`
        )
      );

      const xml = voiceTwiML((response) => {
        const gather = response.gather({
          action: actionUrl,
          method: 'POST',
          numDigits: 1,
          timeout: 6,
          actionOnEmptyResult: true,
        });
        gather.say('CallbackCloser forwarded call. Press 1 to accept this caller.');
        response.say('No confirmation received. Goodbye.');
        response.hangup();
      });

      return withCorrelation(new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } }));
    }

    if (stage === OWNER_SCREEN_RESULT_STAGE) {
      const parentCallSid = getQueryParam(request, 'parentCallSid') || formField(formData, 'ParentCallSid') || '';
      const businessId = getQueryParam(request, 'businessId');
      const digits = formField(formData, 'Digits').trim();
      const confirmed = digits === '1';
      const existingCall = parentCallSid
        ? await db.call.findUnique({
            where: { twilioCallSid: parentCallSid },
            select: { id: true, businessId: true },
          })
        : null;
      const resolvedBusinessId = businessId || existingCall?.businessId || null;

      if (confirmed && existingCall) {
        await db.call.update({
          where: { id: existingCall.id },
          data: {
            answered: true,
            missed: false,
            humanAccepted: true,
            humanAcceptedAt: new Date(),
            status: 'ANSWERED',
            rawPayload: payload,
          },
        });
      }

      if (confirmed && resolvedBusinessId) {
        await recordBusinessOperatorEvent({
          businessId: resolvedBusinessId,
          type: 'voice.human_accepted_call',
          category: 'VOICE',
          status: 'SUCCESS',
          summary: 'Human accepted forwarded call',
          details: {
            callSid: parentCallSid || callSid,
            screeningCallSid: callSid,
            reason: 'pressed_1',
          },
          relatedEntityType: existingCall ? 'call' : null,
          relatedEntityId: existingCall?.id ?? null,
        });
      }

      const xml = voiceTwiML((response) => {
        if (confirmed) {
          response.say('Connecting you now.');
          return;
        }

        response.say('No confirmation received. Goodbye.');
        response.hangup();
      });

      return withCorrelation(new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } }));
    }

    const business = to ? await findBusinessByTwilioNumber(to) : null;
    if (!business) {
      logTwilioWarn('voice', 'business_not_found', {
        callSid,
        correlationId,
        eventType: 'incoming_call',
        decision: 'respond_not_configured',
      });

      const xml = voiceTwiML((response) => {
        response.say('Sorry, this number is not configured.');
        response.hangup();
      });
      return withCorrelation(new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } }));
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
          answerConfirmationRequested: business.forwardedCallAnswerMode === ForwardedCallAnswerMode.PRESS_1_REQUIRED,
          status: 'RECEIVED',
          rawPayload: payload,
        },
        update: {
          parentCallSid: formField(formData, 'ParentCallSid') || undefined,
          answerConfirmationRequested: business.forwardedCallAnswerMode === ForwardedCallAnswerMode.PRESS_1_REQUIRED,
          rawPayload: payload,
        },
      });

      await recordBusinessOperatorEvent({
        businessId: business.id,
        type: 'voice.inbound_call_received',
        category: 'VOICE',
        status: 'INFO',
        summary: 'Inbound call received',
        details: {
          fromPhone: formatPhoneDetail(from || formField(formData, 'From')),
          toPhone: formatPhoneDetail(to || formField(formData, 'To')),
          callSid,
        },
        relatedEntityType: 'call',
        relatedEntityId: callSid,
      });

      logTwilioInfo('voice', 'call_persisted', {
        callSid,
        correlationId,
        eventType: 'incoming_call',
        businessId: business.id,
        decision: 'upsert_call',
      });
    }

    if (
      business.phoneSetupPath === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING &&
      business.forwardingVerificationStatus !== ForwardingVerificationStatus.VERIFIED
    ) {
      const verifiedAt = new Date();
      const routingNumber = getBusinessRoutingNumber(business);

      await db.business.update({
        where: { id: business.id },
        data: {
          forwardingVerificationStatus: ForwardingVerificationStatus.VERIFIED,
          forwardingVerifiedAt: verifiedAt,
          forwardingVerificationNote:
            business.forwardingVerificationNote ||
            `Verified automatically after an inbound call reached ${routingNumber || 'the CallbackCloser routing number'}.`,
        },
      });

      await recordBusinessOperatorEvent({
        businessId: business.id,
        type: 'voice.forwarding_verified',
        category: 'VOICE',
        status: 'SUCCESS',
        summary: 'Current-number forwarding verified',
        details: {
          callSid,
          publicBusinessPhone: formatPhoneDetail(business.publicBusinessPhone),
          routingNumber: formatPhoneDetail(routingNumber),
        },
        relatedEntityType: 'call',
        relatedEntityId: callSid,
      });
    }

    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'voice.forwarded_call_attempted',
      category: 'VOICE',
      status: 'PENDING',
      summary: 'Forwarded call attempted',
      details: {
        callSid,
        fromPhone: formatPhoneDetail(from || formField(formData, 'From')),
        answerMode: business.forwardedCallAnswerMode,
        forwardingNumber: formatPhoneDetail(business.forwardingNumber),
      },
      relatedEntityType: 'call',
      relatedEntityId: callSid,
    });

    const actionUrl = withWebhookToken(absoluteUrl('/api/twilio/status'));
    const ownerScreeningUrl = withWebhookToken(
      absoluteUrl(
        `/api/twilio/voice?stage=${OWNER_SCREEN_STAGE}&businessId=${encodeURIComponent(business.id)}&parentCallSid=${encodeURIComponent(callSid || '')}`
      )
    );
    const xml = voiceTwiML((response) => {
      const dial = response.dial({
        timeout: business.missedCallSeconds,
        action: actionUrl,
        method: 'POST',
        answerOnBridge: business.forwardedCallAnswerMode === ForwardedCallAnswerMode.PRESS_1_REQUIRED,
        callerId: business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || undefined,
        ...buildDialRecordingOptions(actionUrl),
      });

      if (business.forwardedCallAnswerMode === ForwardedCallAnswerMode.PRESS_1_REQUIRED) {
        dial.number(
          {
            url: ownerScreeningUrl,
            method: 'POST',
          },
          business.forwardingNumber
        );
      } else {
        dial.number(business.forwardingNumber);
      }
    });

    logTwilioInfo('voice', 'twiml_returned', {
      callSid,
      correlationId,
      eventType: 'incoming_call',
      businessId: business.id,
      decision:
        business.forwardedCallAnswerMode === ForwardedCallAnswerMode.PRESS_1_REQUIRED
          ? 'dial_forwarding_number_with_press_1_screening'
          : 'dial_forwarding_number_with_recording',
    });

    return withCorrelation(new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } }));
  } catch (error) {
    logTwilioError(
      'voice',
      'route_error',
      { callSid, correlationId, eventType: 'incoming_call', decision: 'fallback_hangup' },
      error
    );
    const xml = voiceTwiML((response) => {
      response.say('Sorry, we are having trouble connecting your call right now.');
      response.hangup();
    });
    return withCorrelation(new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } }));
  }
}
