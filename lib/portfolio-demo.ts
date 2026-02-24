import {
  LeadStatus,
  MessageDirection,
  MessageParticipant,
  SmsConversationState,
  SubscriptionStatus,
  type Business,
  type Call,
  type Lead,
  type Message,
} from '@prisma/client';

type LeadListRow = Lead & { messages: Message[] };
type LeadDetailRecord = Lead & { call: Call | null; messages: Message[] };

const DEMO_USER_ID = 'user_portfolio_demo';
const DEMO_BUSINESS_ID = 'biz_portfolio_demo';

export function isPortfolioDemoMode() {
  return process.env.PORTFOLIO_DEMO_MODE === '1';
}

export function getPortfolioDemoAuth() {
  return { userId: DEMO_USER_ID };
}

const demoBusiness: Business = {
  id: DEMO_BUSINESS_ID,
  ownerClerkId: DEMO_USER_ID,
  name: 'Northside HVAC & Plumbing (Demo)',
  forwardingNumber: '+15125550111',
  notifyPhone: '+15125550199',
  missedCallSeconds: 22,
  serviceLabel1: 'Repair',
  serviceLabel2: 'Install',
  serviceLabel3: 'Maintenance',
  timezone: 'America/Chicago',
  twilioPhoneNumber: '+15125550123',
  twilioPhoneNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  twilioWebhookSyncedAt: new Date('2026-02-24T15:14:00.000Z'),
  stripeCustomerId: 'cus_demo_portfolio_001',
  stripeSubscriptionId: 'sub_demo_portfolio_001',
  stripePriceId: 'price_demo_portfolio_pro',
  subscriptionStatus: SubscriptionStatus.ACTIVE,
  subscriptionStatusUpdatedAt: new Date('2026-02-23T18:00:00.000Z'),
  createdAt: new Date('2026-02-20T14:00:00.000Z'),
  updatedAt: new Date('2026-02-24T15:14:00.000Z'),
};

function makeCall(input: Partial<Call> & Pick<Call, 'id' | 'twilioCallSid' | 'fromPhone' | 'fromPhoneNormalized' | 'toPhone' | 'toPhoneNormalized' | 'status' | 'businessId'>): Call {
  return {
    parentCallSid: null,
    dialCallSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    dialCallStatus: 'no-answer',
    callDurationSeconds: 18,
    dialCallDurationSeconds: 0,
    answered: false,
    missed: true,
    rawPayload: null,
    createdAt: new Date('2026-02-24T15:00:00.000Z'),
    updatedAt: new Date('2026-02-24T15:00:18.000Z'),
    ...input,
  };
}

function makeLead(input: Partial<Lead> & Pick<Lead, 'id' | 'businessId' | 'callerPhone' | 'callerPhoneNormalized' | 'status' | 'smsState'>): Lead {
  return {
    callId: null,
    billingRequired: false,
    serviceRequested: null,
    serviceSelectionRaw: null,
    urgency: null,
    zipCode: null,
    bestTime: null,
    contactName: null,
    ownerNotifiedAt: null,
    smsStartedAt: null,
    smsCompletedAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    lastInteractionAt: null,
    createdAt: new Date('2026-02-24T14:00:00.000Z'),
    updatedAt: new Date('2026-02-24T14:05:00.000Z'),
    ...input,
  };
}

function makeMessage(input: Partial<Message> & Pick<Message, 'id' | 'businessId' | 'direction' | 'participant' | 'fromPhone' | 'toPhone' | 'body'>): Message {
  return {
    leadId: null,
    twilioSid: null,
    status: 'delivered',
    rawPayload: null,
    twilioCreatedAt: null,
    createdAt: new Date('2026-02-24T14:00:00.000Z'),
    updatedAt: new Date('2026-02-24T14:00:00.000Z'),
    ...input,
  };
}

const callA = makeCall({
  id: 'call_demo_001',
  businessId: DEMO_BUSINESS_ID,
  twilioCallSid: 'CA2f37c1a3b4d55e66778899aa11bb22c3',
  fromPhone: '+15125550177',
  fromPhoneNormalized: '+15125550177',
  toPhone: '+15125550123',
  toPhoneNormalized: '+15125550123',
  status: 'completed',
  createdAt: new Date('2026-02-24T14:08:12.000Z'),
  updatedAt: new Date('2026-02-24T14:08:38.000Z'),
});

const leadA = makeLead({
  id: 'lead_demo_001',
  businessId: DEMO_BUSINESS_ID,
  callId: callA.id,
  callerPhone: '+15125550177',
  callerPhoneNormalized: '+15125550177',
  status: LeadStatus.BOOKED,
  billingRequired: false,
  smsState: SmsConversationState.COMPLETED,
  serviceRequested: 'Water heater repair',
  serviceSelectionRaw: '1',
  urgency: 'Today',
  zipCode: '78704',
  bestTime: 'Afternoon',
  contactName: 'Pat Morgan',
  ownerNotifiedAt: new Date('2026-02-24T14:10:12.000Z'),
  smsStartedAt: new Date('2026-02-24T14:08:45.000Z'),
  smsCompletedAt: new Date('2026-02-24T14:12:01.000Z'),
  lastInboundAt: new Date('2026-02-24T14:11:44.000Z'),
  lastOutboundAt: new Date('2026-02-24T14:12:01.000Z'),
  lastInteractionAt: new Date('2026-02-24T14:12:01.000Z'),
  createdAt: new Date('2026-02-24T14:08:40.000Z'),
  updatedAt: new Date('2026-02-24T14:12:01.000Z'),
});

