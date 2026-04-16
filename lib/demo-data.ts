export type DemoInboxLead = {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceType: string;
  urgency: string;
  location: string;
  status: 'Ready for callback' | 'New' | 'Contacted';
  readiness: 'Hot Lead' | 'Working' | 'Needs follow-up';
  createdLabel: string;
};

export type DemoConversationMessage = {
  id: string;
  sender: 'system' | 'customer';
  label: string;
  body: string;
  timestamp: string;
};

export const demoInboxLeads: DemoInboxLead[] = [
  {
    id: 'lead-hvac-repair',
    customerName: 'Jamie Carter',
    customerPhone: '+1 (865) 555-0148',
    serviceType: 'Repair',
    urgency: 'Today',
    location: 'Knoxville, TN 37923',
    status: 'Ready for callback',
    readiness: 'Hot Lead',
    createdLabel: '2 minutes ago',
  },
  {
    id: 'lead-no-cool',
    customerName: 'Maya Brooks',
    customerPhone: '+1 (865) 555-0194',
    serviceType: 'No-cool diagnosis',
    urgency: 'This afternoon',
    location: 'Farragut, TN 37934',
    status: 'Contacted',
    readiness: 'Working',
    createdLabel: '14 minutes ago',
  },
  {
    id: 'lead-maintenance',
    customerName: 'Ryan Patel',
    customerPhone: '+1 (865) 555-0112',
    serviceType: 'Spring tune-up',
    urgency: 'This week',
    location: 'Powell, TN 37849',
    status: 'New',
    readiness: 'Needs follow-up',
    createdLabel: '31 minutes ago',
  },
];

export const demoConversationMessages: DemoConversationMessage[] = [
  {
    id: 'msg-1',
    sender: 'system',
    label: 'CallbackCloser',
    body: 'Hey — sorry we missed your call. What’s going on with your HVAC?',
    timestamp: '2:14 PM',
  },
  {
    id: 'msg-2',
    sender: 'customer',
    label: 'Jamie Carter',
    body: 'My AC isn’t cooling.',
    timestamp: '2:14 PM',
  },
  {
    id: 'msg-3',
    sender: 'system',
    label: 'CallbackCloser',
    body: 'Got it — is this a repair or a new install?',
    timestamp: '2:15 PM',
  },
  {
    id: 'msg-4',
    sender: 'customer',
    label: 'Jamie Carter',
    body: 'Repair',
    timestamp: '2:15 PM',
  },
  {
    id: 'msg-5',
    sender: 'system',
    label: 'CallbackCloser',
    body: 'How soon do you need someone out?',
    timestamp: '2:15 PM',
  },
  {
    id: 'msg-6',
    sender: 'customer',
    label: 'Jamie Carter',
    body: 'Today if possible.',
    timestamp: '2:16 PM',
  },
  {
    id: 'msg-7',
    sender: 'system',
    label: 'CallbackCloser',
    body: 'Perfect — someone will reach out shortly. If there’s anything else we should know, you can text it here.',
    timestamp: '2:16 PM',
  },
];

export const demoHeroStats = [
  {
    label: 'Missed call value',
    value: '$300-$1,000 jobs',
    detail: 'One missed HVAC call can turn into a repair job that goes to the next company.',
  },
  {
    label: 'Response speed',
    value: 'Texts in seconds',
    detail: 'The homeowner gets a reply before they start calling down the list.',
  },
  {
    label: 'What you get back',
    value: 'Hot lead alert',
    detail: 'You see the issue, service type, and urgency before you call them back.',
  },
];

export const demoWorkflowSteps = [
  {
    title: 'Customer calls your business',
    detail: 'A homeowner reaches out when they need HVAC help now.',
  },
  {
    title: 'You miss the call',
    detail: 'Instead of silence, CallbackCloser starts the follow-up immediately.',
  },
  {
    title: 'CallbackCloser texts and sends the lead',
    detail: 'You get the issue, service type, urgency, and callback context while they are still ready to book.',
  },
];

export const demoLeadDetail = {
  customerName: 'Jamie Carter',
  customerPhone: '+1 (865) 555-0148',
  serviceType: 'Repair',
  issueSummary: 'AC not cooling',
  urgency: 'Today',
  location: 'Knoxville, TN 37923',
  callbackWindow: 'Call back before 4 PM',
  status: 'Ready for callback',
  readiness: 'Hot Lead',
  createdAt: 'Today · 2:14 PM',
  qualifiedAt: '2:16 PM',
};

export const demoOwnerAlert = {
  headline: 'New HVAC lead',
  service: 'Repair',
  urgency: 'Today',
  issue: 'AC not cooling',
  customerName: 'Jamie Carter',
  customerPhone: '+1 (865) 555-0148',
  summary: 'Instead of losing the call, you get another shot at the job.',
  footer: 'View in dashboard',
};

export const demoTrustPoints = [
  'Public demo only. No login, no real customer data, no live Twilio traffic.',
  'Built to feel like the real CallbackCloser lead workspace your team would use.',
  'Safe to open during live sales calls when you need to show the value fast.',
];
