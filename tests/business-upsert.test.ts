import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { TwilioAccountMode, TwilioNumberSetupMode } from '@prisma/client';

import { upsertBusinessForOwner } from '../lib/business.ts';
import { db } from '../lib/db.ts';

test('upsertBusinessForOwner persists the selected Twilio account mode and number path', async () => {
  const seed = randomUUID();
  const ownerClerkId = `owner-${seed}`;

  try {
    const created = await upsertBusinessForOwner(ownerClerkId, {
      name: `Acme ${seed.slice(0, 6)}`,
      forwardingNumber: '+15125550100',
      notifyPhone: '+15125550101',
      ownerEmail: `owner-${seed.slice(0, 8)}@example.com`,
      twilioAccountMode: TwilioAccountMode.MAIN_ACCOUNT,
      twilioNumberSetupMode: TwilioNumberSetupMode.EXISTING_NUMBER,
      missedCallSeconds: 20,
      serviceLabel1: 'Repair',
      serviceLabel2: 'Install',
      serviceLabel3: 'Maintenance',
      timezone: 'America/New_York',
    });

    assert.equal(created.twilioAccountMode, TwilioAccountMode.MAIN_ACCOUNT);
    assert.equal(created.twilioNumberSetupMode, TwilioNumberSetupMode.EXISTING_NUMBER);

    const updated = await upsertBusinessForOwner(ownerClerkId, {
      name: `Acme ${seed.slice(0, 6)} Updated`,
      forwardingNumber: '+15125550199',
      notifyPhone: '+15125550102',
      ownerEmail: `owner-${seed.slice(0, 8)}@example.com`,
      twilioAccountMode: TwilioAccountMode.BUSINESS_SUBACCOUNT,
      twilioNumberSetupMode: TwilioNumberSetupMode.NEW_NUMBER,
      missedCallSeconds: 25,
      serviceLabel1: 'Repair',
      serviceLabel2: 'Install',
      serviceLabel3: 'Maintenance',
      timezone: 'America/New_York',
    });

    assert.equal(updated.twilioAccountMode, TwilioAccountMode.BUSINESS_SUBACCOUNT);
    assert.equal(updated.twilioNumberSetupMode, TwilioNumberSetupMode.NEW_NUMBER);
    assert.equal(updated.forwardingNumber, '+15125550199');
  } finally {
    await db.business.deleteMany({ where: { ownerClerkId } });
  }
});
