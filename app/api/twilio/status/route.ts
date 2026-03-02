import { NextResponse } from 'next/server';
import { SubscriptionStatus } from '@prisma/client';

import { findBusinessByTwilioNumber } from '@/lib/business';
import { db } from '@/lib/db';
import { getCorrelationIdFromRequest, withCorrelationIdHeader } from '@/lib/observability';
import { normalizePhoneNumber } from '@/lib/phone';
import { RATE_LIMIT_TWILIO_AUTH_MAX, RATE_LIMIT_TWILIO_UNAUTH_MAX, RATE_LIMIT_WINDOW_MS } from '@/lib/rate-limit-config';
import { buildRateLimitHeaders, consumeRateLimit, getClientIpAddress } from '@/lib/rate-limit';
import { getServicePrompt } from '@/lib/sms-state-machine';
import { isSubscriptionActive } from '@/lib/subscription';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { sendAndPersistOutboundMessage } from '@/lib/twilio-messaging';
import { extractTwilioRecordingMetadata } from '@/lib/twilio-recording';
import { buildTwilioRetryableErrorResponse } from '@/lib/twilio-webhook-retry';
import { hasValidTwilioWebhookRequest } from '@/lib/twilio-webhook';
import { messagingTwiML } from '@/lib/twiml';
import { claimUsageLimitNotification } from '@/lib/usage-limit-notification';
import { describeUsageLimit, getConversationUsageForBusiness, isConversationLimitReached } from '@/lib/usage';

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

function xmlOk() {
  return new NextResponse(messagingTwiML(), { headers: { 'Content-Type': 'text/xml' } });
}

function retryableErrorResponse() {
  return buildTwilioRetryableErrorResponse('status');
}

function rateLimitStatusResponse(retryAfterSeconds: number) {
  return new NextResponse(messagingTwiML(), {
    status: 429,
    headers: {
      'Content-Type': 'text/xml',
      'Retry-After': String(retryAfterSeconds),
    },
  });
}

