import process from 'node:process';

import { loadLocalEnvFiles } from './load-env.ts';

const showToken = process.argv.includes('--show-token');

function fail(message: string): never {
  throw new Error(message);
}

function normalizeBaseUrl(rawValue: string) {
  let parsed: URL | null = null;
  try {
    parsed = new URL(rawValue);
  } catch {
    fail('NEXT_PUBLIC_APP_URL must be a valid absolute URL.');
  }

  if (!parsed || !/^https?:$/i.test(parsed.protocol)) {
    fail('NEXT_PUBLIC_APP_URL must use http:// or https://.');
  }

  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().replace(/\/$/, '');
}

function buildWebhookUrl(baseUrl: string, path: string, webhookToken: string) {
  const url = new URL(path, `${baseUrl}/`);
  url.searchParams.set('webhook_token', webhookToken);
  return url.toString();
}

function redactWebhookToken(url: string) {
  const parsed = new URL(url);
  if (parsed.searchParams.has('webhook_token')) {
    parsed.searchParams.set('webhook_token', 'REDACTED');
  }
  return parsed.toString();
}

function main() {
  const loadedFiles = loadLocalEnvFiles();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const webhookToken = process.env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim();

  if (!appUrl) fail('NEXT_PUBLIC_APP_URL is missing.');
  if (!webhookToken) fail('TWILIO_WEBHOOK_AUTH_TOKEN is missing.');

  const baseUrl = normalizeBaseUrl(appUrl);
  const urls = {
    voice: buildWebhookUrl(baseUrl, '/api/twilio/voice', webhookToken),
    sms: buildWebhookUrl(baseUrl, '/api/twilio/sms', webhookToken),
    status: buildWebhookUrl(baseUrl, '/api/twilio/status', webhookToken),
  };

  console.log('CallbackCloser Twilio webhook URLs');
  console.log(`- Loaded env files: ${loadedFiles.join(', ') || '(none)'}`);
  console.log(`- Base URL: ${baseUrl}`);
  console.log(`- Token mode: ${showToken ? 'visible (--show-token)' : 'redacted (default)'}`);
  console.log('');
  console.log(`Voice (A CALL COMES IN, POST): ${showToken ? urls.voice : redactWebhookToken(urls.voice)}`);
  console.log(`Messaging (A MESSAGE COMES IN, POST): ${showToken ? urls.sms : redactWebhookToken(urls.sms)}`);
  console.log(`Status callback (Twilio Number statusCallback + <Dial action>, POST): ${showToken ? urls.status : redactWebhookToken(urls.status)}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