const leadAMessages: Message[] = [
  makeMessage({
    id: 'msg_demo_001',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    direction: MessageDirection.OUTBOUND,
    participant: MessageParticipant.OWNER,
    fromPhone: '+15125550123',
    toPhone: '+15125550177',
    body: 'Thanks for calling Northside HVAC & Plumbing. What do you need help with? Reply 1 Repair, 2 Install, 3 Maintenance.',
    twilioSid: 'SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    createdAt: new Date('2026-02-24T14:08:46.000Z'),
    updatedAt: new Date('2026-02-24T14:08:46.000Z'),
  }),
  makeMessage({
    id: 'msg_demo_002',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    direction: MessageDirection.INBOUND,
    participant: MessageParticipant.LEAD,
    fromPhone: '+15125550177',
    toPhone: '+15125550123',
    body: '1',
    twilioSid: 'SMbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    createdAt: new Date('2026-02-24T14:09:03.000Z'),
    updatedAt: new Date('2026-02-24T14:09:03.000Z'),
  }),
  makeMessage({
    id: 'msg_demo_003',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    direction: MessageDirection.OUTBOUND,
    participant: MessageParticipant.OWNER,
    fromPhone: '+15125550123',
    toPhone: '+15125550177',
    body: 'How urgent is it? Reply 1 Emergency, 2 Today, 3 This week, 4 Quote.',
    twilioSid: 'SMcccccccccccccccccccccccccccccccc',
    createdAt: new Date('2026-02-24T14:09:05.000Z'),
    updatedAt: new Date('2026-02-24T14:09:05.000Z'),
  }),
  makeMessage({
    id: 'msg_demo_004',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    direction: MessageDirection.INBOUND,
    participant: MessageParticipant.LEAD,
    fromPhone: '+15125550177',
    toPhone: '+15125550123',
    body: '2',
    twilioSid: 'SMdddddddddddddddddddddddddddddddd',
    createdAt: new Date('2026-02-24T14:09:19.000Z'),
    updatedAt: new Date('2026-02-24T14:09:19.000Z'),
  }),
  makeMessage({
    id: 'msg_demo_005',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    direction: MessageDirection.OUTBOUND,
    participant: MessageParticipant.OWNER,
    fromPhone: '+15125550123',
    toPhone: '+15125550177',
    body: 'What is the job ZIP code?',
    twilioSid: 'SMeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    createdAt: new Date('2026-02-24T14:09:21.000Z'),
    updatedAt: new Date('2026-02-24T14:09:21.000Z'),
  }),
  makeMessage({
    id: 'msg_demo_006',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    direction: MessageDirection.INBOUND,
    participant: MessageParticipant.LEAD,
    fromPhone: '+15125550177',
    toPhone: '+15125550123',
    body: '78704',
    twilioSid: 'SMffffffffffffffffffffffffffffffff',
    createdAt: new Date('2026-02-24T14:10:11.000Z'),
    updatedAt: new Date('2026-02-24T14:10:11.000Z'),
  }),
  makeMessage({
    id: 'msg_demo_007',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    direction: MessageDirection.OUTBOUND,
    participant: MessageParticipant.OWNER,
    fromPhone: '+15125550123',
    toPhone: '+15125550177',
    body: 'Best time for a callback? Reply morning, afternoon, or evening.',
    twilioSid: 'SM11111111111111111111111111111111',
    createdAt: new Date('2026-02-24T14:10:13.000Z'),
    updatedAt: new Date('2026-02-24T14:10:13.000Z'),
  }),
  makeMessage({
    id: 'msg_demo_008',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    direction: MessageDirection.INBOUND,
    participant: MessageParticipant.LEAD,
    fromPhone: '+15125550177',
    toPhone: '+15125550123',
    body: 'Afternoon',
    twilioSid: 'SM22222222222222222222222222222222',
    createdAt: new Date('2026-02-24T14:10:48.000Z'),
    updatedAt: new Date('2026-02-24T14:10:48.000Z'),
  }),
  makeMessage({
    id: 'msg_demo_009',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    direction: MessageDirection.OUTBOUND,
    participant: MessageParticipant.OWNER,
    fromPhone: '+15125550123',
    toPhone: '+15125550177',
    body: 'Optional: what name should we ask for? Reply with your name or type skip.',
    twilioSid: 'SM33333333333333333333333333333333',
    createdAt: new Date('2026-02-24T14:10:50.000Z'),
    updatedAt: new Date('2026-02-24T14:10:50.000Z'),
  }),
  makeMessage({
    id: 'msg_demo_010',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    direction: MessageDirection.INBOUND,
    participant: MessageParticipant.LEAD,
    fromPhone: '+15125550177',
    toPhone: '+15125550123',
    body: 'Pat Morgan',
    twilioSid: 'SM44444444444444444444444444444444',
    createdAt: new Date('2026-02-24T14:11:44.000Z'),
    updatedAt: new Date('2026-02-24T14:11:44.000Z'),
  }),
  makeMessage({
    id: 'msg_demo_011',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    direction: MessageDirection.OUTBOUND,
    participant: MessageParticipant.OWNER,
    fromPhone: '+15125550123',
    toPhone: '+15125550177',
    body: 'Thanks - we have your details and will reach out shortly.',
    twilioSid: 'SM55555555555555555555555555555555',
    createdAt: new Date('2026-02-24T14:12:01.000Z'),
    updatedAt: new Date('2026-02-24T14:12:01.000Z'),
  }),
];

