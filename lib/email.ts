type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailSendResult =
  | { ok: true; provider: 'resend' }
  | { ok: false; reason: 'missing_config' | 'request_failed'; error?: string };

export async function sendTransactionalEmail(params: SendEmailParams): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CALLBACKCLOSER_FROM_EMAIL?.trim();

  if (!apiKey || !from) {
    return { ok: false, reason: 'missing_config' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { ok: false, reason: 'request_failed', error: errorText || `Email provider returned ${response.status}` };
  }

  return { ok: true, provider: 'resend' };
}
