import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDialRecordingOptions, extractTwilioRecordingMetadata, TWILIO_DIAL_RECORDING_MODE } from '../lib/twilio-recording.ts';
import { voiceTwiML } from '../lib/twiml.ts';

test('voice TwiML includes recording attributes on <Dial>', () => {
  const callbackUrl = 'https://example.com/api/twilio/status?webhook_token=secret';
  const xml = voiceTwiML((response) => {
    const dial = response.dial({
      action: callbackUrl,
      method: 'POST',
      ...buildDialRecordingOptions(callbackUrl),
    });
    dial.number('+15551230000');
  });

  assert.match(xml, new RegExp(`record="${TWILIO_DIAL_RECORDING_MODE}"`));
  assert.match(xml, /recordingStatusCallback="https:\/\/example\.com\/api\/twilio\/status\?webhook_token=secret"/);
  assert.match(xml, /recordingStatusCallbackMethod="POST"/);
});

test('extractTwilioRecordingMetadata parses recording callback fields', () => {
  const recording = extractTwilioRecordingMetadata({
    RecordingSid: 'RE123',
    RecordingUrl: 'https://api.twilio.com/recordings/RE123',
    RecordingStatus: 'completed',
    RecordingDuration: '42',
  });

  assert.deepEqual(recording, {
    recordingSid: 'RE123',
    recordingUrl: 'https://api.twilio.com/recordings/RE123',
    recordingStatus: 'completed',
    recordingDurationSeconds: 42,
  });
});

test('extractTwilioRecordingMetadata returns null when payload has no recording fields', () => {
  assert.equal(extractTwilioRecordingMetadata({ CallSid: 'CA123' }), null);
});
