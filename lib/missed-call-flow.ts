import { LeadStatus, SmsConversationState, type Business, type Lead } from '@prisma/client';

import { db } from '@/lib/db';
import { buildLeadSummary, getLeadReadiness, getQualifiedLeadStatus, isLeadQualified } from '@/lib/lead-qualification';
import { notifyQualifiedLeadIfNeeded } from '@/lib/owner-notifications';
import { normalizePhoneNumber } from '@/lib/phone';
import { advanceLeadConversation, getServicePrompt } from '@/lib/sms-state-machine';
import { isSubscriptionActive } from '@/lib/subscription';
import { persistInboundMessage, persistOutboundMessageRecord, sendAndPersistOutboundMessage } from '@/lib/twilio-messaging';

type LeadFlowBusiness = Pick<
  Business,
  | 'id'
  | 'name'
  | 'ownerClerkId'
  | 'notifyPhone'
  | 'twilioSubaccountSid'
  | 'twilioMessagingServiceSid'
  | 'twilioPhoneNumber'
  | 'twilioPrimaryPhoneNumber'
  | 'managedTwilioStatus'
  | 'a2pFailureReason'
  | 'subscriptionStatus'
  | 'serviceLabel1'
  | 'serviceLabel2'
  | 'serviceLabel3'
>;

type StartRecoveryParams = {
  business: LeadFlowBusiness;
  callerPhone: string;
  callId?: string | null;
  isSimulator?: boolean;
  transport?: 'twilio' | 'simulated';
  forceAutomation?: boolean;
};

type ProcessReplyParams = {
  business: LeadFlowBusiness;
  leadId: string;
  body: string;
  fromPhone: string;
  toPhone: string;
  twilioSid?: string | null;
  rawPayload?: Record<string, string>;
  transport?: 'twilio' | 'simulated';
  skipInboundPersist?: boolean;
};

function getBusinessTextingNumber(business: Pick<LeadFlowBusiness, 'twilioPrimaryPhoneNumber' | 'twilioPhoneNumber'>) {
  return business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || null;
}

async function deliverLeadMessage(params: {
  businessId: string;
  leadId: string;
  fromPhone: string;
  toPhone: string;
  body: string;
  transport: 'twilio' | 'simulated';
  isSimulator?: boolean;
  twilioSubaccountSid?: string | null;
  twilioMessagingServiceSid?: string | null;
  managedTwilioStatus?: Business['managedTwilioStatus'];
  a2pFailureReason?: string | null;
}) {
  if (params.transport === 'simulated' || params.isSimulator) {
    const message = await persistOutboundMessageRecord({
      businessId: params.businessId,
      leadId: params.leadId,
      fromPhone: params.fromPhone,
      toPhone: params.toPhone,
      body: params.body,
      status: 'simulated',
      rawPayload: { source: 'simulator' },
    });
    return { suppressed: false as const, simulated: true as const, message };
  }

  return sendAndPersistOutboundMessage({
    businessId: params.businessId,
    leadId: params.leadId,
    fromPhone: params.fromPhone,
    toPhone: params.toPhone,
    body: params.body,
    twilioSubaccountSid: params.twilioSubaccountSid,
    messagingServiceSid: params.twilioMessagingServiceSid,
    managedTwilioStatus: params.managedTwilioStatus,
    a2pFailureReason: params.a2pFailureReason,
  });
}

function buildLeadLifecycleUpdate(
  lead: Pick<
    Lead,
    | 'status'
    | 'qualifiedAt'
    | 'notifiedAt'
    | 'serviceType'
    | 'serviceRequested'
    | 'urgency'
    | 'location'
    | 'zipCode'
    | 'callbackRequested'
    | 'callerName'
    | 'contactName'
    | 'callerPhoneNormalized'
  > & Record<string, unknown>
) {
  const qualified = isLeadQualified(lead);
  return {
    readiness: getLeadReadiness(lead),
    summary: buildLeadSummary(lead),
    qualifiedAt: qualified ? lead.qualifiedAt || new Date() : null,
    status: getQualifiedLeadStatus(lead),
  };
}

