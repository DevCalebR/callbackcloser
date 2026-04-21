import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import {
  bulkDeleteTestDemoBusinesses,
  BULK_TEST_DATA_RESET_CONFIRMATION,
  DEMO_OWNER_CLERK_ID,
  isTestDemoBusiness,
} from '../lib/admin-test-data-reset.ts';
import { db } from '../lib/db.ts';

function uniqueDigits(seed: string) {
  const digits = seed.replace(/\D/g, '').padEnd(10, '7');
  return digits.slice(-10);
}

function makePhone(seed: string, suffix: string) {
  return `+1${uniqueDigits(`${seed}${suffix}`)}`;
}

function makeSid(prefix: string, seed: string) {
  const normalized = seed.replace(/-/g, '').padEnd(32, '0');
  return `${prefix}${normalized.slice(0, 32)}`;
}

async function seedResetCandidateBusiness(params: { seed: string; testBusiness: boolean }) {
  const now = new Date('2026-04-20T12:00:00.000Z');
  const ownerClerkId = `owner_${params.seed}`;
  const business = await db.business.create({
    data: {
      ownerClerkId,
      name: `Reset Candidate ${params.seed.slice(0, 6)}`,
      isTestBusiness: params.testBusiness,
      forwardingNumber: makePhone(params.seed, '100'),
      notifyPhone: makePhone(params.seed, '200'),
      missedCallSeconds: 20,
      timezone: 'America/New_York',
      serviceLabel1: 'Repair',
      serviceLabel2: 'Install',
      serviceLabel3: 'Maintenance',
      twilioPhoneNumber: makePhone(params.seed, '300'),
      twilioPrimaryPhoneNumber: makePhone(params.seed, '300'),
      twilioPhoneNumberSid: makeSid('PN', `${params.seed}phone`),
      twilioPrimaryNumberSid: makeSid('PX', `${params.seed}primary`),
      twilioMessagingServiceSid: makeSid('MG', `${params.seed}service`),
      twilioSubaccountSid: makeSid('AC', `${params.seed}subaccount`),
      ownerInviteSentAt: now,
      notificationSettings: {
        create: {
          ownerEmail: `owner-${params.seed.slice(0, 8)}@example.com`,
          ownerPhone: makePhone(params.seed, '200'),
        },
      },
    },
  });

  const call = await db.call.create({
    data: {
      businessId: business.id,
      twilioCallSid: makeSid('CA', `${params.seed}call`),
      fromPhone: makePhone(params.seed, '400'),
      fromPhoneNormalized: makePhone(params.seed, '400'),
      toPhone: business.twilioPrimaryPhoneNumber!,
      toPhoneNormalized: business.twilioPrimaryPhoneNumber!,
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
      summary: 'Reset candidate lead',
    },
  });

  await db.message.create({
    data: {
      businessId: business.id,
      leadId: lead.id,
      direction: 'OUTBOUND',
      participant: 'LEAD',
      fromPhone: business.twilioPrimaryPhoneNumber!,
      toPhone: lead.callerPhoneNormalized,
      body: 'Reset candidate outbound message',
    },
  });

  await db.ownerNotification.create({
    data: {
      businessId: business.id,
      leadId: lead.id,
      channel: 'SMS',
      destination: makePhone(params.seed, '200'),
      body: 'Reset candidate owner notification',
    },
  });

  await db.businessOperatorEvent.create({
    data: {
      businessId: business.id,
      type: 'admin.reset_candidate_created',
      category: 'ADMIN_ACTIONS',
      status: 'INFO',
      summary: 'Reset candidate created',
    },
  });

  await db.simulatorRun.create({
    data: {
      businessId: business.id,
      leadId: lead.id,
      publicId: `sim_${params.seed.replace(/-/g, '')}`,
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

test('bulkDeleteTestDemoBusinesses deletes only test/demo businesses and cascades business-owned data', async () => {
  const seed = randomUUID();
  const preservedSeed = randomUUID();
  const deletable = await seedResetCandidateBusiness({ seed, testBusiness: true });
  const preserved = await seedResetCandidateBusiness({ seed: preservedSeed, testBusiness: false });

  try {
    const result = await bulkDeleteTestDemoBusinesses({
      confirmation: BULK_TEST_DATA_RESET_CONFIRMATION,
      candidateIds: [deletable.business.id, preserved.business.id],
    });

    assert.equal(result.deletedCount >= 1, true);
    assert.equal(result.deletedBusinessNames.includes(deletable.business.name), true);

    assert.equal(await db.business.findUnique({ where: { id: deletable.business.id } }), null);
    assert.equal(await db.call.findUnique({ where: { id: deletable.call.id } }), null);
    assert.equal(await db.lead.findUnique({ where: { id: deletable.lead.id } }), null);
    assert.equal(await db.message.count({ where: { businessId: deletable.business.id } }), 0);
    assert.equal(await db.ownerNotification.count({ where: { businessId: deletable.business.id } }), 0);
    assert.equal(await db.businessOperatorEvent.count({ where: { businessId: deletable.business.id } }), 0);
    assert.equal(await db.businessNotificationSettings.count({ where: { businessId: deletable.business.id } }), 0);
    assert.equal(await db.simulatorRun.count({ where: { businessId: deletable.business.id } }), 0);
    assert.equal(await db.smsConsent.count({ where: { businessId: deletable.business.id } }), 0);

    assert.notEqual(await db.business.findUnique({ where: { id: preserved.business.id } }), null);
    assert.equal(await db.message.count({ where: { businessId: preserved.business.id } }) > 0, true);
  } finally {
    await db.business.deleteMany({ where: { id: { in: [deletable.business.id, preserved.business.id] } } });
  }
});

test('isTestDemoBusiness includes the dedicated demo workspace even without the test flag', () => {
  assert.equal(
    isTestDemoBusiness({
      isTestBusiness: false,
      ownerClerkId: DEMO_OWNER_CLERK_ID,
    }),
    true
  );
});

test('bulkDeleteTestDemoBusinesses requires explicit confirmation and preserves data when confirmation is wrong', async () => {
  const seed = randomUUID();
  const businessRecord = await seedResetCandidateBusiness({ seed, testBusiness: true });

  try {
    await assert.rejects(
      bulkDeleteTestDemoBusinesses({
        confirmation: 'delete please',
        candidateIds: [businessRecord.business.id],
      }),
      /DELETE TEST BUSINESSES/
    );

    assert.notEqual(await db.business.findUnique({ where: { id: businessRecord.business.id } }), null);
  } finally {
    await db.business.deleteMany({ where: { id: businessRecord.business.id } });
  }
});
