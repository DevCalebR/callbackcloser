import {
  BusinessProvisioningStatus,
  LeadStatus,
  LeadReadiness,
  ManagedTwilioStatus,
  MessagingComplianceType,
  MessageDirection,
  OwnerNotificationChannel,
  OwnerNotificationStatus,
  MessageParticipant,
  SmsConversationState,
  SubscriptionStatus,
  TollFreeVerificationStatus,
  type Business,
  type Call,
  type Lead,
  type Message,
  type OwnerNotification,
} from '@prisma/client';

type LeadListRow = Lead & { messages: Message[] };
type LeadDetailRecord = Lead & { call: Call | null; messages: Message[]; ownerNotifications: OwnerNotification[] };

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
  ownerName: 'Jordan Smith',
  isTestBusiness: false,
  archivedAt: null,
  forwardingNumber: '+15125550111',
  notifyPhone: '+15125550199',
  provisioningStatus: BusinessProvisioningStatus.LIVE,
  provisioningLastRunAt: new Date('2026-02-24T15:14:00.000Z'),
  provisioningError: null,
  ownerInviteSentAt: null,
  internalNotes: null,
  missedCallSeconds: 22,
  serviceLabel1: 'Repair',
  serviceLabel2: 'Install',
  serviceLabel3: 'Maintenance',
  timezone: 'America/Chicago',
  twilioAccountMode: 'BUSINESS_SUBACCOUNT',
  twilioNumberSetupMode: 'NEW_NUMBER',
  twilioSubaccountSid: 'ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  twilioMessagingServiceSid: 'MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  twilioPrimaryNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  twilioPrimaryPhoneNumber: '+15125550123',
  messagingComplianceType: MessagingComplianceType.LOCAL_A2P,
  a2pCustomerProfileSid: 'BUbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  a2pBrandSid: 'BNbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  a2pCampaignSid: 'QEbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
  managedTwilioStatusUpdatedAt: new Date('2026-02-24T15:14:00.000Z'),
  tollFreeVerificationStatus: TollFreeVerificationStatus.NOT_APPLICABLE,
  tollFreeVerificationSid: null,
  tollFreeVerificationNote: null,
  a2pFailureReason: null,
  twilioProvisioningStartedAt: new Date('2026-02-21T12:00:00.000Z'),
  twilioProvisionedAt: new Date('2026-02-21T12:20:00.000Z'),
  a2pSubmittedAt: new Date('2026-02-22T14:00:00.000Z'),
  a2pApprovedAt: new Date('2026-02-23T17:30:00.000Z'),
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
    recordingSid: null,
    recordingUrl: null,
    recordingStatus: null,
    recordingDurationSeconds: null,
    answered: false,
    missed: true,
    isSimulator: false,
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
    location: null,
    bestTime: null,
    contactName: null,
    callerName: null,
    serviceType: null,
    callbackRequested: null,
    summary: null,
    readiness: LeadReadiness.PENDING,
    qualifiedAt: null,
    notifiedAt: null,
    ownerNotifiedAt: null,
    usageLimitNotifiedAt: null,
    smsStartedAt: null,
    smsCompletedAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    lastInteractionAt: null,
    isSimulator: false,
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
    isSimulator: false,
    rawPayload: null,
    twilioCreatedAt: null,
    createdAt: new Date('2026-02-24T14:00:00.000Z'),
    updatedAt: new Date('2026-02-24T14:00:00.000Z'),
    ...input,
  };
}

