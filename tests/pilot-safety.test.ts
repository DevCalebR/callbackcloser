import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { formatMessageStatus, isMessageDeliveryIssueStatus } from '../lib/lead-presenters.ts';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('customer setup pages keep operator setup details out of owner view', () => {
  const settingsPage = read('app/app/settings/page.tsx');
  const callFlowPage = read('app/app/call-flow/page.tsx');
  const homeDashboard = read('components/home-dashboard.tsx');
  const leadsPage = read('app/app/leads/page.tsx');
  const leadDetailPage = read('app/app/leads/[leadId]/page.tsx');
  const conversationsPage = read('app/app/conversations/page.tsx');
  const billingPage = read('app/app/billing/page.tsx');
  const forbiddenOwnerTerms =
    /\bTwilio\b|\bA2P\b|toll-free|webhook|subaccount|\bSID\b|Provision routing number|Sync all webhooks|Test SMS|Messaging Service|account mode|admin-assisted|pilot sender|Finish activation|twilio-setup-flow|operator event|status callback|activation/i;

  assert.match(settingsPage, /Business settings/);
  assert.match(settingsPage, /Text replies/);
  assert.match(settingsPage, /Owner alerts/);
  assert.match(settingsPage, /Need setup help/);
  assert.match(callFlowPage, /How missed calls are handled/);
  assert.match(callFlowPage, /A customer calls/);
  assert.match(callFlowPage, /You get a lead summary/);
  assert.match(homeDashboard, /Review settings/);
  assert.doesNotMatch(settingsPage, forbiddenOwnerTerms);
  assert.doesNotMatch(callFlowPage, forbiddenOwnerTerms);
  assert.doesNotMatch(homeDashboard, forbiddenOwnerTerms);
  assert.doesNotMatch(leadsPage, forbiddenOwnerTerms);
  assert.doesNotMatch(leadDetailPage, forbiddenOwnerTerms);
  assert.doesNotMatch(conversationsPage, forbiddenOwnerTerms);
  assert.doesNotMatch(billingPage, forbiddenOwnerTerms);
});

test('managed setup handoff replaces the old self-serve onboarding route', () => {
  const onboardingPage = read('app/app/onboarding/page.tsx');
  const auth = read('lib/auth.ts');
  const appLayout = read('app/app/layout.tsx');
  const waitingPage = read('components/customer-setup-waiting-page.tsx');
  const setupHandoff = read('lib/customer-setup-handoff.ts');
  const stripeCheckoutRoute = read('app/api/stripe/checkout/route.ts');
  const buyPage = read('app/buy/page.tsx');

  assert.match(onboardingPage, /redirect\('\/app'\)/);
  assert.match(auth, /ensurePendingBusinessForOwner/);
  assert.match(appLayout, /CustomerSetupWaitingPage/);
  assert.match(waitingPage, /Your missed-call recovery system is being set up/);
  assert.match(waitingPage, /You do not need to configure anything right now/i);
  assert.match(waitingPage, /Try the missed-call simulator/);
  assert.match(setupHandoff, /New CallbackCloser signup needs setup/);
  assert.match(setupHandoff, /Your CallbackCloser account is ready/);
  assert.match(stripeCheckoutRoute, /absoluteUrl\('\/app'\)/);
  assert.match(buyPage, /redirect\('\/app'\)/);
});

test('landing page product promise stays aligned to missed-call recovery workflow', () => {
  const home = read('app/page.tsx');

  assert.match(home, /Turn missed calls into qualified leads automatically/i);
  assert.match(home, /Try the missed-call simulator/i);
  assert.match(home, /Start 14-day pilot/i);
  assert.match(home, /we help set up your missed-call recovery flow and notify you when it is ready/i);
  assert.doesNotMatch(home, /Simple plan choices/i);
  assert.doesNotMatch(home, /Founder-operated customer pilot setup stays separate/i);
  assert.doesNotMatch(home, /Starter/i);
  assert.doesNotMatch(home, /Growth/i);
  assert.doesNotMatch(home, /Agency \/ Multi-location/i);
});

test('message delivery issue helpers flag failed and fallback statuses', () => {
  assert.equal(isMessageDeliveryIssueStatus('failed'), true);
  assert.equal(isMessageDeliveryIssueStatus('undelivered'), true);
  assert.equal(isMessageDeliveryIssueStatus('fallback_webhook_response'), true);
  assert.equal(isMessageDeliveryIssueStatus('delivered'), false);
  assert.equal(formatMessageStatus('undelivered'), 'Undelivered');
  assert.equal(formatMessageStatus('fallback_webhook_response'), 'Sent via webhook fallback');
});
