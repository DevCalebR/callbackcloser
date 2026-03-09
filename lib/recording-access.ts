export type RecordingAccessReason =
  | 'ok'
  | 'unauthenticated'
  | 'wrong_business'
  | 'recording_unavailable';

export function resolveRecordingAccessReason(input: {
  requestUserId: string | null | undefined;
  businessOwnerClerkId: string | null | undefined;
  recordingUrl: string | null | undefined;
}): RecordingAccessReason {
  if (!input.requestUserId) return 'unauthenticated';
  if (!input.businessOwnerClerkId || input.businessOwnerClerkId !== input.requestUserId) {
    return 'wrong_business';
  }
  if (!input.recordingUrl) return 'recording_unavailable';
  return 'ok';
}
