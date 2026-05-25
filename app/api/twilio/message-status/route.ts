import { NextResponse } from 'next/server';

import { findBusinessByTwilioNumber } from '@/lib/business';
import { db } from '@/lib/db';
import { getCorrelationIdFromRequest, withCorrelationIdHeader } from '@/lib/observability';
import { normalizePhoneNumber, normalizePhoneNumberToE164 } from '@/lib/phone';
import {
  buildOutboundMessageStatusEvent,
  isTerminalOutboundMessageStatus,
  normalizeOutboundMessageStatus,
} from '@/lib/outbound-message-events';
import { formatPhoneDetail, recordBusinessOperatorEvent } from '@/lib/operator-events';
import { RATE_LIMIT_TWILIO_AUTH_MAX, RATE_LIMIT_TWILIO_UNAUTH_MAX, RATE_LIMIT_WINDOW_MS } from '@/lib/rate-limit-config';
import { buildRateLimitHeaders, consumeRateLimit, getClientIpAddress } from '@/lib/rate-limit';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { hasValidTwilioWebhookRequest } from '@/lib/twilio-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function okResponse() {
  return new NextResponse(null, { status: 200 });
}

async function findFallbackAdminTestMessage(params: {
  fromPhone: string | null;
  toPhone: string | null;
  messagingServiceSid: string | null;
}) {
  const { fromPhone, toPhone, messagingServiceSid } = params;
  if (!fromPhone || !toPhone) {
    return null;
  }

  const business =
    (messagingServiceSid
      ? await db.business.findFirst({
          where: { twilioMessagingServiceSid: messagingServiceSid },
          select: { id: true },
        })
      : null) || (await findBusinessByTwilioNumber(fromPhone));

  if (!business) {
    return null;
  }

  return db.message.findFirst({
    where: {
      businessId: business.id,
      leadId: null,
      direction: 'OUTBOUND',
      participant: 'OWNER',
      fromPhone,
      toPhone,
      OR: [{ body: { startsWith: 'CallbackCloser admin test:' } }, { body: { startsWith: 'CallbackCloser setup test:' } }],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      businessId: true,
      leadId: true,
      participant: true,
      body: true,
      fromPhone: true,
      toPhone: true,
      status: true,
      rawPayload: true,
    },
  });
}

