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
  assert.match(settingsPage, /does not expose Twilio account inventory in self-serve settings/i);
  assert.match(settingsPage, /Existing Twilio numbers are founder-managed during pilots/i);
});

test('landing page product promise stays aligned to missed-call recovery workflow', () => {
  const home = read('app/page.tsx');

  assert.match(home, /Recover missed calls/i);
  assert.doesNotMatch(home, /Turn missed calls into booked jobs/i);
});

test('message delivery issue helpers flag failed and fallback statuses', () => {
  assert.equal(isMessageDeliveryIssueStatus('failed'), true);
  assert.equal(isMessageDeliveryIssueStatus('fallback_webhook_response'), true);
  assert.equal(isMessageDeliveryIssueStatus('delivered'), false);
  assert.equal(formatMessageStatus('fallback_webhook_response'), 'Sent via webhook fallback');
});
