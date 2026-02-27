export const TWILIO_DIAL_RECORDING_MODE = 'record-from-answer-dual' as const;
const TWILIO_DIAL_RECORDING_EVENTS: Array<'completed'> = ['completed'];

function toInt(value: string | undefined) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildDialRecordingOptions(recordingStatusCallbackUrl: string) {
  return {
    record: TWILIO_DIAL_RECORDING_MODE,
    recordingStatusCallback: recordingStatusCallbackUrl,
    recordingStatusCallbackMethod: 'POST',
    recordingStatusCallbackEvent: TWILIO_DIAL_RECORDING_EVENTS,
  };
}

export type TwilioRecordingMetadata = {
  recordingSid: string | null;
  recordingUrl: string | null;
  recordingStatus: string | null;
  recordingDurationSeconds: number | null;
};

export function extractTwilioRecordingMetadata(payload: Record<string, string>): TwilioRecordingMetadata | null {
  const recordingSid = payload.RecordingSid?.trim() || null;
  const recordingUrl = payload.RecordingUrl?.trim() || null;
  const recordingStatus = payload.RecordingStatus?.trim() || null;
  const recordingDurationSeconds = toInt(payload.RecordingDuration);

  if (!recordingSid && !recordingUrl && !recordingStatus && recordingDurationSeconds === null) {
    return null;
  }

  return {
    recordingSid,
    recordingUrl,
    recordingStatus,
    recordingDurationSeconds,
  };
}
