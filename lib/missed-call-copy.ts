export const MISSED_CALL_SERVICE_EXAMPLES = ['Repair', 'estimate', 'installation', 'emergency', 'anything else'] as const;

export const MISSED_CALL_URGENCY_OPTIONS = [
  { value: 'Emergency', label: '1 Emergency' },
  { value: 'Today', label: '2 Today' },
  { value: 'This week', label: '3 This week' },
  { value: 'Just getting a quote', label: '4 Just getting a quote' },
] as const;

export const MISSED_CALL_CALLBACK_OPTIONS = [
  { value: 'ASAP', label: '1 ASAP' },
  { value: 'Morning', label: '2 Morning' },
  { value: 'Afternoon', label: '3 Afternoon' },
  { value: 'Evening', label: '4 Evening' },
] as const;

export function getMissedCallServicePrompt() {
  return `Hey, sorry we missed your call. What can we help you with today?

You can reply with something like:
Repair, estimate, installation, emergency, or anything else.
Reply STOP to opt out.`;
}

export function getMissedCallUrgencyPrompt() {
  return `Got it — how soon do you need help?

Reply:
1 Emergency
2 Today
3 This week
4 Just getting a quote`;
}

export function getMissedCallContactLocationPrompt() {
  return 'Thanks. What name should we put on the request, and what city/ZIP or service address is this for?';
}

export function getMissedCallCallbackPrompt() {
  return `What’s the best time for someone to call you back?

Reply:
1 ASAP
2 Morning
3 Afternoon
4 Evening`;
}

export function getMissedCallCompletionPrompt(customerName?: string | null) {
  const greeting = customerName ? `Thanks, ${customerName} —` : 'Thanks —';
  return `${greeting} we have your request. Someone will reach out as soon as possible.

If there’s anything important we should know, you can reply here.`;
}
