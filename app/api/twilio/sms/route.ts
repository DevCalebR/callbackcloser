import { LeadStatus } from '@prisma/client';
import { NextResponse } from 'next/server';

import { findBusinessByTwilioNumber } from '@/lib/business';
import { db } from '@/lib/db';
import { getCorrelationIdFromRequest, withCorrelationIdHeader } from '@/lib/observability';
import { normalizePhoneNumber } from '@/lib/phone';
import { RATE_LIMIT_TWILIO_AUTH_MAX, RATE_LIMIT_TWILIO_UNAUTH_MAX, RATE_LIMIT_WINDOW_MS } from '@/lib/rate-limit-config';
import { buildRateLimitHeaders, consumeRateLimit, getClientIpAddress } from '@/lib/rate-limit';
import { advanceLeadConversation } from '@/lib/sms-state-machine';
import { isSubscriptionActive } from '@/lib/subscription';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { handleInboundSmsComplianceCommand } from '@/lib/twilio-sms-compliance';
import { buildOwnerNotificationMessage, persistInboundMessage, sendAndPersistOutboundMessage } from '@/lib/twilio-messaging';
import { buildTwilioRetryableErrorResponse } from '@/lib/twilio-webhook-retry';
import { hasValidTwilioWebhookRequest } from '@/lib/twilio-webhook';
import { messagingTwiML } from '@/lib/twiml';
import { absoluteUrl } from '@/lib/url';

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

    if (!isSubscriptionActive(business.subscriptionStatus) || lead.billingRequired || !business.twilioPhoneNumber) {
      logTwilioInfo('sms', 'automation_blocked', {
        messageSid,
        correlationId,
        eventType: 'inbound_sms',
        businessId: business.id,
        leadId: lead.id,
        decision: !isSubscriptionActive(business.subscriptionStatus)
          ? 'noop_billing_inactive'
          : lead.billingRequired
            ? 'noop_billing_required'
            : 'noop_missing_twilio_number',
      });
      return withCorrelation(xmlOk());
    }

    const transition = advanceLeadConversation(lead, body, business);
    const now = new Date();
    const updatedLead = await db.lead.update({
      where: { id: lead.id },
      data: {
        ...(transition.nextState ? { smsState: transition.nextState } : {}),
        ...(transition.leadUpdates ?? {}),
        ...(transition.markQualified && lead.status === 'NEW' ? { status: LeadStatus.QUALIFIED } : {}),
        ...(transition.completed ? { smsCompletedAt: now } : {}),
        lastInboundAt: now,
        lastInteractionAt: now,
      },
    });

    logTwilioInfo('sms', 'state_machine_transition', {
      messageSid,
      correlationId,
      eventType: 'inbound_sms',
      businessId: business.id,
      leadId: updatedLead.id,
      decision: transition.ok ? 'advance_conversation' : 'validation_retry_prompt',
      nextState: transition.nextState ?? updatedLead.smsState,
      notifyOwner: Boolean(transition.notifyOwner),
      completed: Boolean(transition.completed),
    });

    if (transition.notifyOwner && !updatedLead.ownerNotifiedAt && business.notifyPhone) {
      try {
        const leadUrl = absoluteUrl(`/app/leads/${updatedLead.id}`);
        const ownerMsg = buildOwnerNotificationMessage({
          businessName: business.name,
          leadId: updatedLead.id,
          callerPhone: updatedLead.callerPhoneNormalized,
          serviceRequested: updatedLead.serviceRequested,
          urgency: updatedLead.urgency,
          zipCode: updatedLead.zipCode,
          bestTime: updatedLead.bestTime,
          leadUrl,
        });

        const ownerSend = await sendAndPersistOutboundMessage({
          businessId: business.id,
          leadId: updatedLead.id,
          fromPhone: business.twilioPhoneNumber,
          toPhone: business.notifyPhone,
          body: ownerMsg,
          participant: 'OWNER',
        });

        if (ownerSend.suppressed) {
          logTwilioWarn('sms', 'owner_notification_suppressed', {
            messageSid,
            correlationId,
            eventType: 'inbound_sms',
            businessId: business.id,
            leadId: updatedLead.id,
            decision: 'owner_notify_suppressed_opted_out',
          });
        } else {
          await db.lead.update({
            where: { id: updatedLead.id },
            data: { ownerNotifiedAt: new Date(), lastOutboundAt: new Date() },
          });
          logTwilioInfo('sms', 'owner_notification_sent', {
            messageSid,
            correlationId,
            eventType: 'inbound_sms',
            businessId: business.id,
            leadId: updatedLead.id,
            decision: 'owner_notified',
          });
        }
      } catch (error) {
        logTwilioError(
          'sms',
          'owner_notification_failed',
          {
            messageSid,
            correlationId,
            eventType: 'inbound_sms',
            businessId: business.id,
            leadId: updatedLead.id,
            decision: 'owner_notify_failed',
          },
          error
        );
      }
    }

    try {
      const leadSend = await sendAndPersistOutboundMessage({
        businessId: business.id,
        leadId: updatedLead.id,
        fromPhone: business.twilioPhoneNumber,
        toPhone: updatedLead.callerPhoneNormalized,
        body: transition.responseText,
      });

      if (leadSend.suppressed) {
        logTwilioWarn('sms', 'lead_reply_suppressed', {
          messageSid,
          correlationId,
          eventType: 'inbound_sms',
          businessId: business.id,
          leadId: updatedLead.id,
          decision: 'reply_suppressed_opted_out',
        });
      } else {
        await db.lead.update({
          where: { id: updatedLead.id },
          data: {
            lastOutboundAt: new Date(),
            lastInteractionAt: new Date(),
          },
        });

        logTwilioInfo('sms', 'lead_reply_sent', {
          messageSid,
          correlationId,
          eventType: 'inbound_sms',
          businessId: business.id,
          leadId: updatedLead.id,
          decision: 'send_automated_reply',
        });
      }
    } catch (error) {
      logTwilioError(
        'sms',
        'lead_reply_send_failed',
        {
          messageSid,
          correlationId,
          eventType: 'inbound_sms',
          businessId: business.id,
          leadId: updatedLead.id,
          decision: 'reply_send_failed',
        },
        error
      );
    }

    return withCorrelation(xmlOk());
  } catch (error) {
    logTwilioError('sms', 'route_error', { messageSid, correlationId, eventType: 'inbound_sms', decision: 'return_retryable_503' }, error);
    return withCorrelation(retryableErrorResponse());
  }
}
