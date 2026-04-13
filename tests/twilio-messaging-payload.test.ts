import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOutboundTwilioMessagePayload, getRequiredTwilioMessagingServiceSid } from '../lib/twilio-messaging.ts';

test('buildOutboundTwilioMessagePayload uses messagingServiceSid instead of from', () => {
  const payload = buildOutboundTwilioMessagePayload(
    {
      to: '+15551234567',
      body: 'CallbackCloser: We missed your call.',
    },
    {
      TWILIO_MESSAGING_SERVICE_SID: 'MG11111111111111111111111111111111',
    }
  );

  assert.deepEqual(payload, {
    messagingServiceSid: 'MG11111111111111111111111111111111',
    to: '+15551234567',
    body: 'CallbackCloser: We missed your call.',
  });
  assert.equal('from' in payload, false);
});

test('getRequiredTwilioMessagingServiceSid throws a clear error when missing', () => {
  assert.throws(
    () => getRequiredTwilioMessagingServiceSid({}),
    /Missing TWILIO_MESSAGING_SERVICE_SID\. Outbound SMS requires a Twilio Messaging Service SID configured in the environment\./
  );
});
