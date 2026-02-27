import { Prisma, MessageParticipant } from '@prisma/client';

import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { logTwilioError, logTwilioInfo, logTwilioWarn } from '@/lib/twilio-logging';
import { isSmsRecipientOptedOut } from '@/lib/twilio-sms-compliance';
import { getTwilioClient } from '@/lib/twilio';

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

  return { message, duplicate: false };
}

export async function sendAndPersistOutboundMessage(params: {
  businessId: string;
  leadId?: string | null;
  fromPhone: string;
  toPhone: string;
  body: string;
  participant?: MessageParticipant;
}) {
  const from = normalizePhoneNumber(params.fromPhone) || params.fromPhone;
  const to = normalizePhoneNumber(params.toPhone) || params.toPhone;
  const participant = params.participant ?? 'LEAD';

  if (await isSmsRecipientOptedOut({ businessId: params.businessId, phone: to })) {
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

  const client = getTwilioClient();
  const sent = await client.messages.create({
    from,
    to,
    body: params.body,
  });

  const message = await db.message.create({
    data: {
      businessId: params.businessId,
      leadId: params.leadId ?? null,
      twilioSid: sent.sid,
      direction: 'OUTBOUND',
      participant,
      fromPhone: from,
      toPhone: to,
      body: params.body,
      status: sent.status,
      twilioCreatedAt: sent.dateCreated ?? undefined,
    },
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