export async function startMissedCallRecovery(params: StartRecoveryParams) {
  const callerPhoneNormalized = normalizePhoneNumber(params.callerPhone) || params.callerPhone;
  const now = new Date();

  let lead =
    (params.callId
      ? await db.lead.findUnique({ where: { callId: params.callId } })
      : await db.lead.findFirst({
          where: {
            businessId: params.business.id,
            callerPhoneNormalized,
            smsState: { not: SmsConversationState.COMPLETED },
          },
          orderBy: { createdAt: 'desc' },
        })) || null;

  if (!lead) {
    lead = await db.lead.create({
      data: {
        businessId: params.business.id,
        callId: params.callId ?? null,
        callerPhone: params.callerPhone,
        callerPhoneNormalized,
        billingRequired: params.forceAutomation ? false : !isSubscriptionActive(params.business),
        smsState: SmsConversationState.NOT_STARTED,
        isSimulator: Boolean(params.isSimulator),
        lastInteractionAt: now,
      },
    });
  }

  const fromPhone = getBusinessTextingNumber(params.business);
  if (!fromPhone || lead.smsStartedAt || (!params.forceAutomation && lead.billingRequired)) {
    return {
      lead,
      started: false as const,
      reason: !fromPhone
        ? ('missing_twilio_number' as const)
        : lead.smsStartedAt
          ? ('already_started' as const)
          : ('billing_required' as const),
    };
  }

  const prompt = getServicePrompt(params.business);
  const sendResult = await deliverLeadMessage({
    businessId: params.business.id,
    leadId: lead.id,
    fromPhone,
    toPhone: callerPhoneNormalized,
    body: prompt,
    transport: params.transport ?? (params.isSimulator ? 'simulated' : 'twilio'),
    isSimulator: params.isSimulator,
    twilioSubaccountSid: params.business.twilioSubaccountSid,
    twilioMessagingServiceSid: params.business.twilioMessagingServiceSid,
    managedTwilioStatus: params.business.managedTwilioStatus,
    a2pFailureReason: params.business.a2pFailureReason,
  });

  if (!sendResult.suppressed) {
    lead = await db.lead.update({
      where: { id: lead.id },
      data: {
        smsState: SmsConversationState.AWAITING_SERVICE,
        smsStartedAt: now,
        lastOutboundAt: now,
        lastInteractionAt: now,
      },
    });
  }

  return {
    lead,
    started: !sendResult.suppressed,
    reason: sendResult.suppressed ? sendResult.reason : ('started' as const),
  };
}

export async function processLeadInboundReply(params: ProcessReplyParams) {
  const lead = await db.lead.findUnique({ where: { id: params.leadId } });
  if (!lead || lead.businessId !== params.business.id) {
    throw new Error('Lead not found for inbound reply');
  }

  if (!params.skipInboundPersist) {
    const inbound = await persistInboundMessage({
      businessId: params.business.id,
      leadId: lead.id,
      twilioSid: params.twilioSid ?? null,
      fromPhone: params.fromPhone,
      toPhone: params.toPhone,
      body: params.body,
      rawPayload: params.rawPayload,
    });

    if (inbound.duplicate) {
      return { lead, transition: null, duplicate: true as const };
    }
  }

  const transition = advanceLeadConversation(lead, params.body, params.business);
  const now = new Date();
  const nextLeadState = {
    ...lead,
    ...(transition.leadUpdates ?? {}),
  };
  const lifecycle = buildLeadLifecycleUpdate(nextLeadState);

  let updatedLead = await db.lead.update({
    where: { id: lead.id },
    data: {
      ...(transition.nextState ? { smsState: transition.nextState } : {}),
      ...(transition.leadUpdates ?? {}),
      readiness: lifecycle.readiness,
      summary: lifecycle.summary,
      qualifiedAt: lifecycle.qualifiedAt,
      status: lifecycle.status,
      ...(transition.completed ? { smsCompletedAt: now } : {}),
      lastInboundAt: now,
      lastInteractionAt: now,
    },
  });

  let notificationResult: Awaited<ReturnType<typeof notifyQualifiedLeadIfNeeded>> | null = null;
  if (isLeadQualified(updatedLead)) {
    notificationResult = await notifyQualifiedLeadIfNeeded(updatedLead.id);
    updatedLead = await db.lead.findUniqueOrThrow({ where: { id: updatedLead.id } });
  }

  if (lead.isSimulator) {
    await db.simulatorRun.updateMany({
      where: { leadId: updatedLead.id },
      data: {
        status: updatedLead.smsState === SmsConversationState.COMPLETED ? 'COMPLETED' : isLeadQualified(updatedLead) ? 'QUALIFIED' : 'ACTIVE',
      },
    });
  }

  const fromPhone = getBusinessTextingNumber(params.business);
  if (!fromPhone) {
    return { lead: updatedLead, transition, duplicate: false as const, notificationResult };
  }

  const sendResult = await deliverLeadMessage({
    businessId: params.business.id,
    leadId: updatedLead.id,
    fromPhone,
    toPhone: normalizePhoneNumber(params.fromPhone) || params.fromPhone,
    body: transition.responseText,
    transport: params.transport ?? (lead.isSimulator ? 'simulated' : 'twilio'),
    isSimulator: lead.isSimulator,
    twilioSubaccountSid: params.business.twilioSubaccountSid,
    twilioMessagingServiceSid: params.business.twilioMessagingServiceSid,
    managedTwilioStatus: params.business.managedTwilioStatus,
    a2pFailureReason: params.business.a2pFailureReason,
  });

  if (!sendResult.suppressed) {
    updatedLead = await db.lead.update({
      where: { id: updatedLead.id },
      data: {
        lastOutboundAt: now,
        lastInteractionAt: now,
      },
    });
  }

  return { lead: updatedLead, transition, duplicate: false as const, notificationResult };
}
