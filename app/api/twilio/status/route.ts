import { NextResponse } from 'next/server';
import { SubscriptionStatus } from '@prisma/client';

import { findBusinessByTwilioNumber } from '@/lib/business';
import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { getServicePrompt } from '@/lib/sms-state-machine';
import { isSubscriptionActive } from '@/lib/subscription';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { sendAndPersistOutboundMessage } from '@/lib/twilio-messaging';
import { extractTwilioRecordingMetadata } from '@/lib/twilio-recording';
import { hasValidTwilioWebhookRequest } from '@/lib/twilio-webhook';
import { messagingTwiML } from '@/lib/twiml';
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

export async function POST(request: Request) {
  let callSid: string | null = null;
  let dialCallSid: string | null = null;
  try {
    const formData = await request.formData();
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;

    if (!hasValidTwilioWebhookRequest(request, payload)) {
      logTwilioWarn('status', 'webhook_unauthorized', { decision: 'reject_401' });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        eventType: 'recording_status_callback',
        recordingSid: recording?.recordingSid ?? null,
        recordingStatus: recording?.recordingStatus ?? null,
        decision: updated.count > 0 ? 'update_call_recording_metadata' : 'noop_call_not_found',
      });

      return xmlOk();
    }

    if (!to || !callSid) {
      logTwilioWarn('status', 'missing_required_fields', {
        callSid,
        dialCallSid,
        eventType: 'dial_status_callback',
        decision: 'noop_missing_to_or_callSid',
      });
      return xmlOk();
    }

    const business = await findBusinessByTwilioNumber(to);
    if (!business) {
      logTwilioWarn('status', 'business_not_found', {
        callSid,
        dialCallSid,
        eventType: 'dial_status_callback',
        decision: 'noop_business_not_found',
      });
      return xmlOk();
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
        eventType: 'dial_status_callback',
        businessId: business.id,
        decision: 'noop_not_missed',
      });
      return xmlOk();
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
        eventType: 'dial_status_callback',
        businessId: business.id,
        leadId: lead.id,
        decision: 'create_lead',
      });
    } else {
      logTwilioInfo('status', 'lead_reused_for_retry', {
        callSid,
        dialCallSid,
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
        eventType: 'dial_status_callback',
        businessId: business.id,
        leadId: lead.id,
        decision: 'noop_billing_inactive',
      });
      return xmlOk();
    }

    if (!business.twilioPhoneNumber || lead.smsStartedAt) {
      logTwilioInfo('status', 'already_started_or_missing_twilio_number', {
        callSid,
        dialCallSid,
        eventType: 'dial_status_callback',
        businessId: business.id,
        leadId: lead.id,
        decision: lead.smsStartedAt ? 'noop_retry_sms_already_started' : 'noop_missing_twilio_number',
      });
      return xmlOk();
    }

    try {
      const usage = await getConversationUsageForBusiness(business);
      if (isConversationLimitReached(usage)) {
        logTwilioWarn('status', 'usage_limit_reached', {
          callSid,
          dialCallSid,
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

        if (business.notifyPhone) {
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
                eventType: 'dial_status_callback',
                businessId: business.id,
                leadId: lead.id,
                decision: 'owner_notification_suppressed_opted_out',
              });
              return xmlOk();
            }
            logTwilioInfo('status', 'usage_limit_owner_notified', {
              callSid,
              dialCallSid,
              eventType: 'dial_status_callback',
              businessId: business.id,
              leadId: lead.id,
              decision: 'owner_notification_sent',
            });
          } catch (notifyError) {
            logTwilioError(
              'status',
              'usage_limit_owner_notify_failed',
              {
                callSid,
                dialCallSid,
                eventType: 'dial_status_callback',
                businessId: business.id,
                leadId: lead.id,
                decision: 'owner_notification_failed',
              },
              notifyError
            );
          }
        }

        return xmlOk();
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
          eventType: 'dial_status_callback',
          businessId: business.id,
          leadId: lead.id,
          decision: 'skip_opted_out_recipient',
        });
        return xmlOk();
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
    }

    return xmlOk();
  } catch (error) {
    logTwilioError(
      'status',
      'route_error',
      { callSid, dialCallSid, eventType: 'dial_status_callback', decision: 'return_xml_noop' },
      error
    );
    return xmlOk();
  }
}
