import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { formatMessageStatus, isMessageDeliveryIssueStatus } from '../lib/lead-presenters.ts';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('settings page no longer exposes shared Twilio number inventory', () => {
  const settingsPage = read('app/app/settings/page.tsx');

  assert.doesNotMatch(settingsPage, /incomingPhoneNumbers\.list/);
  assert.match(settingsPage, /account mode/);
  assert.match(settingsPage, /Existing-number support stays honest/i);
});

test('existing-number selection reports a truthful setup state instead of a fake error', () => {
  const settingsPage = read('app/app/settings/page.tsx');
  const settingsAction = read('app/app/settings/actions.ts');

  assert.match(settingsAction, /redirect\('\/app\/settings\?existingNumberIntent=1'\)/);
  assert.doesNotMatch(settingsAction, /Keeping an existing number is still an admin-assisted launch step/);
  assert.match(settingsPage, /const existingNumberIntent = searchParams\?\.existingNumberIntent === '1';/);
  assert.match(settingsPage, /Porting path saved\./);
  assert.match(settingsPage, /admin-assisted porting workflow/i);
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
  assert.match(auth, /getOrCreateOwnedBusinessForClerkUser/);
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