const leadB = makeLead({
  id: 'lead_demo_002',
  businessId: DEMO_BUSINESS_ID,
  callerPhone: '+15125550222',
  callerPhoneNormalized: '+15125550222',
  status: LeadStatus.QUALIFIED,
  billingRequired: false,
  smsState: SmsConversationState.AWAITING_BEST_TIME,
  serviceRequested: 'AC not cooling',
  serviceSelectionRaw: 'AC not cooling',
  urgency: 'Today',
  zipCode: '78660',
  ownerNotifiedAt: new Date('2026-02-24T13:36:02.000Z'),
  smsStartedAt: new Date('2026-02-24T13:33:21.000Z'),
  lastInboundAt: new Date('2026-02-24T13:35:52.000Z'),
  lastOutboundAt: new Date('2026-02-24T13:35:53.000Z'),
  lastInteractionAt: new Date('2026-02-24T13:35:53.000Z'),
  createdAt: new Date('2026-02-24T13:33:19.000Z'),
  updatedAt: new Date('2026-02-24T13:35:53.000Z'),
});

const leadBMessages: Message[] = [
  makeMessage({
    id: 'msg_demo_020',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadB.id,
    direction: MessageDirection.OUTBOUND,
    participant: MessageParticipant.OWNER,
    fromPhone: '+15125550123',
    toPhone: '+15125550222',
    body: 'Thanks for calling Northside HVAC & Plumbing. What do you need help with?',
    createdAt: new Date('2026-02-24T13:33:21.000Z'),
    updatedAt: new Date('2026-02-24T13:33:21.000Z'),
  }),
  makeMessage({
    id: 'msg_demo_021',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadB.id,
    direction: MessageDirection.INBOUND,
    participant: MessageParticipant.LEAD,
    fromPhone: '+15125550222',
    toPhone: '+15125550123',
    body: 'AC not cooling',
    createdAt: new Date('2026-02-24T13:34:00.000Z'),
    updatedAt: new Date('2026-02-24T13:34:00.000Z'),
  }),
];

const leadC = makeLead({
  id: 'lead_demo_003',
  businessId: DEMO_BUSINESS_ID,
  callerPhone: '+15125550333',
  callerPhoneNormalized: '+15125550333',
  status: LeadStatus.NEW,
  billingRequired: true,
  smsState: SmsConversationState.NOT_STARTED,
  createdAt: new Date('2026-02-24T12:52:10.000Z'),
  updatedAt: new Date('2026-02-24T12:52:10.000Z'),
});

const leadCMessages: Message[] = [];

const demoLeadRecords: LeadDetailRecord[] = [
  { ...leadA, call: callA, messages: leadAMessages },
  { ...leadB, call: null, messages: leadBMessages },
  { ...leadC, call: null, messages: leadCMessages },
];

export function getPortfolioDemoBusiness(): Business {
  return { ...demoBusiness };
}

export function getPortfolioDemoLeads(statusFilter: LeadStatus | null): LeadListRow[] {
  return demoLeadRecords
    .filter((lead) => (statusFilter ? lead.status === statusFilter : true))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((lead) => ({ ...lead, messages: lead.messages.slice(-1) }));
}

export function getPortfolioDemoBlockedCount() {
  return demoLeadRecords.filter((lead) => lead.billingRequired).length;
}

export function getPortfolioDemoLeadDetail(leadId: string): LeadDetailRecord | null {
  const lead = demoLeadRecords.find((item) => item.id === leadId);
  return lead ? { ...lead, messages: [...lead.messages] } : null;
}

export function getPortfolioDemoTwilioNumbers() {
  return [
    { sid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', phoneNumber: '+15125550123', friendlyName: 'Main Dispatch' },
    { sid: 'PNyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy', phoneNumber: '+15125550999', friendlyName: 'Overflow Line' },
  ];
}

export function getPortfolioDemoWebhookConfig() {
  const appBaseUrl = 'https://demo-callbackcloser.ngrok-free.app';
  return {
    appBaseUrl,
    voiceUrl: `${appBaseUrl}/api/twilio/voice?token=whsec_demo_portfolio_voice_12345`,
    smsUrl: `${appBaseUrl}/api/twilio/sms?token=whsec_demo_portfolio_sms_12345`,
    statusUrl: `${appBaseUrl}/api/twilio/status?token=whsec_demo_portfolio_status_12345`,
  };
}
