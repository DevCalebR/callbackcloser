import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TWILIO_RECORDING_HOST_ALLOWLIST,
  getTwilioRecordingMediaUrl,
  isAllowedTwilioRecordingUrl,
  resolveRecordingAccessReason,
} from '../lib/recording-access.ts';

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

test('recording access denies when business owner id is missing', () => {
  const reason = resolveRecordingAccessReason({
    requestUserId: 'user_123',
    businessOwnerClerkId: null,
    recordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123',
  });

  assert.equal(reason, 'wrong_business');
});

test('recording URL validation requires https and Twilio recording host/path allowlist', () => {
  for (const hostname of TWILIO_RECORDING_HOST_ALLOWLIST) {
    assert.equal(
      isAllowedTwilioRecordingUrl(new URL(`https://${hostname}/2010-04-01/Accounts/AC123/Recordings/RE123`)),
      true
    );
  }

  assert.equal(
    isAllowedTwilioRecordingUrl(new URL('http://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123')),
    false
  );

  assert.equal(
    isAllowedTwilioRecordingUrl(new URL('https://example.com/2010-04-01/Accounts/AC123/Recordings/RE123')),
    false
  );

  assert.equal(isAllowedTwilioRecordingUrl(new URL('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM123')), false);
});

test('recording URL normalization returns Twilio media URL and rejects invalid input', () => {
  assert.equal(
    getTwilioRecordingMediaUrl('https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123')?.toString(),
    'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123.mp3'
  );
  assert.equal(
    getTwilioRecordingMediaUrl('https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123.json')?.toString(),
    'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123.mp3'
  );
  assert.equal(
    getTwilioRecordingMediaUrl('https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123.wav')?.toString(),
    'https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123.wav'
  );
  assert.equal(getTwilioRecordingMediaUrl('https://example.com/recordings/RE123'), null);
  assert.equal(getTwilioRecordingMediaUrl('not a URL'), null);
});
