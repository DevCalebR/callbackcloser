import { ManagedTwilioStatus, MessageParticipant, MessagingComplianceType, MessagingSetupMode, Prisma, TollFreeVerificationStatus } from '@prisma/client';

import { db } from '@/lib/db';
import { persistAcceptedOutboundMessage, persistOutboundMessageRecord } from '@/lib/outbound-message-persistence';
import { type OutboundMessageContext } from '@/lib/outbound-message-events';
import { formatPhoneDetail, recordBusinessOperatorEvent } from '@/lib/operator-events';
import { normalizePhoneNumber } from '@/lib/phone';
import { getOutboundMessagingComplianceGate, type OutboundMessagingSuppressionReason } from '@/lib/twilio-compliance';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { isSmsRecipientOptedOut } from '@/lib/twilio-sms-compliance';
import { type TwilioClient, getTwilioBusinessClient, getTwilioMessageStatusCallbackUrl } from '@/lib/twilio';

type OutboundTwilioClient = Pick<TwilioClient, 'messages'>;

export { persistOutboundMessageRecord } from '@/lib/outbound-message-persistence';

export async function persistInboundMessage(params: {
  businessId: string;
  leadId?: string | null;
  twilioSid?: string | null;
  fromPhone: string;
  toPhone: string;
  body: string;
  rawPayload?: Record<string, string>;
}) {
  const normalizedFrom = normalizePhoneNumber(params.fromPhone) || params.fromPhone;
  const normalizedTo = normalizePhoneNumber(params.toPhone) || params.toPhone;

  if (params.twilioSid) {
    const existing = await db.message.findUnique({ where: { twilioSid: params.twilioSid } });
    if (existing) return { message: existing, duplicate: true };
  }

  let message;
  try {
    message = await db.message.create({
      data: {
        businessId: params.businessId,
        leadId: params.leadId ?? null,
        twilioSid: params.twilioSid ?? null,
        direction: 'INBOUND',
        participant: 'LEAD',
        fromPhone: normalizedFrom,
        toPhone: normalizedTo,
        body: params.body,
        rawPayload: params.rawPayload ?? undefined,
      },
    });
  } catch (error) {
    if (
      params.twilioSid &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await db.message.findUnique({ where: { twilioSid: params.twilioSid } });
      if (existing) return { message: existing, duplicate: true };
    }
    throw error;
  }

  await recordBusinessOperatorEvent({
    businessId: params.businessId,
    type: 'messaging.inbound_sms_received',
    category: 'MESSAGING',
    status: 'INFO',
    summary: 'Inbound SMS received',
    details: {
      fromPhone: formatPhoneDetail(normalizedFrom),
      toPhone: formatPhoneDetail(normalizedTo),
      bodyPreview: params.body.slice(0, 80),
    },
    relatedEntityType: params.leadId ? 'lead' : 'message',
    relatedEntityId: params.leadId ?? message.id,
  });

  return { message, duplicate: false };
}

