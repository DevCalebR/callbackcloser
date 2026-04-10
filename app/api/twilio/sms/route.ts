import { NextResponse } from 'next/server';

import { findBusinessByTwilioNumber } from '@/lib/business';
import { db } from '@/lib/db';
import { getCorrelationIdFromRequest, withCorrelationIdHeader } from '@/lib/observability';
import { normalizePhoneNumber } from '@/lib/phone';
import { RATE_LIMIT_TWILIO_AUTH_MAX, RATE_LIMIT_TWILIO_UNAUTH_MAX, RATE_LIMIT_WINDOW_MS } from '@/lib/rate-limit-config';
import { buildRateLimitHeaders, consumeRateLimit, getClientIpAddress } from '@/lib/rate-limit';
import { processLeadInboundReply } from '@/lib/missed-call-flow';
import { isSubscriptionActive } from '@/lib/subscription';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { handleInboundSmsComplianceCommand } from '@/lib/twilio-sms-compliance';
import {
  persistInboundMessage,
} from '@/lib/twilio-messaging';
import { buildTwilioRetryableErrorResponse } from '@/lib/twilio-webhook-retry';
import { hasValidTwilioWebhookRequest } from '@/lib/twilio-webhook';
import { messagingTwiML } from '@/lib/twiml';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function xmlOk(message?: string) {
  return new NextResponse(
    messagingTwiML((response) => {
      if (message) response.message(message);
    }),
    { headers: { 'Content-Type': 'text/xml' } }
  );
}

function retryableErrorResponse() {
  return buildTwilioRetryableErrorResponse('sms');
}