function makeOwnerNotification(
  input: Partial<OwnerNotification> &
    Pick<OwnerNotification, 'id' | 'businessId' | 'leadId' | 'channel' | 'status' | 'body'>
): OwnerNotification {
  return {
    destination: null,
    subject: null,
    error: null,
    metadata: null,
    sentAt: new Date('2026-02-24T14:10:12.000Z'),
    createdAt: new Date('2026-02-24T14:10:12.000Z'),
    updatedAt: new Date('2026-02-24T14:10:12.000Z'),
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
  readiness: LeadReadiness.URGENT,
  serviceRequested: 'Water heater repair',
  serviceType: 'Water heater repair',
  serviceSelectionRaw: '1',
  urgency: 'Today',
  zipCode: '78704',
  location: '78704',
  bestTime: 'Afternoon',
  contactName: 'Pat Morgan',
  callerName: 'Pat Morgan',
  callbackRequested: true,
  summary: 'Service: Water heater repair | Urgency: Today | Location: 78704 | Callback requested | Caller: Pat Morgan | Phone: +15125550177',
  qualifiedAt: new Date('2026-02-24T14:09:20.000Z'),
  notifiedAt: new Date('2026-02-24T14:10:12.000Z'),
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
    body: 'CallbackCloser: We missed your call. What service do you need? Reply 1 Repair, 2 Install, 3 Maintenance, or reply with a short description. Reply STOP to opt out or HELP for help. Msg freq varies. Msg & data rates may apply.',
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
    body: 'What ZIP code or service area is the job in?',
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
    body: 'Would you like a callback today? Reply yes or no.',
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
    body: 'Yes',
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
    body: 'What name should we attach to this request? Reply with your name or type skip.',
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
  status: LeadStatus.NOTIFIED,
  billingRequired: false,
  smsState: SmsConversationState.AWAITING_NAME,
  readiness: LeadReadiness.URGENT,
  serviceRequested: 'AC not cooling',
  serviceType: 'AC not cooling',
  serviceSelectionRaw: 'AC not cooling',
  urgency: 'Today',
  zipCode: '78660',
  location: '78660',
  callbackRequested: true,
  summary: 'Service: AC not cooling | Urgency: Today | Location: 78660 | Callback requested | Phone: +15125550222',
  qualifiedAt: new Date('2026-02-24T13:35:53.000Z'),
  notifiedAt: new Date('2026-02-24T13:36:02.000Z'),
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
    body: 'CallbackCloser: We missed your call. What service do you need? Reply 1 Repair, 2 Install, 3 Maintenance, or reply with a short description. Reply STOP to opt out or HELP for help. Msg freq varies. Msg & data rates may apply.',
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
  readiness: LeadReadiness.PENDING,
  createdAt: new Date('2026-02-24T12:52:10.000Z'),
  updatedAt: new Date('2026-02-24T12:52:10.000Z'),
});

const leadCMessages: Message[] = [];

const leadAOwnerNotifications: OwnerNotification[] = [
  makeOwnerNotification({
    id: 'notify_demo_001',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    channel: OwnerNotificationChannel.SMS,
    status: OwnerNotificationStatus.SENT,
    destination: '+15125550199',
    body: 'CallbackCloser lead for Northside HVAC & Plumbing (Demo): Water heater repair. Urgency: Today. Location: 78704. Readiness: Urgent.',
  }),
  makeOwnerNotification({
    id: 'notify_demo_002',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    channel: OwnerNotificationChannel.EMAIL,
    status: OwnerNotificationStatus.SENT,
    destination: 'owner@northsidedemo.com',
    subject: 'CallbackCloser lead: Water heater repair for Northside HVAC & Plumbing (Demo)',
    body: 'CallbackCloser qualified a missed-call lead for Northside HVAC & Plumbing (Demo).',
  }),
  makeOwnerNotification({
    id: 'notify_demo_003',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadA.id,
    channel: OwnerNotificationChannel.IN_APP,
    status: OwnerNotificationStatus.SENT,
    body: leadA.summary || 'Lead ready in dashboard',
  }),
];

const leadBOwnerNotifications: OwnerNotification[] = [
  makeOwnerNotification({
    id: 'notify_demo_004',
    businessId: DEMO_BUSINESS_ID,
    leadId: leadB.id,
    channel: OwnerNotificationChannel.SMS,
    status: OwnerNotificationStatus.SENT,
    destination: '+15125550199',
    body: 'CallbackCloser lead for Northside HVAC & Plumbing (Demo): AC not cooling. Urgency: Today. Location: 78660. Readiness: Urgent.',
    createdAt: new Date('2026-02-24T13:36:02.000Z'),
    updatedAt: new Date('2026-02-24T13:36:02.000Z'),
    sentAt: new Date('2026-02-24T13:36:02.000Z'),
  }),
];

const demoLeadRecords: LeadDetailRecord[] = [
  { ...leadA, call: callA, messages: leadAMessages, ownerNotifications: leadAOwnerNotifications },
  { ...leadB, call: null, messages: leadBMessages, ownerNotifications: leadBOwnerNotifications },
  { ...leadC, call: null, messages: leadCMessages, ownerNotifications: [] },
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