export async function sendAndPersistOutboundMessage(params: {
  businessId: string;
  leadId?: string | null;
  fromPhone: string;
  toPhone: string;
  body: string;
  participant?: MessageParticipant;
  context?: OutboundMessageContext;
  twilioSubaccountSid?: string | null;
  messagingServiceSid?: string | null;
  messagingSetupMode?: MessagingSetupMode | null;
  managedTwilioStatus?: ManagedTwilioStatus | null;
  a2pFailureReason?: string | null;
  messagingComplianceType?: MessagingComplianceType | null;
  tollFreeVerificationStatus?: TollFreeVerificationStatus | null;
  tollFreeVerificationSid?: string | null;
  tollFreeVerificationNote?: string | null;
  allowUnapproved?: boolean;
  twilioClient?: OutboundTwilioClient;
}) {
  const from = normalizePhoneNumber(params.fromPhone) || params.fromPhone;
  const to = normalizePhoneNumber(params.toPhone) || params.toPhone;
  const participant = params.participant ?? 'LEAD';
  const context =
    params.context ?? (!params.leadId && participant === 'OWNER' && params.body.startsWith('CallbackCloser admin test:') ? 'admin_test' : participant === 'OWNER' ? 'owner_alert' : 'lead_recovery');
  const recipientLabel = participant === 'OWNER' ? 'owner SMS' : 'lead SMS';

  if (await isSmsRecipientOptedOut({ businessId: params.businessId, phone: to })) {
    await recordBusinessOperatorEvent({
      businessId: params.businessId,
      type: 'messaging.outbound_sms_suppressed',
      category: 'MESSAGING',
      status: 'WARNING',
      summary: `Outbound ${recipientLabel} suppressed`,
      details: {
        reason: 'recipient_opted_out',
        toPhone: formatPhoneDetail(to),
        participant,
      },
      relatedEntityType: params.leadId ? 'lead' : null,
      relatedEntityId: params.leadId ?? null,
    });
    logTwilioWarn('messaging', 'outbound_suppressed_opted_out', {
      decision: 'suppress_opted_out',
      businessId: params.businessId,
      leadId: params.leadId ?? null,
      participant,
      toPhone: to,
    });
    return {
      suppressed: true as const,
      reason: 'recipient_opted_out' as const,
    };
  }

  const complianceGate = params.allowUnapproved
    ? null
    : getOutboundMessagingComplianceGate({
        twilioSubaccountSid: params.twilioSubaccountSid,
        messagingServiceSid: params.messagingServiceSid,
        messagingSetupMode: params.messagingSetupMode,
        managedTwilioStatus: params.managedTwilioStatus,
        a2pFailureReason: params.a2pFailureReason,
        messagingComplianceType: params.messagingComplianceType,
        tollFreeVerificationStatus: params.tollFreeVerificationStatus,
        tollFreeVerificationSid: params.tollFreeVerificationSid,
        tollFreeVerificationNote: params.tollFreeVerificationNote,
      });

  if (complianceGate) {
    await recordBusinessOperatorEvent({
      businessId: params.businessId,
      type: 'messaging.outbound_sms_suppressed',
      category: 'MESSAGING',
      status: 'WARNING',
      summary: `Outbound ${recipientLabel} suppressed`,
      details: {
        reason: complianceGate.reason,
        participant,
        detail: complianceGate.detail,
        nextStep: complianceGate.nextStep,
      },
      relatedEntityType: params.leadId ? 'lead' : null,
      relatedEntityId: params.leadId ?? null,
    });
    logTwilioWarn('messaging', 'outbound_suppressed_managed_twilio_not_ready', {
      decision: complianceGate.reason,
      businessId: params.businessId,
      leadId: params.leadId ?? null,
      participant,
      nextStep: complianceGate.nextStep,
    });

    return {
      suppressed: true as const,
      reason: complianceGate.reason as OutboundMessagingSuppressionReason,
      detail: complianceGate.detail,
    };
  }

  await recordBusinessOperatorEvent({
    businessId: params.businessId,
    type: 'messaging.outbound_sms_requested',
    category: 'MESSAGING',
    status: 'PENDING',
    summary: `Outbound ${recipientLabel} requested`,
    details: {
      fromPhone: formatPhoneDetail(from),
      toPhone: formatPhoneDetail(to),
      participant,
    },
    relatedEntityType: params.leadId ? 'lead' : null,
    relatedEntityId: params.leadId ?? null,
  });

  const statusCallback = getTwilioMessageStatusCallbackUrl();
  const client = params.twilioClient ?? getTwilioBusinessClient(params.twilioSubaccountSid);
  const sent = await client.messages.create(
    params.messagingServiceSid
      ? {
          messagingServiceSid: params.messagingServiceSid,
          to,
          body: params.body,
          statusCallback,
        }
      : {
          from,
          to,
          body: params.body,
          statusCallback,
        }
  );

  const message = await persistAcceptedOutboundMessage({
    businessId: params.businessId,
    leadId: params.leadId ?? null,
    fromPhone: from,
    toPhone: to,
    body: params.body,
    participant,
    twilioSid: sent.sid,
    status: sent.status,
    context,
    statusCallback,
    messagingServiceSid: params.messagingServiceSid,
    twilioCreatedAt: sent.dateCreated ?? undefined,
  });
  await recordBusinessOperatorEvent({
    businessId: params.businessId,
    type: 'messaging.outbound_sms_accepted',
    category: 'MESSAGING',
    status: 'SUCCESS',
    summary: `Outbound ${recipientLabel} accepted by Twilio`,
    details: {
      fromPhone: formatPhoneDetail(from),
      toPhone: formatPhoneDetail(to),
      messageStatus: sent.status,
      participant,
    },
    relatedEntityType: params.leadId ? 'lead' : 'message',
    relatedEntityId: params.leadId ?? message.id,
  });

  logTwilioInfo('messaging', 'outbound_sent_and_persisted', {
    decision: 'sent',
    messageSid: sent.sid,
    businessId: params.businessId,
    leadId: params.leadId ?? null,
    participant,
  });

  return { suppressed: false as const, sent, message };
}

export function buildOwnerNotificationMessage(params: {
  businessName: string;
  leadId: string;
  callerPhone: string;
  customerName?: string | null;
  serviceRequested?: string | null;
  urgency?: string | null;
  location?: string | null;
  bestTime?: string | null;
  leadUrl: string;
}) {
  const parts = [
    `🔥 ${params.businessName} missed-call lead`,
    `Name: ${params.customerName || 'Not captured'}`,
    `Service: ${params.serviceRequested || 'Unknown'}`,
    `Urgency: ${params.urgency || 'Unknown'}`,
    `Location: ${params.location || 'Unknown'}`,
    `Callback: ${params.bestTime || 'Unknown'}`,
    `Call now: ${params.callerPhone}`,
    `Lead: ${params.leadUrl}`,
  ];

  return parts.join(' | ');
}
