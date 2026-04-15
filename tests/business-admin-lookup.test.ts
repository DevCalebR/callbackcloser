import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { findBusinessByTwilioNumber, searchBusinessesForAdmin } from '../lib/business.ts';
import { db } from '../lib/db.ts';

test('findBusinessByTwilioNumber matches legacy formatted database values by normalized number', async () => {
  const seed = randomUUID();
  const business = await db.business.create({
    data: {
      ownerClerkId: `lookup-owner-${seed}`,
      name: `Lookup Plumbing ${seed.slice(0, 6)}`,
      forwardingNumber: '+15125550100',
      missedCallSeconds: 20,
      timezone: 'America/New_York',
      serviceLabel1: 'Repair',
      serviceLabel2: 'Install',
      serviceLabel3: 'Maintenance',
      twilioPhoneNumber: '(877) 748-0449',
      twilioPrimaryPhoneNumber: '(877) 748-0449',
      twilioPhoneNumberSid: `PN${seed.replace(/-/g, '').slice(0, 32)}`,
      twilioPrimaryNumberSid: `PX${seed.replace(/-/g, '').slice(0, 32)}`,
    },
  });

  try {
    const byE164 = await findBusinessByTwilioNumber('+18777480449');
    const byFormatted = await findBusinessByTwilioNumber('(877) 748-0449');

    assert.equal(byE164?.id, business.id);
    assert.equal(byFormatted?.id, business.id);
  } finally {
    await db.business.delete({ where: { id: business.id } });
  }
});

test('searchBusinessesForAdmin finds businesses by owner email, business id, Twilio phone number, and number sid', async () => {
  const seed = randomUUID();
  const business = await db.business.create({
    data: {
      ownerClerkId: `search-owner-${seed}`,
      name: `Search HVAC ${seed.slice(0, 6)}`,
      forwardingNumber: '+15125550200',
      notifyPhone: '+15125550300',
      missedCallSeconds: 20,
      timezone: 'America/New_York',
      serviceLabel1: 'Repair',
      serviceLabel2: 'Install',
      serviceLabel3: 'Maintenance',
      twilioPhoneNumber: '+18777480449',
      twilioPrimaryPhoneNumber: '+18777480449',
      twilioPhoneNumberSid: `PN${seed.replace(/-/g, '').slice(0, 32)}`,
      twilioPrimaryNumberSid: `PY${seed.replace(/-/g, '').slice(0, 32)}`,
      twilioMessagingServiceSid: `MG${seed.replace(/-/g, '').slice(0, 32)}`,
      notificationSettings: {
        create: {
          ownerEmail: `owner-${seed.slice(0, 8)}@example.com`,
          ownerPhone: '+15125550300',
        },
      },
    },
    include: {
      notificationSettings: true,
    },
  });

  try {
    const byEmail = await searchBusinessesForAdmin(business.notificationSettings!.ownerEmail!);
    const byId = await searchBusinessesForAdmin(business.id);
    const byPhone = await searchBusinessesForAdmin('(877) 748-0449');
    const bySid = await searchBusinessesForAdmin(business.twilioPhoneNumberSid!);

    assert.equal(byEmail.some((item) => item.id === business.id), true);
    assert.equal(byId.some((item) => item.id === business.id), true);
    assert.equal(byPhone.some((item) => item.id === business.id), true);
    assert.equal(bySid.some((item) => item.id === business.id), true);
  } finally {
    await db.business.delete({ where: { id: business.id } });
  }
});