export async function POST(request: Request) {
  let messageSid: string | null = null;
  const correlationId = getCorrelationIdFromRequest(request);
  const withCorrelation = (response: Response) => withCorrelationIdHeader(response, correlationId);

  try {
    const formData = await request.formData();
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;
    const clientIp = getClientIpAddress(request);
    const accountSid = formField(formData, 'AccountSid');

    const authorized = await hasValidTwilioWebhookRequest(request, payload);
    if (!authorized) {
      const rateLimit = consumeRateLimit({
        key: `twilio:message-status:unauth:${clientIp}`,
        limit: RATE_LIMIT_TWILIO_UNAUTH_MAX,
        windowMs: RATE_LIMIT_WINDOW_MS,
      });
      if (!rateLimit.allowed) {
        logTwilioWarn('sms', 'message_status_unauthorized_rate_limited', {
          correlationId,
          eventType: 'message_status_callback',
          decision: 'reject_429',
          clientIp,
        });
        return withCorrelation(
          new NextResponse(JSON.stringify({ error: 'Too many unauthorized requests' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', ...buildRateLimitHeaders(rateLimit) },
          })
        );
      }

      logTwilioWarn('sms', 'message_status_unauthorized', {
        correlationId,
        eventType: 'message_status_callback',
        decision: 'reject_401',
      });
      return withCorrelation(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    const authRateLimit = consumeRateLimit({
      key: `twilio:message-status:auth:${accountSid || clientIp}`,
      limit: RATE_LIMIT_TWILIO_AUTH_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!authRateLimit.allowed) {
      logTwilioWarn('sms', 'message_status_rate_limited', {
        correlationId,
        eventType: 'message_status_callback',
        decision: 'reject_429',
        accountSid: accountSid || null,
        clientIp,
      });
      return withCorrelation(
        new NextResponse(null, {
          status: 429,
          headers: buildRateLimitHeaders(authRateLimit),
        })
      );
    }

    messageSid = formField(formData, 'MessageSid') || formField(formData, 'SmsSid') || null;
    const messageStatus = normalizeOutboundMessageStatus(formField(formData, 'MessageStatus') || formField(formData, 'SmsStatus'));
    const toPhone = normalizePhoneNumberToE164(formField(formData, 'To')) || normalizePhoneNumber(formField(formData, 'To'));
    const fromPhone = normalizePhoneNumberToE164(formField(formData, 'From')) || normalizePhoneNumber(formField(formData, 'From'));
    const messagingServiceSid = formField(formData, 'MessagingServiceSid') || null;
    const errorCode = formField(formData, 'ErrorCode') || null;
    const errorMessage = formField(formData, 'ErrorMessage') || null;

    logTwilioInfo('sms', 'message_status_received', {
      messageSid,
      correlationId,
      eventType: 'message_status_callback',
      messageStatus,
      decision: 'processing',
    });

    if (!messageSid || !messageStatus) {
      logTwilioWarn('sms', 'message_status_missing_fields', {
        messageSid,
        correlationId,
        eventType: 'message_status_callback',
        decision: 'noop_missing_message_sid_or_status',
      });
      return withCorrelation(okResponse());
    }

    const message = await db.message.findUnique({
      where: { twilioSid: messageSid },
      select: {
        id: true,
        businessId: true,
        leadId: true,
        participant: true,
        body: true,
        fromPhone: true,
        toPhone: true,
        status: true,
        rawPayload: true,
      },
    }) || (await findFallbackAdminTestMessage({ fromPhone, toPhone, messagingServiceSid }));

    if (!message) {
      logTwilioWarn('sms', 'message_status_message_not_found', {
        messageSid,
        correlationId,
        eventType: 'message_status_callback',
        decision: 'noop_message_not_found',
        toPhone,
        fromPhone,
        messagingServiceSid,
      });
      return withCorrelation(okResponse());
    }

    const previousStatus = normalizeOutboundMessageStatus(message.status);
    await db.message.update({
      where: { id: message.id },
      data: {
        status: messageStatus,
      },
    });

    if (previousStatus !== messageStatus && isTerminalOutboundMessageStatus(messageStatus)) {
      const event = buildOutboundMessageStatusEvent(message, messageStatus);
      if (event) {
        await recordBusinessOperatorEvent({
          businessId: message.businessId,
          type: event.type,
          category: event.category,
          status: event.status,
          summary: event.summary,
          details: {
          messageSid,
          messageStatus,
          toPhone: formatPhoneDetail(message.toPhone),
          fromPhone: formatPhoneDetail(message.fromPhone),
          callbackToPhone: formatPhoneDetail(toPhone),
          callbackFromPhone: formatPhoneDetail(fromPhone),
          messagingServiceSid,
          errorCode,
          errorMessage,
        },
        relatedEntityType: message.leadId ? 'lead' : 'message',
        relatedEntityId: message.leadId ?? message.id,
        });
      }
    }

    logTwilioInfo('sms', 'message_status_persisted', {
      messageSid,
      correlationId,
      eventType: 'message_status_callback',
      businessId: message.businessId,
      previousStatus,
      messageStatus,
      decision: previousStatus === messageStatus ? 'noop_duplicate_status' : 'persist_status_update',
    });

    return withCorrelation(okResponse());
  } catch (error) {
    logTwilioError(
      'sms',
      'message_status_route_error',
      {
        messageSid,
        correlationId,
        eventType: 'message_status_callback',
        decision: 'return_retryable_500',
      },
      error
    );
    return withCorrelation(NextResponse.json({ error: 'Message status callback failed' }, { status: 500 }));
  }
}
