import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { findBusinessByTwilioNumber, searchBusinessesForAdmin } from '../lib/business.ts';
import { db } from '../lib/db.ts';

function uniqueDigits(seed: string) {
  const digits = seed.replace(/\D/g, '').padEnd(10, '7');
  return digits.slice(-10);
}

function makeTwilioPhone(seed: string) {
  const digits = uniqueDigits(seed);
  return {
    e164: `+1${digits}`,
    formatted: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
  };
}

function makeSid(prefix: string, seed: string) {
  const normalized = seed.replace(/-/g, '').padEnd(32, '0');
  return `${prefix}${normalized.slice(0, 32)}`;
}

test('findBusinessByTwilioNumber matches legacy formatted database values by normalized number', async () => {
  const seed = randomUUID();
  const twilioPhone = makeTwilioPhone(seed);
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
      twilioPhoneNumber: twilioPhone.formatted,
      twilioPrimaryPhoneNumber: twilioPhone.formatted,
      twilioPhoneNumberSid: makeSid('PN', `${seed}phone`),
      twilioPrimaryNumberSid: makeSid('PX', `${seed}primary`),
    },
  });

  try {
    const byE164 = await findBusinessByTwilioNumber(twilioPhone.e164);
    const byFormatted = await findBusinessByTwilioNumber(twilioPhone.formatted);

    assert.equal(byE164?.id, business.id);
    assert.equal(byFormatted?.id, business.id);
  } finally {
    await db.business.delete({ where: { id: business.id } });
  }
});

test('searchBusinessesForAdmin finds businesses by owner email, business id, Twilio phone number, and number sid', async () => {
  const seed = randomUUID();
  const twilioPhone = makeTwilioPhone(seed);
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
      twilioPhoneNumber: twilioPhone.e164,
      twilioPrimaryPhoneNumber: twilioPhone.e164,
      twilioPhoneNumberSid: makeSid('PN', `${seed}phone`),
      twilioPrimaryNumberSid: makeSid('PY', `${seed}primary`),
      twilioMessagingServiceSid: makeSid('MG', `${seed}service`),
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
    const byPhone = await searchBusinessesForAdmin(twilioPhone.formatted);
    const bySid = await searchBusinessesForAdmin(business.twilioPhoneNumberSid!);

    assert.equal(byEmail.some((item) => item.id === business.id), true);
    assert.equal(byId.some((item) => item.id === business.id), true);
    assert.equal(byPhone.some((item) => item.id === business.id), true);
    assert.equal(bySid.some((item) => item.id === business.id), true);
  } finally {
    await db.business.delete({ where: { id: business.id } });
  }
});
