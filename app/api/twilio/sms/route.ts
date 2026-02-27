import { LeadStatus } from '@prisma/client';
import { NextResponse } from 'next/server';

import { findBusinessByTwilioNumber } from '@/lib/business';
import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { advanceLeadConversation } from '@/lib/sms-state-machine';
import { isSubscriptionActive } from '@/lib/subscription';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { handleInboundSmsComplianceCommand } from '@/lib/twilio-sms-compliance';
import { buildOwnerNotificationMessage, persistInboundMessage, sendAndPersistOutboundMessage } from '@/lib/twilio-messaging';
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

export async function POST(request: Request) {
  let messageSid: string | null = null;
  try {
    const formData = await request.formData();
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;

    if (!hasValidTwilioWebhookRequest(request, payload)) {
      logTwilioWarn('sms', 'webhook_unauthorized', { decision: 'reject_401' });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const to = normalizePhoneNumber(formField(formData, 'To'));
    const from = normalizePhoneNumber(formField(formData, 'From'));
    const body = formField(formData, 'Body');
    messageSid = formField(formData, 'MessageSid') || formField(formData, 'SmsSid') || null;

    logTwilioInfo('sms', 'webhook_received', {
      messageSid,
      eventType: 'inbound_sms',
      decision: 'processing',
    });

    if (!to || !from) {
      logTwilioWarn('sms', 'missing_required_fields', {
        messageSid,
        eventType: 'inbound_sms',
        decision: 'noop_missing_to_or_from',
      });
      return xmlOk();
    }

    const business = await findBusinessByTwilioNumber(to);
    if (!business) {
      logTwilioWarn('sms', 'business_not_found', {
        messageSid,
        eventType: 'inbound_sms',
        decision: 'noop_business_not_found',
      });
      return xmlOk();
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
        eventType: 'inbound_sms',
        businessId: business.id,
        command: compliance.command,
        stateChange: compliance.stateChange,
        duplicateInbound: inbound.duplicate,
        decision: 'reply_compliance_message',
      });
      return xmlOk(compliance.replyText);
    }

    if (inbound.duplicate) {
      logTwilioInfo('sms', 'duplicate_message_retry', {
        messageSid,
        eventType: 'inbound_sms',
        businessId: business.id,
        leadId: null,
        decision: 'noop_duplicate',
      });
      return xmlOk();
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
        eventType: 'inbound_sms',
        businessId: business.id,
        decision: 'noop_no_lead_thread',
      });
      return xmlOk();
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
        eventType: 'inbound_sms',
        businessId: business.id,
        leadId: lead.id,
        decision: !isSubscriptionActive(business.subscriptionStatus)
          ? 'noop_billing_inactive'
          : lead.billingRequired
            ? 'noop_billing_required'
            : 'noop_missing_twilio_number',
      });
      return xmlOk();
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
          eventType: 'inbound_sms',
          businessId: business.id,
          leadId: updatedLead.id,
          decision: 'reply_send_failed',
        },
        error
      );
    }

    return xmlOk();
  } catch (error) {
    logTwilioError('sms', 'route_error', { messageSid, eventType: 'inbound_sms', decision: 'return_xml_noop' }, error);
    return xmlOk();
  }
}
