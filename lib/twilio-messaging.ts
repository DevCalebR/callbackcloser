import { ManagedTwilioStatus, MessageParticipant, MessagingComplianceType, Prisma, TollFreeVerificationStatus } from '@prisma/client';

import { db } from '@/lib/db';
import { getManagedTwilioStatusSummary } from '@/lib/managed-twilio';
import { type OutboundMessageContext } from '@/lib/outbound-message-events';
import { formatPhoneDetail, recordBusinessOperatorEvent } from '@/lib/operator-events';
import { normalizePhoneNumber } from '@/lib/phone';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { isSmsRecipientOptedOut } from '@/lib/twilio-sms-compliance';
import { getTwilioBusinessClient, getTwilioMessageStatusCallbackUrl } from '@/lib/twilio';

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
  managedTwilioStatus?: ManagedTwilioStatus | null;
  a2pFailureReason?: string | null;
  allowUnapproved?: boolean;
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

  if (
    !params.allowUnapproved &&
    typeof params.managedTwilioStatus === 'string' &&
    params.managedTwilioStatus !== ManagedTwilioStatus.COMPLIANT_LIVE
  ) {
    const managedSummary = getManagedTwilioStatusSummary({
      managedTwilioStatus: params.managedTwilioStatus,
      twilioAccountMode: params.twilioSubaccountSid ? 'BUSINESS_SUBACCOUNT' : 'MAIN_ACCOUNT',
      twilioSubaccountSid: params.twilioSubaccountSid ?? null,
      twilioPrimaryPhoneNumber: from,
      twilioPhoneNumber: from,
      twilioPrimaryNumberSid: null,
      twilioPhoneNumberSid: null,
      twilioMessagingServiceSid: params.messagingServiceSid ?? null,
      twilioWebhookSyncedAt: null,
      messagingComplianceType: MessagingComplianceType.LOCAL_A2P,
      a2pFailureReason: params.a2pFailureReason ?? null,
      a2pApprovedAt: null,
      a2pCampaignSid: null,
      a2pBrandSid: null,
      a2pCustomerProfileSid: null,
      tollFreeVerificationStatus: TollFreeVerificationStatus.NOT_STARTED,
      tollFreeVerificationSid: null,
      tollFreeVerificationNote: null,
    });

    const reason =
      params.managedTwilioStatus === ManagedTwilioStatus.FAILED_REVIEW ||
      params.managedTwilioStatus === ManagedTwilioStatus.PAUSED_NONCOMPLIANT
        ? 'managed_twilio_compliance_blocked'
        : 'managed_twilio_compliance_pending';

    await recordBusinessOperatorEvent({
      businessId: params.businessId,
      type: 'messaging.outbound_sms_suppressed',
      category: 'MESSAGING',
      status: 'WARNING',
      summary: `Outbound ${recipientLabel} suppressed`,
      details: {
        reason,
        participant,
        nextStep: managedSummary.nextStep,
      },
      relatedEntityType: params.leadId ? 'lead' : null,
      relatedEntityId: params.leadId ?? null,
    });
    logTwilioWarn('messaging', 'outbound_suppressed_managed_twilio_not_ready', {
      decision: reason,
      businessId: params.businessId,
      leadId: params.leadId ?? null,
      participant,
      nextStep: managedSummary.nextStep,
    });

    return {
      suppressed: true as const,
      reason,
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

  const client = getTwilioBusinessClient(params.twilioSubaccountSid);
  const sent = await client.messages.create(
    params.messagingServiceSid
      ? {
          messagingServiceSid: params.messagingServiceSid,
          to,
          body: params.body,
          statusCallback: getTwilioMessageStatusCallbackUrl(),
        }
      : {
          from,
          to,
          body: params.body,
          statusCallback: getTwilioMessageStatusCallbackUrl(),
        }
  );

  const message = await persistOutboundMessageRecord({
    businessId: params.businessId,
    leadId: params.leadId ?? null,
    fromPhone: from,
    toPhone: to,
    body: params.body,
    participant,
    twilioSid: sent.sid,
    status: sent.status,
    rawPayload: {
      source: 'twilio_api',
      context,
    },
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

export async function persistOutboundMessageRecord(params: {
  businessId: string;
  leadId?: string | null;
  twilioSid?: string | null;
  fromPhone: string;
  toPhone: string;
  body: string;
  participant?: MessageParticipant;
  status?: string | null;
  rawPayload?: Prisma.InputJsonValue;
  twilioCreatedAt?: Date | null;
}) {
  const from = normalizePhoneNumber(params.fromPhone) || params.fromPhone;
  const to = normalizePhoneNumber(params.toPhone) || params.toPhone;

  return db.message.create({
    data: {
      businessId: params.businessId,
      leadId: params.leadId ?? null,
      twilioSid: params.twilioSid ?? null,
      direction: 'OUTBOUND',
      participant: params.participant ?? 'LEAD',
      fromPhone: from,
      toPhone: to,
      body: params.body,
      status: params.status ?? undefined,
      rawPayload: params.rawPayload ?? undefined,
      twilioCreatedAt: params.twilioCreatedAt ?? undefined,
    },
  });
}

export function buildOwnerNotificationMessage(params: {
  businessName: string;
  leadId: string;
  callerPhone: string;
  serviceRequested?: string | null;
  urgency?: string | null;
  zipCode?: string | null;
  bestTime?: string | null;
  leadUrl: string;
}) {
  const parts = [
    `[CallbackCloser] ${params.businessName} missed-call lead`,
    `Caller: ${params.callerPhone}`,
    `Service: ${params.serviceRequested || 'Unknown'}`,
    `Urgency: ${params.urgency || 'Unknown'}`,
    `ZIP: ${params.zipCode || 'Unknown'}`,
    `Best time: ${params.bestTime || 'Unknown'}`,
    `Lead: ${params.leadUrl}`,
  ];

  return parts.join(' | ');
}
