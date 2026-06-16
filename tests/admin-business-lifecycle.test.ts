import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import {
  deleteBusinessPermanently,
  deleteDeletableTestBusiness,
} from '../lib/admin-business-lifecycle.ts';
import {
  PERMANENT_DELETE_EXTERNAL_REVIEW_NOTE,
  REAL_CUSTOMER_DELETE_CONFIRMATION,
} from '../lib/admin-business-delete.ts';
import { db } from '../lib/db.ts';

function makeSeed(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

async function createBusinessGraph(params: {
  seed: string;
  isTestBusiness: boolean;
  archived?: boolean;
  ownerClerkId?: string;
}) {
  const ownerClerkId = params.ownerClerkId || `owner-${params.seed}`;
  const businessName = `${params.isTestBusiness ? 'Demo Cleanup' : 'Real Tenant'} ${params.seed}`;
  const business = await db.business.create({
    data: {
      ownerClerkId,
      name: businessName,
      isTestBusiness: params.isTestBusiness,
      archivedAt: params.archived ? new Date('2026-04-18T12:00:00.000Z') : null,
      forwardingNumber: '+15125550100',
      notifyPhone: '+15125550101',
      missedCallSeconds: 20,
      timezone: 'America/New_York',
      serviceLabel1: 'Repair',
      serviceLabel2: 'Install',
      serviceLabel3: 'Maintenance',
      notificationSettings: {
        create: {
          ownerEmail: `${params.seed}@example.com`,
          ownerPhone: '+15125550101',
        },
      },
    },
  });

  const call = await db.call.create({
    data: {
      businessId: business.id,
      twilioCallSid: `CA${params.seed.replace(/-/g, '').padEnd(32, '0').slice(0, 32)}`,
      fromPhone: '+15125550102',
      fromPhoneNormalized: '+15125550102',
      toPhone: '+15125550100',
      toPhoneNormalized: '+15125550100',
      status: 'completed',
      answered: false,
      missed: true,
    },
  });

  const lead = await db.lead.create({
    data: {
      businessId: business.id,
      callId: call.id,
      callerPhone: '+15125550102',
      callerPhoneNormalized: '+15125550102',
      summary: 'Demo cleanup lead',
    },
  });

  await db.message.create({
    data: {
      businessId: business.id,
      leadId: lead.id,
      direction: 'OUTBOUND',
      participant: 'OWNER',
      fromPhone: '+15125550100',
      toPhone: '+15125550102',
      body: 'Test cleanup message',
    },
  });

  await db.ownerNotification.create({
    data: {
      businessId: business.id,
      leadId: lead.id,
      channel: 'SMS',
      status: 'FAILED',
      body: 'Owner alert failed',
      error: 'simulated failure',
    },
  });

  await db.businessOperatorEvent.create({
    data: {
      businessId: business.id,
      type: 'admin.cleanup_test',
      category: 'ADMIN_ACTIONS',
      status: 'WARNING',
      summary: 'Cleanup test event',
    },
  });

  await db.smsConsent.create({
    data: {
      businessId: business.id,
      phoneNormalized: '+15125550102',
      phoneRawLastSeen: '+1 (512) 555-0102',
    },
  });

  await db.simulatorRun.create({
    data: {
      publicId: `sim-${params.seed}`,
      businessId: business.id,
      leadId: lead.id,
      callerPhone: '+15125550102',
    },
  });

  return { business, call, lead };
}

test('deleteDeletableTestBusiness hard deletes an archived demo/test business and its dependent records', async () => {
  const seed = makeSeed('delete-demo');
  const { business, call, lead } = await createBusinessGraph({ seed, isTestBusiness: true, archived: true });
  const preservedSeed = makeSeed('preserve-demo');
  const preserved = await createBusinessGraph({ seed: preservedSeed, isTestBusiness: true, archived: true });

  try {
    await deleteDeletableTestBusiness(business.id);

    const [
      deletedBusiness,
      deletedCall,
      deletedLead,
      deletedMessageCount,
      deletedNotificationCount,
      deletedSettings,
      deletedOperatorEventCount,
      deletedSimulatorRunCount,
      deletedConsentCount,
      stillPresentBusiness,
    ] = await Promise.all([
      db.business.findUnique({ where: { id: business.id } }),
      db.call.findUnique({ where: { id: call.id } }),
      db.lead.findUnique({ where: { id: lead.id } }),
      db.message.count({ where: { businessId: business.id } }),
      db.ownerNotification.count({ where: { businessId: business.id } }),
      db.businessNotificationSettings.findUnique({ where: { businessId: business.id } }),
      db.businessOperatorEvent.count({ where: { businessId: business.id } }),
      db.simulatorRun.count({ where: { businessId: business.id } }),
      db.smsConsent.count({ where: { businessId: business.id } }),
      db.business.findUnique({ where: { id: preserved.business.id } }),
    ]);

    assert.equal(deletedBusiness, null);
    assert.equal(deletedCall, null);
    assert.equal(deletedLead, null);
    assert.equal(deletedMessageCount, 0);
    assert.equal(deletedNotificationCount, 0);
    assert.equal(deletedSettings, null);
    assert.equal(deletedOperatorEventCount, 0);
    assert.equal(deletedSimulatorRunCount, 0);
    assert.equal(deletedConsentCount, 0);
    assert.equal(stillPresentBusiness?.id, preserved.business.id);
  } finally {
    await db.business.deleteMany({
      where: {
        ownerClerkId: {
          in: [`owner-${seed}`, `owner-${preservedSeed}`],
        },
      },
    });
  }
});

test('deleteDeletableTestBusiness rejects real businesses and leaves them archive-only', async () => {
  const seed = makeSeed('keep-real');
  const { business } = await createBusinessGraph({ seed, isTestBusiness: false });

  try {
    await assert.rejects(
      deleteDeletableTestBusiness(business.id),
      /Only demo\/test businesses can be deleted|Archive this business instead/i
    );

    const stillExists = await db.business.findUnique({ where: { id: business.id } });
    assert.equal(stillExists?.id, business.id);
  } finally {
    await db.business.deleteMany({ where: { id: business.id } });
  }
});

test('deleteBusinessPermanently deletes a test/demo business with the exact name confirmation', async () => {
  const seed = makeSeed('permanent-demo');
  const { business, call, lead } = await createBusinessGraph({ seed, isTestBusiness: true });

  try {
    const result = await deleteBusinessPermanently({
      businessId: business.id,
      confirmationName: business.name,
    });

    assert.equal(result.business.id, business.id);
    assert.equal(result.requiredRealCustomerConfirmation, false);
    assert.equal(result.externalReviewNote, PERMANENT_DELETE_EXTERNAL_REVIEW_NOTE);
    assert.equal(await db.business.findUnique({ where: { id: business.id } }), null);
    assert.equal(await db.call.findUnique({ where: { id: call.id } }), null);
    assert.equal(await db.lead.findUnique({ where: { id: lead.id } }), null);
    assert.equal(await db.message.count({ where: { businessId: business.id } }), 0);
    assert.equal(await db.ownerNotification.count({ where: { businessId: business.id } }), 0);
    assert.equal(await db.businessNotificationSettings.count({ where: { businessId: business.id } }), 0);
    assert.equal(await db.businessOperatorEvent.count({ where: { businessId: business.id } }), 0);
    assert.equal(await db.simulatorRun.count({ where: { businessId: business.id } }), 0);
    assert.equal(await db.smsConsent.count({ where: { businessId: business.id } }), 0);
  } finally {
    await db.business.deleteMany({ where: { id: business.id } });
  }
});

test('deleteBusinessPermanently rejects a test/demo business when the name confirmation is wrong', async () => {
  const seed = makeSeed('wrong-demo');
  const { business } = await createBusinessGraph({ seed, isTestBusiness: true });

  try {
    await assert.rejects(
      deleteBusinessPermanently({
        businessId: business.id,
        confirmationName: 'Wrong business name',
      }),
      /Type the exact business name to delete it\./
    );

    assert.notEqual(await db.business.findUnique({ where: { id: business.id } }), null);
  } finally {
    await db.business.deleteMany({ where: { id: business.id } });
  }
});

test('deleteBusinessPermanently rejects a real customer when the founder phrase is missing or wrong', async () => {
  const seed = makeSeed('real-customer');
  const { business } = await createBusinessGraph({ seed, isTestBusiness: false });

  try {
    await assert.rejects(
      deleteBusinessPermanently({
        businessId: business.id,
        confirmationName: business.name,
      }),
      /DELETE REAL CUSTOMER/
    );

    await assert.rejects(
      deleteBusinessPermanently({
        businessId: business.id,
        confirmationName: business.name,
        realCustomerConfirmation: 'delete real customer',
      }),
      /DELETE REAL CUSTOMER/
    );

    assert.notEqual(await db.business.findUnique({ where: { id: business.id } }), null);
  } finally {
    await db.business.deleteMany({ where: { id: business.id } });
  }
});

test('deleteBusinessPermanently deletes a real customer only with exact name plus DELETE REAL CUSTOMER', async () => {
  const seed = makeSeed('real-delete');
  const { business, call, lead } = await createBusinessGraph({ seed, isTestBusiness: false });

  try {
    const result = await deleteBusinessPermanently({
      businessId: business.id,
      confirmationName: business.name,
      realCustomerConfirmation: REAL_CUSTOMER_DELETE_CONFIRMATION,
    });

    assert.equal(result.business.id, business.id);
    assert.equal(result.requiredRealCustomerConfirmation, true);
    assert.equal(await db.business.findUnique({ where: { id: business.id } }), null);
    assert.equal(await db.call.findUnique({ where: { id: call.id } }), null);
    assert.equal(await db.lead.findUnique({ where: { id: lead.id } }), null);
    assert.equal(await db.message.count({ where: { businessId: business.id } }), 0);
    assert.equal(await db.ownerNotification.count({ where: { businessId: business.id } }), 0);
    assert.equal(await db.businessNotificationSettings.count({ where: { businessId: business.id } }), 0);
    assert.equal(await db.businessOperatorEvent.count({ where: { businessId: business.id } }), 0);
    assert.equal(await db.simulatorRun.count({ where: { businessId: business.id } }), 0);
    assert.equal(await db.smsConsent.count({ where: { businessId: business.id } }), 0);
  } finally {
    await db.business.deleteMany({ where: { id: business.id } });
  }
});

test('deleteBusinessPermanently allows an archived real customer to be permanently deleted with full confirmation', async () => {
  const seed = makeSeed('archived-real-delete');
  const { business } = await createBusinessGraph({ seed, isTestBusiness: false, archived: true });

  try {
    await deleteBusinessPermanently({
      businessId: business.id,
      confirmationName: business.name,
      realCustomerConfirmation: REAL_CUSTOMER_DELETE_CONFIRMATION,
    });

    assert.equal(await db.business.findUnique({ where: { id: business.id } }), null);
  } finally {
    await db.business.deleteMany({ where: { id: business.id } });
  }
});