function rateLimitSmsResponse(retryAfterSeconds: number) {
  return new NextResponse(messagingTwiML(), {
    status: 429,
    headers: {
      'Content-Type': 'text/xml',
      'Retry-After': String(retryAfterSeconds),
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

    const authorized = hasValidTwilioWebhookRequest(request, payload);
    if (!authorized) {
      const rateLimit = consumeRateLimit({
        key: `twilio:sms:unauth:${clientIp}`,
        limit: RATE_LIMIT_TWILIO_UNAUTH_MAX,
        windowMs: RATE_LIMIT_WINDOW_MS,
      });
      if (!rateLimit.allowed) {
        logTwilioWarn('sms', 'webhook_unauthorized_rate_limited', {
          correlationId,
          eventType: 'inbound_sms',
          decision: 'reject_429',
          clientIp,
        });
        return withCorrelation(new NextResponse(
          JSON.stringify({ error: 'Too many unauthorized requests' }),
          { status: 429, headers: { 'Content-Type': 'application/json', ...buildRateLimitHeaders(rateLimit) } }
        ));
      }

      logTwilioWarn('sms', 'webhook_unauthorized', { correlationId, decision: 'reject_401' });
      return withCorrelation(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    const authRateLimit = consumeRateLimit({
      key: `twilio:sms:auth:${accountSid || clientIp}`,
      limit: RATE_LIMIT_TWILIO_AUTH_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!authRateLimit.allowed) {
      logTwilioWarn('sms', 'webhook_rate_limited', {
        correlationId,
        eventType: 'inbound_sms',
        decision: 'reject_429',
        accountSid: accountSid || null,
        clientIp,
      });
      const response = rateLimitSmsResponse(authRateLimit.retryAfterSeconds);
      Object.entries(buildRateLimitHeaders(authRateLimit)).forEach(([name, value]) => {
        response.headers.set(name, value);
      });
      return withCorrelation(response);
    }

    const to = normalizePhoneNumber(formField(formData, 'To'));
    const from = normalizePhoneNumber(formField(formData, 'From'));
    const body = formField(formData, 'Body');
    messageSid = formField(formData, 'MessageSid') || formField(formData, 'SmsSid') || null;

    logTwilioInfo('sms', 'webhook_received', {
      messageSid,
      correlationId,
      eventType: 'inbound_sms',
      decision: 'processing',
    });

    if (!to || !from) {
      logTwilioWarn('sms', 'missing_required_fields', {
        messageSid,
        correlationId,
        eventType: 'inbound_sms',
        decision: 'noop_missing_to_or_from',
      });
      return withCorrelation(xmlOk());
    }

    const business = await findBusinessByTwilioNumber(to);
    if (!business) {
      logTwilioWarn('sms', 'business_not_found', {
        messageSid,
        correlationId,
        eventType: 'inbound_sms',
        decision: 'noop_business_not_found',
      });
      return withCorrelation(xmlOk());
    }

    const inbound = await persistInboundMessage({
      businessId: business.id,
      leadId: null,
      twilioSid: messageSid || null,
      fromPhone: from,
      toPhone: to,
      body,
      rawPayload: payload,
    });

    const compliance = await handleInboundSmsComplianceCommand({
      businessId: business.id,
      fromPhone: from,
      body,
      messageSid,
      appName: 'CallbackCloser',
    });

    if (compliance.handled) {
      logTwilioInfo('sms', 'compliance_keyword_handled', {
        messageSid,
        correlationId,
        eventType: 'inbound_sms',
        businessId: business.id,
        command: compliance.command,
        stateChange: compliance.stateChange,
        duplicateInbound: inbound.duplicate,
        decision: 'reply_compliance_message',
      });
      return withCorrelation(xmlOk(compliance.replyText));
    }

    if (inbound.duplicate) {
      logTwilioInfo('sms', 'duplicate_message_retry', {
        messageSid,
        correlationId,
        eventType: 'inbound_sms',
        businessId: business.id,
        leadId: null,
        decision: 'noop_duplicate',
      });
      return withCorrelation(xmlOk());
    }

    const lead =
      (await db.lead.findFirst({
        where: {
          businessId: business.id,
          callerPhoneNormalized: from,
          smsState: { not: 'COMPLETED' },
        },
        orderBy: { createdAt: 'desc' },
      })) ||
      (await db.lead.findFirst({
        where: { businessId: business.id, callerPhoneNormalized: from },
        orderBy: { createdAt: 'desc' },
      }));

    if (!lead) {
      logTwilioInfo('sms', 'no_matching_lead', {
        messageSid,
        correlationId,
        eventType: 'inbound_sms',
        businessId: business.id,
        decision: 'noop_no_lead_thread',
      });
      return withCorrelation(xmlOk());
    }

    await db.message.update({
      where: { id: inbound.message.id },
      data: { leadId: lead.id },
    });

    await db.lead.update({
      where: { id: lead.id },
      data: {
        lastInboundAt: new Date(),
        lastInteractionAt: new Date(),
      },
    });

    const businessTextingNumber = business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber;
    if (!isSubscriptionActive(business) || lead.billingRequired || !businessTextingNumber) {
      logTwilioInfo('sms', 'automation_blocked', {
        messageSid,
        correlationId,
        eventType: 'inbound_sms',
        businessId: business.id,
        leadId: lead.id,
        decision: !isSubscriptionActive(business)
          ? 'noop_billing_inactive'
          : lead.billingRequired
            ? 'noop_billing_required'
            : 'noop_missing_twilio_number',
      });
      return withCorrelation(xmlOk());
    }

    const result = await processLeadInboundReply({
      business,
      leadId: lead.id,
      body,
      fromPhone: from,
      toPhone: to,
      twilioSid: messageSid || null,
      rawPayload: payload,
      transport: 'twilio',
      skipInboundPersist: true,
    });
    const updatedLead = result.lead;
    const transition = result.transition;

    if (!transition) {
      logTwilioInfo('sms', 'duplicate_message_retry', {
        messageSid,
        correlationId,
        eventType: 'inbound_sms',
        businessId: business.id,
        leadId: lead.id,
        decision: 'noop_duplicate_after_processing',
      });
      return withCorrelation(xmlOk());
    }

    logTwilioInfo('sms', 'state_machine_transition', {
      messageSid,
      correlationId,
      eventType: 'inbound_sms',
      businessId: business.id,
      leadId: updatedLead.id,
      decision: transition.ok ? 'advance_conversation' : 'validation_retry_prompt',
      nextState: transition.nextState ?? updatedLead.smsState,
      notifyOwner: Boolean(result.notificationResult?.notified),
      completed: Boolean(transition.completed),
    });

    return withCorrelation(xmlOk());
  } catch (error) {
    logTwilioError('sms', 'route_error', { messageSid, correlationId, eventType: 'inbound_sms', decision: 'return_retryable_503' }, error);
    return withCorrelation(retryableErrorResponse());
  }
}