export async function POST(request: Request) {
  let callSid: string | null = null;
  let dialCallSid: string | null = null;
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
        key: `twilio:status:unauth:${clientIp}`,
        limit: RATE_LIMIT_TWILIO_UNAUTH_MAX,
        windowMs: RATE_LIMIT_WINDOW_MS,
      });
      if (!rateLimit.allowed) {
        logTwilioWarn('status', 'webhook_unauthorized_rate_limited', {
          correlationId,
          eventType: 'dial_status_callback',
          decision: 'reject_429',
          clientIp,
        });
        return withCorrelation(new NextResponse(
          JSON.stringify({ error: 'Too many unauthorized requests' }),
          { status: 429, headers: { 'Content-Type': 'application/json', ...buildRateLimitHeaders(rateLimit) } }
        ));
      }

      logTwilioWarn('status', 'webhook_unauthorized', { correlationId, decision: 'reject_401' });
      return withCorrelation(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    const authRateLimit = consumeRateLimit({
      key: `twilio:status:auth:${accountSid || clientIp}`,
      limit: RATE_LIMIT_TWILIO_AUTH_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!authRateLimit.allowed) {
      logTwilioWarn('status', 'webhook_rate_limited', {
        correlationId,
        eventType: 'dial_status_callback',
        decision: 'reject_429',
        accountSid: accountSid || null,
        clientIp,
      });
      const response = rateLimitStatusResponse(authRateLimit.retryAfterSeconds);
      Object.entries(buildRateLimitHeaders(authRateLimit)).forEach(([name, value]) => {
        response.headers.set(name, value);
      });
      return withCorrelation(response);
    }

    const to = normalizePhoneNumber(formField(formData, 'To'));
    const from = normalizePhoneNumber(formField(formData, 'From'));
    callSid = formField(formData, 'CallSid') || null;
    dialCallSid = formField(formData, 'DialCallSid') || null;
    const dialCallStatus = formField(formData, 'DialCallStatus') || '';
    const recording = extractTwilioRecordingMetadata(payload);

    logTwilioInfo('status', 'webhook_received', {
      callSid,
      dialCallSid,
      correlationId,
      eventType: 'dial_status_callback',
      dialCallStatus: dialCallStatus || null,
      recordingSid: recording?.recordingSid ?? null,
      recordingStatus: recording?.recordingStatus ?? null,
      decision: 'processing',
    });

    const recordingUpdate = recording
      ? {
          recordingSid: recording.recordingSid ?? undefined,
          recordingUrl: recording.recordingUrl ?? undefined,
          recordingStatus: recording.recordingStatus ?? undefined,
          recordingDurationSeconds: recording.recordingDurationSeconds ?? undefined,
        }
      : null;

    if (recordingUpdate && callSid && !to && !dialCallStatus) {
      const updated = await db.call.updateMany({
        where: { twilioCallSid: callSid },
        data: {
          ...recordingUpdate,
          rawPayload: payload,
        },
      });

      logTwilioInfo('status', 'recording_metadata_persisted_only', {
        callSid,
        correlationId,
        eventType: 'recording_status_callback',
        recordingSid: recording?.recordingSid ?? null,
        recordingStatus: recording?.recordingStatus ?? null,
        decision: updated.count > 0 ? 'update_call_recording_metadata' : 'noop_call_not_found',
      });

      return withCorrelation(xmlOk());
    }

    if (!to || !callSid) {
      logTwilioWarn('status', 'missing_required_fields', {
        callSid,
        dialCallSid,
        correlationId,
        eventType: 'dial_status_callback',
        decision: 'noop_missing_to_or_callSid',
      });
      return withCorrelation(xmlOk());
    }

    const business = await findBusinessByTwilioNumber(to);
    if (!business) {
      logTwilioWarn('status', 'business_not_found', {
        callSid,
        dialCallSid,
        correlationId,
        eventType: 'dial_status_callback',
        decision: 'noop_business_not_found',
      });
      return withCorrelation(xmlOk());
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
        ...(recordingUpdate ?? {}),
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
        ...(recordingUpdate ?? {}),
        answered,
        missed,
        rawPayload: payload,
      },
    });

    logTwilioInfo('status', 'call_upserted', {
      callSid,
      dialCallSid,
      correlationId,
      eventType: 'dial_status_callback',
      businessId: business.id,
      answered,
      missed,
      decision: 'upsert_call',
    });

    if (recordingUpdate) {
      logTwilioInfo('status', 'recording_metadata_persisted', {
        callSid,
        dialCallSid,
        correlationId,
        eventType: 'recording_status_callback',
        businessId: business.id,
        recordingSid: recording?.recordingSid ?? null,
        recordingStatus: recording?.recordingStatus ?? null,
        decision: 'persist_recording_metadata',
      });
    }

    if (!missed) {
      logTwilioInfo('status', 'not_missed_noop', {
        callSid,
        dialCallSid,
        correlationId,
        eventType: 'dial_status_callback',
        businessId: business.id,
        decision: 'noop_not_missed',
      });
      return withCorrelation(xmlOk());
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
      logTwilioInfo('status', 'lead_created_for_missed_call', {
        callSid,
        dialCallSid,
        correlationId,
        eventType: 'dial_status_callback',
        businessId: business.id,
        leadId: lead.id,
        decision: 'create_lead',
      });
    } else {
      logTwilioInfo('status', 'lead_reused_for_retry', {
        callSid,
        dialCallSid,
        correlationId,
        eventType: 'dial_status_callback',
        businessId: business.id,
        leadId: lead.id,
        decision: 'reuse_existing_lead',
      });
    }

    if (!isSubscriptionActive(business.subscriptionStatus)) {
      if (!lead.billingRequired) {
        await db.lead.update({ where: { id: lead.id }, data: { billingRequired: true } });
      }
      logTwilioInfo('status', 'billing_inactive_no_sms', {
        callSid,
        dialCallSid,
        correlationId,
        eventType: 'dial_status_callback',
        businessId: business.id,
        leadId: lead.id,
        decision: 'noop_billing_inactive',
      });
      return withCorrelation(xmlOk());
    }

    if (!business.twilioPhoneNumber || lead.smsStartedAt) {
      logTwilioInfo('status', 'already_started_or_missing_twilio_number', {
        callSid,
        dialCallSid,
        correlationId,
        eventType: 'dial_status_callback',
        businessId: business.id,
        leadId: lead.id,
        decision: lead.smsStartedAt ? 'noop_retry_sms_already_started' : 'noop_missing_twilio_number',
      });
      return withCorrelation(xmlOk());
    }

    try {
      const usage = await getConversationUsageForBusiness(business);
      if (isConversationLimitReached(usage)) {
        logTwilioWarn('status', 'usage_limit_reached', {
          callSid,
          dialCallSid,
          correlationId,
          eventType: 'dial_status_callback',
          businessId: business.id,
          leadId: lead.id,
          decision: 'skip_initial_sms',
          usage: describeUsageLimit(usage),
        });

        await db.lead.update({
          where: { id: lead.id },
          data: {
            billingRequired: true,
            lastInteractionAt: new Date(),
          },
        });

        if (lead.usageLimitNotifiedAt) {
          logTwilioInfo('status', 'usage_limit_owner_notify_already_recorded', {
            callSid,
            dialCallSid,
            correlationId,
            eventType: 'dial_status_callback',
            businessId: business.id,
            leadId: lead.id,
            decision: 'noop_usage_limit_notification_already_recorded',
          });
          return withCorrelation(xmlOk());
        }

        if (business.notifyPhone) {
          const claimed = await claimUsageLimitNotification(db, lead.id);
          if (!claimed) {
            logTwilioInfo('status', 'usage_limit_owner_notify_already_claimed', {
              callSid,
              dialCallSid,
              correlationId,
              eventType: 'dial_status_callback',
              businessId: business.id,
              leadId: lead.id,
              decision: 'noop_usage_limit_notification_already_claimed',
            });
            return withCorrelation(xmlOk());
          }

          try {
            const notifyResult = await sendAndPersistOutboundMessage({
              businessId: business.id,
              leadId: lead.id,
              fromPhone: business.twilioPhoneNumber,
              toPhone: business.notifyPhone,
              body:
                `CallbackCloser: Monthly conversation limit reached (${usage.used}/${usage.limit}). ` +
                'Missed call was recorded, but automated SMS follow-up was not sent.',
              participant: 'OWNER',
            });
            if (notifyResult.suppressed) {
              logTwilioWarn('status', 'usage_limit_owner_notify_suppressed', {
                callSid,
                dialCallSid,
                correlationId,
                eventType: 'dial_status_callback',
                businessId: business.id,
                leadId: lead.id,
                decision: 'owner_notification_suppressed_opted_out',
              });
              return withCorrelation(xmlOk());
            }
            logTwilioInfo('status', 'usage_limit_owner_notified', {
              callSid,
              dialCallSid,
              correlationId,
              eventType: 'dial_status_callback',
              businessId: business.id,
              leadId: lead.id,
              decision: 'owner_notification_sent',
            });
          } catch (notifyError) {
            try {
              await db.lead.update({
                where: { id: lead.id },
                data: {
                  usageLimitNotifiedAt: null,
                  lastInteractionAt: new Date(),
                },
              });
            } catch {
              // best-effort reset; retry may still be deduped if reset fails
            }

            logTwilioError(
              'status',
              'usage_limit_owner_notify_failed',
              {
                callSid,
                dialCallSid,
                correlationId,
                eventType: 'dial_status_callback',
                businessId: business.id,
                leadId: lead.id,
                decision: 'owner_notification_failed',
              },
              notifyError
            );
          }
        }

        return withCorrelation(xmlOk());
      }

      const prompt = getServicePrompt(business);
      const promptResult = await sendAndPersistOutboundMessage({
        businessId: business.id,
        leadId: lead.id,
        fromPhone: business.twilioPhoneNumber,
        toPhone: callerPhoneNormalized,
        body: prompt,
      });

      if (promptResult.suppressed) {
        logTwilioWarn('status', 'initial_missed_call_sms_suppressed', {
          callSid,
          dialCallSid,
          correlationId,
          eventType: 'dial_status_callback',
          businessId: business.id,
          leadId: lead.id,
          decision: 'skip_opted_out_recipient',
        });
        return withCorrelation(xmlOk());
      }

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

      logTwilioInfo('status', 'initial_missed_call_sms_started', {
        callSid,
        dialCallSid,
        correlationId,
        eventType: 'dial_status_callback',
        businessId: business.id,
        leadId: lead.id,
        decision: 'send_initial_sms_and_mark_started',
      });
    } catch (error) {
      logTwilioError(
        'status',
        'initial_missed_call_sms_failed',
        {
          callSid,
          dialCallSid,
          correlationId,
          eventType: 'dial_status_callback',
          businessId: business.id,
          leadId: lead.id,
          decision: 'mark_billing_required_if_needed',
        },
        error
      );
      await db.lead.update({
        where: { id: lead.id },
        data: {
          billingRequired: business.subscriptionStatus !== SubscriptionStatus.ACTIVE,
          lastInteractionAt: new Date(),
        },
      });
      return withCorrelation(retryableErrorResponse());
    }

    return withCorrelation(xmlOk());
  } catch (error) {
    logTwilioError(
      'status',
      'route_error',
      { callSid, dialCallSid, correlationId, eventType: 'dial_status_callback', decision: 'return_retryable_503' },
      error
    );
    return withCorrelation(retryableErrorResponse());
  }
}
