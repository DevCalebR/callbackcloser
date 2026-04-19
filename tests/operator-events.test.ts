import assert from 'node:assert/strict';
import test from 'node:test';

import { OperatorEventCategory, OperatorEventStatus } from '@prisma/client';

import { db } from '../lib/db.ts';
import { countTimelineFilters, listBusinessOperatorEvents, recordBusinessOperatorEvent } from '../lib/operator-events.ts';
import { cleanupTenantFixtures, seedTenantFixtures } from './tenant-fixtures.ts';

test('timeline filter counts group operator events into founder-facing buckets', () => {
  const counts = countTimelineFilters([
    { category: OperatorEventCategory.PROVISIONING, status: OperatorEventStatus.SUCCESS },
    { category: OperatorEventCategory.MESSAGING, status: OperatorEventStatus.FAILED },
    { category: OperatorEventCategory.WEBHOOKS, status: OperatorEventStatus.WARNING },
    { category: OperatorEventCategory.ADMIN_ACTIONS, status: OperatorEventStatus.INFO },
  ]);

  assert.equal(counts.get('all'), 4);
  assert.equal(counts.get('errors'), 2);
  assert.equal(counts.get('provisioning'), 1);
  assert.equal(counts.get('messaging'), 1);
  assert.equal(counts.get('webhooks'), 1);
  assert.equal(counts.get('admin'), 1);
});

test('business operator event reads stay business-scoped', async () => {
  const fixtures = await seedTenantFixtures();

  try {
    await recordBusinessOperatorEvent({
      businessId: fixtures.businessA.id,
      type: 'admin.test_sms_accepted',
      category: OperatorEventCategory.ADMIN_ACTIONS,
      status: OperatorEventStatus.SUCCESS,
      summary: 'Test SMS accepted by Twilio',
      details: { destinationPhone: 'US***1234' },
    });
    await recordBusinessOperatorEvent({
      businessId: fixtures.businessB.id,
      type: 'webhooks.sync_failed',
      category: OperatorEventCategory.WEBHOOKS,
      status: OperatorEventStatus.FAILED,
      summary: 'Webhook sync failed',
      details: { error: 'Mismatch detected' },
    });

    const eventsForA = await listBusinessOperatorEvents(fixtures.businessA.id);
    const eventsForB = await listBusinessOperatorEvents(fixtures.businessB.id);

    assert.equal(eventsForA.length, 1);
    assert.equal(eventsForA[0]?.businessId, fixtures.businessA.id);
    assert.equal(eventsForA[0]?.summary, 'Test SMS accepted by Twilio');
    assert.equal(eventsForB.length, 1);
    assert.equal(eventsForB[0]?.businessId, fixtures.businessB.id);

    const directLeak = await db.businessOperatorEvent.findMany({
      where: { businessId: fixtures.businessA.id },
      select: { businessId: true },
    });
    assert.deepEqual(directLeak.map((event) => event.businessId), [fixtures.businessA.id]);
  } finally {
    await cleanupTenantFixtures({
      businessAId: fixtures.businessA.id,
      businessBId: fixtures.businessB.id,
    });
  }
});
