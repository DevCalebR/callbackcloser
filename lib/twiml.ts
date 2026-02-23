import twilio from 'twilio';

export function voiceTwiML(builder: (response: twilio.twiml.VoiceResponse) => void) {
  const response = new twilio.twiml.VoiceResponse();
  builder(response);
  return response.toString();
}

export function messagingTwiML(builder?: (response: twilio.twiml.MessagingResponse) => void) {
  const response = new twilio.twiml.MessagingResponse();
  if (builder) builder(response);
  return response.toString();
}
