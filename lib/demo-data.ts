export type DemoInboxLead = {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceType: string;
  urgency: string;
  location: string;
  status: 'Qualified' | 'New' | 'Contacted';
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
    customerPhone: '+1 (512) 555-0189',
    serviceType: 'AC repair',
    urgency: 'Today',
    location: 'Austin, TX 78704',
    status: 'Qualified',
    readiness: 'Hot Lead',
    createdLabel: '2 minutes ago',
  },
  {
    id: 'lead-no-cool',
    customerName: 'Maya Brooks',
    customerPhone: '+1 (512) 555-0114',
    serviceType: 'No-cool diagnosis',
    urgency: 'This afternoon',
    location: 'Round Rock, TX 78664',
    status: 'Contacted',
    readiness: 'Working',
    createdLabel: '14 minutes ago',
  },
  {
    id: 'lead-maintenance',
    customerName: 'Ryan Patel',
    customerPhone: '+1 (512) 555-0172',
    serviceType: 'Spring tune-up',
    urgency: 'This week',
    location: 'Cedar Park, TX 78613',
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
    body: 'Hey Jamie, sorry we missed your call. What is going on with your HVAC?',
    timestamp: '2:14 PM',
  },
  {
    id: 'msg-2',
    sender: 'customer',
    label: 'Jamie Carter',
    body: 'AC is not cooling at all.',
    timestamp: '2:14 PM',
  },
  {
    id: 'msg-3',
    sender: 'system',
    label: 'CallbackCloser',
    body: 'Got it. Is this a repair or a new install?',
    timestamp: '2:15 PM',
  },
  {
    id: 'msg-4',
    sender: 'customer',
    label: 'Jamie Carter',
    body: 'Repair.',
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
];

export const demoHeroStats = [
  {
    label: 'Response speed',
    value: '< 60 seconds',
    detail: 'Missed callers hear back before they move on to the next HVAC company.',
  },
  {
    label: 'Lead quality',
    value: 'Service + urgency captured',
    detail: 'Your team sees the repair need and timing before making the callback.',
  },
  {
    label: 'Owner handoff',
    value: 'Hot lead alert',
    detail: 'Qualified jobs are handed off with the context needed to close fast.',
  },
];

export const demoWorkflowSteps = [
  {
    title: 'Customer calls',
    detail: 'A homeowner tries to book service while your team is on jobs.',
  },
  {
    title: 'You miss it',
    detail: 'Instead of going dark, CallbackCloser starts the follow-up immediately.',
  },
  {
    title: 'We text and qualify',
    detail: 'You get the job type, urgency, and callback context without chasing the lead.',
  },
];

export const demoLeadDetail = {
  customerName: 'Jamie Carter',
  customerPhone: '+1 (512) 555-0189',
  serviceType: 'Repair',
  issueSummary: 'AC is not cooling',
  urgency: 'Today',
  location: 'Austin, TX 78704',
  callbackWindow: 'Call back before 4 PM',
  status: 'Qualified',
  readiness: 'Hot Lead',
  createdAt: 'Today · 2:14 PM',
  qualifiedAt: '2:16 PM',
};

export const demoOwnerAlert = {
  headline: 'New HVAC lead',
  service: 'Repair',
  urgency: 'Today',
  customerName: 'Jamie Carter',
  customerPhone: '+1 (512) 555-0189',
  summary: 'AC is not cooling. Austin, TX 78704. Asked for service today and can answer before 4 PM.',
  footer: 'View in dashboard',
};

export const demoTrustPoints = [
  'Public demo only. No login, no real customer data, no live Twilio traffic.',
  'Built to look like the real CallbackCloser lead workspace your team would use.',
  'Safe to open during live sales calls when you need to show the value fast.',
];
