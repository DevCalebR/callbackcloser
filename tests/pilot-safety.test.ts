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

test('onboarding page persists Twilio account mode before the shared setup flow continues', () => {
  const onboardingPage = read('app/app/onboarding/page.tsx');
  const onboardingAction = read('app/app/onboarding/actions.ts');
  const twilioSetup = read('lib/twilio-setup.ts');

  assert.match(onboardingPage, /Twilio account mode/i);
  assert.match(onboardingPage, /TwilioSetupChecklist/);
  assert.match(onboardingPage, /twilioAccountModeOptions/);
  assert.match(onboardingPage, /twilioNumberSetupModeOptions/);
  assert.match(twilioSetup, /Business subaccount \(recommended\)/i);
  assert.match(twilioSetup, /Main account/i);
  assert.doesNotMatch(onboardingAction, /provisionPhoneNumber/);
});

test('landing page product promise stays aligned to missed-call recovery workflow', () => {
  const home = read('app/page.tsx');

  assert.match(home, /Stop losing jobs from missed calls/i);
  assert.match(home, /ready-to-close lead/i);
});

test('message delivery issue helpers flag failed and fallback statuses', () => {
  assert.equal(isMessageDeliveryIssueStatus('failed'), true);
  assert.equal(isMessageDeliveryIssueStatus('undelivered'), true);
  assert.equal(isMessageDeliveryIssueStatus('fallback_webhook_response'), true);
  assert.equal(isMessageDeliveryIssueStatus('delivered'), false);
  assert.equal(formatMessageStatus('undelivered'), 'Undelivered');
  assert.equal(formatMessageStatus('fallback_webhook_response'), 'Sent via webhook fallback');
});
