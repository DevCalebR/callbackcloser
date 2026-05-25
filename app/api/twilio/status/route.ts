import { NextResponse } from 'next/server';
import { ForwardedCallAnswerMode } from '@prisma/client';

import { findBusinessByTwilioNumber } from '@/lib/business';
import { db } from '@/lib/db';
import { startMissedCallRecovery } from '@/lib/missed-call-flow';
import { getCorrelationIdFromRequest, withCorrelationIdHeader } from '@/lib/observability';
import { formatPhoneDetail, recordBusinessOperatorEvent } from '@/lib/operator-events';
import { normalizePhoneNumber, normalizePhoneNumberToE164 } from '@/lib/phone';
import { RATE_LIMIT_TWILIO_AUTH_MAX, RATE_LIMIT_TWILIO_UNAUTH_MAX, RATE_LIMIT_WINDOW_MS } from '@/lib/rate-limit-config';
import { buildRateLimitHeaders, consumeRateLimit, getClientIpAddress } from '@/lib/rate-limit';
import { isSubscriptionActive } from '@/lib/subscription';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { extractTwilioRecordingMetadata } from '@/lib/twilio-recording';
import { sendAndPersistOutboundMessage } from '@/lib/twilio-messaging';
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

    const authorized = await hasValidTwilioWebhookRequest(request, payload);
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

    const to = normalizePhoneNumberToE164(formField(formData, 'To')) || normalizePhoneNumber(formField(formData, 'To'));
    const from = normalizePhoneNumberToE164(formField(formData, 'From')) || normalizePhoneNumber(formField(formData, 'From'));
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

    const existingCall = await db.call.findUnique({
      where: { twilioCallSid: callSid },
      select: {
        id: true,
        answerConfirmationRequested: true,
        humanAccepted: true,
      },
    });
    const completedDial = dialCallStatus.trim().toLowerCase() === 'completed';
    const requiresHumanAcceptance =
      existingCall?.answerConfirmationRequested ?? business.forwardedCallAnswerMode === ForwardedCallAnswerMode.PRESS_1_REQUIRED;
    const humanAccepted = existingCall?.humanAccepted ?? false;
    const answered = completedDial && (!requiresHumanAcceptance || humanAccepted);
    const missed = isMissedDialStatus(dialCallStatus) || (completedDial && requiresHumanAcceptance && !humanAccepted);

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
        answerConfirmationRequested: requiresHumanAcceptance,
        status: answered ? 'ANSWERED' : missed ? 'MISSED' : 'COMPLETED',
        callDurationSeconds: toInt(formField(formData, 'CallDuration')),
        dialCallDurationSeconds: toInt(formField(formData, 'DialCallDuration')),
        ...(recordingUpdate ?? {}),
        answered,
        humanAccepted,
        missed,
        rawPayload: payload,
      },
      update: {
        parentCallSid: formField(formData, 'ParentCallSid') || undefined,
        dialCallSid,
        dialCallStatus: dialCallStatus || null,
        answerConfirmationRequested: requiresHumanAcceptance,
        status: answered ? 'ANSWERED' : missed ? 'MISSED' : 'COMPLETED',
        callDurationSeconds: toInt(formField(formData, 'CallDuration')),
        dialCallDurationSeconds: toInt(formField(formData, 'DialCallDuration')),
        ...(recordingUpdate ?? {}),
        answered,
        humanAccepted,
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
      humanAccepted,
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

    if (completedDial && requiresHumanAcceptance && !humanAccepted) {
      await recordBusinessOperatorEvent({
        businessId: business.id,
        type: 'voice.no_human_acceptance_detected',
        category: 'VOICE',
        status: 'WARNING',
        summary: 'No human acceptance detected',
        details: {
          callSid,
          dialCallSid,
          dialCallStatus,
          fromPhone: formatPhoneDetail(from || formField(formData, 'From')),
          toPhone: formatPhoneDetail(to),
          reason: 'timeout_or_voicemail',
        },
        relatedEntityType: 'call',
        relatedEntityId: call.id,
      });
      await recordBusinessOperatorEvent({
        businessId: business.id,
        type: 'voice.voicemail_or_timeout_treated_as_missed',
        category: 'VOICE',
        status: 'WARNING',
        summary: 'Voicemail or timeout treated as missed',
        details: {
          callSid,
          dialCallSid,
          dialCallStatus,
          fromPhone: formatPhoneDetail(from || formField(formData, 'From')),
          toPhone: formatPhoneDetail(to),
        },
        relatedEntityType: 'call',
        relatedEntityId: call.id,
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

    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'voice.call_marked_missed',
      category: 'VOICE',
      status: 'INFO',
      summary: 'Call marked missed',
      details: {
        callSid,
        dialCallSid,
        fromPhone: formatPhoneDetail(from || formField(formData, 'From')),
        toPhone: formatPhoneDetail(to),
      },
      relatedEntityType: 'call',
      relatedEntityId: call.id,
    });

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
          billingRequired: !isSubscriptionActive(business),
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
      await recordBusinessOperatorEvent({
        businessId: business.id,
        type: 'voice.lead_created_from_call',
        category: 'VOICE',
        status: 'SUCCESS',
        summary: 'Lead created from missed call',
        details: {
          callSid,
          callerPhone: formatPhoneDetail(callerPhoneNormalized),
        },
        relatedEntityType: 'lead',
        relatedEntityId: lead.id,
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
      await recordBusinessOperatorEvent({
        businessId: business.id,
        type: 'voice.lead_updated_from_call',
        category: 'VOICE',
        status: 'INFO',
        summary: 'Existing lead reused for missed call',
        details: {
          callSid,
          callerPhone: formatPhoneDetail(callerPhoneNormalized),
        },
        relatedEntityType: 'lead',
        relatedEntityId: lead.id,
      });
    }

    if (!isSubscriptionActive(business)) {
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

    const businessTextingNumber = business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber;
    if (!businessTextingNumber || lead.smsStartedAt) {
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
              fromPhone: businessTextingNumber,
              toPhone: business.notifyPhone,
              body:
                `CallbackCloser: Monthly conversation limit reached (${usage.used}/${usage.limit}). ` +
                'Missed call was recorded, but automated SMS follow-up was not sent.',
              participant: 'OWNER',
              twilioSubaccountSid: business.twilioAccountMode === 'MAIN_ACCOUNT' ? null : business.twilioSubaccountSid,
              messagingServiceSid: business.twilioMessagingServiceSid,
              messagingSetupMode: business.messagingSetupMode,
              managedTwilioStatus: business.managedTwilioStatus,
              a2pFailureReason: business.a2pFailureReason,
              messagingComplianceType: business.messagingComplianceType,
              tollFreeVerificationStatus: business.tollFreeVerificationStatus,
              tollFreeVerificationSid: business.tollFreeVerificationSid,
              tollFreeVerificationNote: business.tollFreeVerificationNote,
            });
            if (notifyResult.suppressed) {
              logTwilioWarn('status', 'usage_limit_owner_notify_suppressed', {
                callSid,
                dialCallSid,
                correlationId,
                eventType: 'dial_status_callback',
                businessId: business.id,
                leadId: lead.id,
                decision: notifyResult.reason,
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

      const recovery = await startMissedCallRecovery({
        business,
        callerPhone: callerPhoneNormalized,
        callId: call.id,
        transport: process.env.NODE_ENV === 'test' ? 'simulated' : 'twilio',
      });

      if (!recovery.started) {
        await recordBusinessOperatorEvent({
          businessId: business.id,
          type: 'messaging.missed_call_sms_suppressed',
          category: 'MESSAGING',
          status: 'WARNING',
          summary: 'Missed-call SMS did not start',
          details: {
            reason: recovery.reason ?? 'unknown',
            callSid,
          },
          relatedEntityType: 'lead',
          relatedEntityId: lead.id,
        });
        logTwilioWarn('status', 'initial_missed_call_sms_suppressed', {
          callSid,
          dialCallSid,
          correlationId,
          eventType: 'dial_status_callback',
          businessId: business.id,
          leadId: lead.id,
          decision: recovery.reason ?? 'skip_unknown',
        });
        return withCorrelation(xmlOk());
      }

      await recordBusinessOperatorEvent({
        businessId: business.id,
        type: 'messaging.missed_call_sms_started',
        category: 'MESSAGING',
        status: 'SUCCESS',
        summary: 'Missed-call SMS flow started',
        details: {
          callSid,
          leadId: recovery.lead.id,
        },
        relatedEntityType: 'lead',
        relatedEntityId: recovery.lead.id,
      });
      await recordBusinessOperatorEvent({
        businessId: business.id,
        type: 'voice.missed_call_sms_started',
        category: 'VOICE',
        status: 'SUCCESS',
        summary: 'Missed-call SMS started',
        details: {
          callSid,
          leadId: recovery.lead.id,
        },
        relatedEntityType: 'lead',
        relatedEntityId: recovery.lead.id,
      });
      logTwilioInfo('status', 'initial_missed_call_sms_started', {
        callSid,
        dialCallSid,
        correlationId,
        eventType: 'dial_status_callback',
        businessId: business.id,
        leadId: recovery.lead.id,
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
          billingRequired: !isSubscriptionActive(business),
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
