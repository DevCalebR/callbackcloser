import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('legal public pages exist with required headings', () => {
  const terms = read('app/terms/page.tsx');
  const privacy = read('app/privacy/page.tsx');
  const refund = read('app/refund/page.tsx');
  const pricing = read('app/pricing/page.tsx');
  const contact = read('app/contact/page.tsx');
  const smsConsent = read('app/sms-consent/page.tsx');

  assert.match(terms, /Terms &amp; Conditions|Terms & Conditions/);
  assert.match(privacy, /Privacy Policy/);
  assert.match(refund, /Refund Policy/);
  assert.match(pricing, /Pricing/);
  assert.match(contact, /Contact CallbackCloser/);
  assert.match(smsConsent, /SMS Consent/);
});

test('sms consent page includes required disclosures and trust links', () => {
  const smsConsent = read('app/sms-consent/page.tsx');
  const smsConsentForm = read('components/public-sms-consent-form.tsx');
  const privacy = read('app/privacy/page.tsx');
  const terms = read('app/terms/page.tsx');
  const contact = read('app/contact/page.tsx');

  assert.match(smsConsent, /missed call follow-up/i);
  assert.match(smsConsent, /customer care/i);
  assert.match(smsConsent, /service updates/i);
  assert.match(smsConsent, /account notifications/i);
  assert.match(smsConsent, /Message and data rates may apply/i);
  assert.match(smsConsent, /Reply STOP/i);
  assert.match(smsConsent, /HELP/i);
  assert.match(smsConsent, /href="\/privacy"/);
  assert.match(smsConsent, /href="\/terms"/);
  assert.match(smsConsent, /href="\/contact"/);
  assert.match(smsConsentForm, /By checking this box, you agree to receive SMS messages from CallbackCloser related to customer care and account notifications\./);
  assert.match(smsConsentForm, /Continue/);
  assert.match(smsConsentForm, /disabled={!canSubmit}/);
  assert.match(privacy, /does not sell mobile numbers/i);
  assert.match(terms, /SMS Consent/);
  assert.match(contact, /support@callbackcloser\.com/);
});

test('public-facing surfaces link to trust and contact routes', () => {
  const home = read('app/page.tsx');
  const billing = read('app/app/billing/page.tsx');
  const footer = read('components/public-site-footer.tsx');
  const nav = read('components/public-site-nav.tsx');

  assert.match(home, /href="\/pricing"/);
  assert.match(home, /href="\/contact"/);
  assert.match(home, /href="\/sms-consent"/);
  assert.match(nav, /href: '\/pricing'/);
  assert.match(nav, /href: '\/contact'/);
  assert.match(nav, /href: '\/sms-consent'/);
  assert.match(footer, /href: '\/privacy'/);
  assert.match(footer, /href: '\/terms'/);
  assert.match(footer, /href: '\/refund'/);
  assert.match(footer, /href: '\/contact'/);
  assert.match(footer, /href: '\/sms-consent'/);

  assert.match(billing, /href="\/pricing"/);
  assert.match(billing, /href="\/refund"/);
  assert.match(billing, /href="\/contact"/);
});
