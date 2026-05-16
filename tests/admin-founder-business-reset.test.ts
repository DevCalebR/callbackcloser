import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import {
  deleteAllBusinessesForFounderReset,
  FOUNDER_DELETE_ALL_BUSINESSES_CONFIRMATION,
} from '../lib/admin-business-lifecycle.ts';
import { db } from '../lib/db.ts';

function uniqueDigits(seed: string) {
  const digits = seed.replace(/\D/g, '').padEnd(10, '4');
  return digits.slice(-10);
}

function makePhone(seed: string, suffix: string) {
  return `+1${uniqueDigits(`${seed}${suffix}`)}`;
}

function makeSid(prefix: string, seed: string) {
  const normalized = seed.replace(/-/g, '').padEnd(32, '0');
  return `${prefix}${normalized.slice(0, 32)}`;
}

async function seedBusinessGraph(seed: string) {
  const business = await db.business.create({
    data: {
      ownerClerkId: `founder-reset-${seed}`,
      name: `Founder Reset ${seed.slice(0, 6)}`,
      isTestBusiness: false,
      forwardingNumber: makePhone(seed, '100'),
      notifyPhone: makePhone(seed, '200'),
      missedCallSeconds: 20,
      timezone: 'America/New_York',
      serviceLabel1: 'Repair',
      serviceLabel2: 'Install',
      serviceLabel3: 'Maintenance',
      notificationSettings: {
        create: {
          ownerEmail: `owner-${seed.slice(0, 8)}@example.com`,
          ownerPhone: makePhone(seed, '200'),
        },
      },
    },
  });

  const call = await db.call.create({
    data: {
      businessId: business.id,
      twilioCallSid: makeSid('CA', `${seed}call`),
      fromPhone: makePhone(seed, '300'),
      fromPhoneNormalized: makePhone(seed, '300'),
      toPhone: makePhone(seed, '100'),
      toPhoneNormalized: makePhone(seed, '100'),
      status: 'MISSED',
      missed: true,
    },
  });

  const lead = await db.lead.create({
    data: {
      businessId: business.id,
      callId: call.id,
      callerPhone: call.fromPhone,
      callerPhoneNormalized: call.fromPhoneNormalized,
      summary: 'Founder reset lead',
    },
  });

  await db.message.create({
    data: {
      businessId: business.id,
      leadId: lead.id,
      direction: 'OUTBOUND',
      participant: 'LEAD',
      fromPhone: makePhone(seed, '100'),
      toPhone: lead.callerPhoneNormalized,
      body: 'Founder reset outbound message',
    },
  });

  await db.ownerNotification.create({
    data: {
      businessId: business.id,
      leadId: lead.id,
      channel: 'SMS',
      destination: makePhone(seed, '200'),
      body: 'Founder reset owner notification',
    },
  });

  await db.businessOperatorEvent.create({
    data: {
      businessId: business.id,
      type: 'admin.founder_reset_seeded',
      category: 'ADMIN_ACTIONS',
      status: 'INFO',
      summary: 'Founder reset seed',
    },
  });

  await db.simulatorRun.create({
    data: {
      businessId: business.id,
      leadId: lead.id,
      publicId: `sim_${seed.replace(/-/g, '')}`,
      callerPhone: lead.callerPhoneNormalized,
    },
  });

  await db.smsConsent.create({
    data: {
      businessId: business.id,
      phoneNormalized: lead.callerPhoneNormalized,
      phoneRawLastSeen: lead.callerPhone,
      optedOut: false,
    },
  });

  return { business, call, lead };
}

test('deleteAllBusinessesForFounderReset deletes every selected business and all business-owned records', async () => {
  const first = await seedBusinessGraph(randomUUID());
  const second = await seedBusinessGraph(randomUUID());
  const preserved = await seedBusinessGraph(randomUUID());

  try {
    const result = await deleteAllBusinessesForFounderReset({
      confirmation: FOUNDER_DELETE_ALL_BUSINESSES_CONFIRMATION,
      candidateIds: [first.business.id, second.business.id],
    });

    assert.equal(result.deletedCount, 2);
    assert.deepEqual(
      [...result.deletedBusinessNames].sort(),
      [first.business.name, second.business.name].sort()
    );

    for (const seeded of [first, second]) {
      assert.equal(await db.business.findUnique({ where: { id: seeded.business.id } }), null);
      assert.equal(await db.call.findUnique({ where: { id: seeded.call.id } }), null);
      assert.equal(await db.lead.findUnique({ where: { id: seeded.lead.id } }), null);
      assert.equal(await db.message.count({ where: { businessId: seeded.business.id } }), 0);
      assert.equal(await db.ownerNotification.count({ where: { businessId: seeded.business.id } }), 0);
      assert.equal(await db.businessNotificationSettings.count({ where: { businessId: seeded.business.id } }), 0);
      assert.equal(await db.businessOperatorEvent.count({ where: { businessId: seeded.business.id } }), 0);
      assert.equal(await db.simulatorRun.count({ where: { businessId: seeded.business.id } }), 0);
      assert.equal(await db.smsConsent.count({ where: { businessId: seeded.business.id } }), 0);
    }

    assert.notEqual(await db.business.findUnique({ where: { id: preserved.business.id } }), null);
  } finally {
    await db.business.deleteMany({
      where: {
        id: {
          in: [first.business.id, second.business.id, preserved.business.id],
        },
      },
    });
  }
});

test('deleteAllBusinessesForFounderReset requires explicit confirmation and preserves data when confirmation is wrong', async () => {
  const seeded = await seedBusinessGraph(randomUUID());

  try {
    await assert.rejects(
      deleteAllBusinessesForFounderReset({
        confirmation: 'delete please',
        candidateIds: [seeded.business.id],
      }),
      /DELETE ALL BUSINESSES/
    );

    assert.notEqual(await db.business.findUnique({ where: { id: seeded.business.id } }), null);
  } finally {
    await db.business.deleteMany({ where: { id: seeded.business.id } });
  }
});
