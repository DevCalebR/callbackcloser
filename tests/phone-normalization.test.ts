import assert from 'node:assert/strict';
import test from 'node:test';

import { maskPhoneForAudit, normalizePhoneNumber, normalizePhoneNumberToE164, phoneNumbersEqual } from '../lib/phone.ts';

test('normalizePhoneNumberToE164 converts common US inputs into E.164', () => {
  assert.equal(normalizePhoneNumberToE164('(877) 748-0449'), '+18777480449');
  assert.equal(normalizePhoneNumberToE164('+1 877 748 0449'), '+18777480449');
  assert.equal(normalizePhoneNumberToE164('8777480449'), '+18777480449');
});

test('normalizePhoneNumber preserves raw values for non-E.164-compatible input while strict normalization rejects them', () => {
  assert.equal(normalizePhoneNumberToE164('not-a-phone'), '');
  assert.equal(normalizePhoneNumber('not-a-phone'), 'not-a-phone');
});

test('phoneNumbersEqual matches equivalent values and audit masking hides most digits', () => {
  assert.equal(phoneNumbersEqual('(877) 748-0449', '+18777480449'), true);
  assert.equal(maskPhoneForAudit('+18777480449'), '+1***0449');
});
