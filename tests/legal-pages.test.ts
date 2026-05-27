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

  assert.match(smsConsent, /respond to customer inquiries/i);
  assert.match(smsConsent, /callback coordination/i);
  assert.match(smsConsent, /customer support/i);
  assert.match(smsConsent, /service updates/i);
  assert.match(smsConsent, /account or service notifications/i);
  assert.match(smsConsent, /Consent to receive SMS messages is not a condition of purchase/i);
  assert.match(smsConsent, /Message and data rates may apply/i);
  assert.match(smsConsent, /Reply STOP/i);
  assert.match(smsConsent, /HELP/i);
  assert.match(smsConsent, /support@callbackcloser\.com/i);
  assert.match(smsConsent, /href="\/privacy"/);
  assert.match(smsConsent, /href="\/terms"/);
  assert.match(
    smsConsentForm,
    /I agree to receive SMS messages from CallbackCloser related to my request\./
  );
  assert.match(smsConsentForm, /htmlFor="sms-consent-phone"/);
  assert.match(smsConsentForm, /name="phone"/);
  assert.match(smsConsentForm, /type="tel"/);
  assert.match(smsConsentForm, /checked=\{consentChecked\}/);
  assert.match(smsConsentForm, /buildSmsConsentMailtoHref/);
  assert.match(smsConsentForm, /Email support to confirm consent/);
  assert.doesNotMatch(smsConsentForm, /type="button"/);
  assert.match(smsConsentForm, /Consent to receive SMS messages is not a condition of purchase/i);
  assert.doesNotMatch(smsConsent, /visual-only|Twilio review only|pilot reference|demo|public compliance reference|consent is recorded elsewhere/i);
  assert.doesNotMatch(
    smsConsentForm,
    /consent language reference|does not submit or store phone numbers|compliance reference|buyers, carriers, and reviewers|use a real phone field|in production, your real consent flow should/i
  );
  assert.match(privacy, /does not sell mobile numbers/i);
  assert.match(privacy, /callback coordination/i);
  assert.match(terms, /SMS Consent/);
  assert.match(terms, /callback coordination/i);
  assert.match(contact, /support@callbackcloser\.com/);
});

test('public-facing surfaces link to trust and contact routes', () => {
  const home = read('app/page.tsx');
  const billing = read('app/app/billing/page.tsx');
  const footer = read('components/public-site-footer.tsx');
  const nav = read('components/public-site-nav.tsx');

  assert.match(home, /href: '\/pricing'|href="\/pricing"/);
  assert.match(home, /href: '\/sms-consent'|href="\/sms-consent"/);
  assert.match(home, /PUBLIC_CREATE_ACCOUNT_PATH/);
  assert.match(home, /PUBLIC_START_FREE_PILOT_PATH/);
  assert.match(nav, /href: '\/demo'/);
  assert.match(nav, /href: '\/pricing'/);
  assert.match(nav, /href: '\/contact'/);
  assert.match(nav, /href: '\/sms-consent'/);
  assert.match(nav, /href: '\/privacy'/);
  assert.match(nav, /href: '\/terms'/);
  assert.match(nav, /PUBLIC_SIGN_IN_PATH/);
  assert.match(nav, /PUBLIC_CREATE_ACCOUNT_PATH/);
  assert.match(nav, /PUBLIC_START_FREE_PILOT_PATH/);
  assert.match(footer, /href: '\/privacy'/);
  assert.match(footer, /href: '\/terms'/);
  assert.match(footer, /href: '\/refund'/);
  assert.match(footer, /href: '\/contact'/);
  assert.match(footer, /href: '\/sms-consent'/);
  assert.match(footer, /PUBLIC_CREATE_ACCOUNT_PATH/);
  assert.match(footer, /PUBLIC_START_FREE_PILOT_PATH/);
  assert.match(footer, /PUBLIC_SIGN_IN_PATH/);

  assert.match(billing, /href="\/pricing"/);
  assert.match(billing, /href="\/refund"/);
  assert.match(billing, /href="\/contact"/);
});
