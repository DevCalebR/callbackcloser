import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRecordingAccessReason } from '../lib/recording-access.ts';

test('recording access denies unauthenticated requests', () => {
  const reason = resolveRecordingAccessReason({
    requestUserId: null,
    businessOwnerClerkId: 'user_123',
    recordingUrl: 'https://api.twilio.com/recordings/abc',
  });

  assert.equal(reason, 'unauthenticated');
});

test('recording access denies users outside the lead business', () => {
  const reason = resolveRecordingAccessReason({
    requestUserId: 'user_123',
    businessOwnerClerkId: 'user_456',
    recordingUrl: 'https://api.twilio.com/recordings/abc',
  });

  assert.equal(reason, 'wrong_business');
});

test('recording access denies when no recording URL is present', () => {
  const reason = resolveRecordingAccessReason({
    requestUserId: 'user_123',
    businessOwnerClerkId: 'user_123',
    recordingUrl: null,
  });

  assert.equal(reason, 'recording_unavailable');
});

test('recording access allows authenticated owner with recording URL', () => {
  const reason = resolveRecordingAccessReason({
    requestUserId: 'user_123',
    businessOwnerClerkId: 'user_123',
    recordingUrl: 'https://api.twilio.com/recordings/abc',
  });

  assert.equal(reason, 'ok');
});
