import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getCorrelationIdFromRequest, withCorrelationIdHeader } from '@/lib/observability';
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
      },
    });

    if (!message) {
      logTwilioWarn('sms', 'message_status_message_not_found', {
        messageSid,
        correlationId,
        eventType: 'message_status_callback',
        decision: 'noop_message_not_found',
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
