import { MessageParticipant, Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { type OutboundMessageContext } from '@/lib/outbound-message-events';
import { normalizePhoneNumber } from '@/lib/phone';

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

export async function persistAcceptedOutboundMessage(params: {
  businessId: string;
  leadId?: string | null;
  fromPhone: string;
  toPhone: string;
  body: string;
  participant?: MessageParticipant;
  twilioSid: string;
  status?: string | null;
  context: OutboundMessageContext;
  statusCallback: string;
  messagingServiceSid?: string | null;
  twilioCreatedAt?: Date | null;
}) {
  return persistOutboundMessageRecord({
    businessId: params.businessId,
    leadId: params.leadId ?? null,
    fromPhone: params.fromPhone,
    toPhone: params.toPhone,
    body: params.body,
    participant: params.participant,
    twilioSid: params.twilioSid,
    status: params.status ?? null,
    rawPayload: {
      source: 'twilio_api',
      context: params.context,
      statusCallback: params.statusCallback,
      messagingServiceSid: params.messagingServiceSid ?? null,
    },
    twilioCreatedAt: params.twilioCreatedAt ?? undefined,
  });
}
