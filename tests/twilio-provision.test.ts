import assert from 'node:assert/strict';
import test from 'node:test';

import { buildManagedProvisioningBusinessInput } from '../lib/twilio-provisioning-input.ts';

test('managed provisioning input reuses existing subaccount, messaging service, and primary number state', () => {
  const input = buildManagedProvisioningBusinessInput(
    {
      id: 'biz_123',
      name: 'Acme Plumbing',
      twilioSubaccountSid: 'AC_SUBACCOUNT',
      twilioMessagingServiceSid: 'MG_SERVICE',
      twilioPrimaryNumberSid: null,
      twilioPrimaryPhoneNumber: null,
      twilioPhoneNumberSid: 'PN_FALLBACK',
      twilioPhoneNumber: '+15550001111',
    },
    'Fallback Name'
  );

  assert.deepEqual(input, {
    id: 'biz_123',
    name: 'Acme Plumbing',
    twilioSubaccountSid: 'AC_SUBACCOUNT',
    twilioMessagingServiceSid: 'MG_SERVICE',
    twilioPrimaryNumberSid: 'PN_FALLBACK',
    twilioPrimaryPhoneNumber: '+15550001111',
  });
});

test('managed provisioning input falls back to the provided business name when the stored name is blank', () => {
  const input = buildManagedProvisioningBusinessInput(
    {
      id: 'biz_123',
      name: '',
      twilioSubaccountSid: null,
      twilioMessagingServiceSid: null,
      twilioPrimaryNumberSid: null,
      twilioPrimaryPhoneNumber: null,
      twilioPhoneNumberSid: null,
      twilioPhoneNumber: null,
    },
    'Fallback Name'
  );

  assert.equal(input.name, 'Fallback Name');
});
