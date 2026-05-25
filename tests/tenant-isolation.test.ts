import assert from 'node:assert/strict';
import test from 'node:test';

import { LeadStatus } from '@prisma/client';

import { getLeadOutcomeSummary } from '../lib/lead-outcomes.ts';
import {
  getBillingUsageSnapshotForBusiness,
  getBusinessForOwnerClerkId,
  getBusinessNotificationSettingsForBusiness,
  getConversationDetailForBusiness,
  getLeadDetailForBusiness,
  getLeadRecordingForOwnerClerkId,
  listAllDashboardLeadsForBusiness,
  listConversationsForBusiness,
  listDashboardLeadsForBusiness,
  updateLeadStatusForBusiness,
} from '../lib/business-access.ts';
import { db } from '../lib/db.ts';
import { cleanupTenantFixtures, seedTenantFixtures } from './tenant-fixtures.ts';

test('tenant-scoped helpers block cross-business reads and writes while preserving own access', async () => {
  const fixtures = await seedTenantFixtures();

  try {
    const businessForOwnerA = await getBusinessForOwnerClerkId(fixtures.ownerA);
    const businessForOwnerB = await getBusinessForOwnerClerkId(fixtures.ownerB);
    assert.equal(businessForOwnerA?.id, fixtures.businessA.id);
    assert.equal(businessForOwnerB?.id, fixtures.businessB.id);

    const dashboardA = await listDashboardLeadsForBusiness(fixtures.businessA.id, null);
    assert.deepEqual(dashboardA.map((lead) => lead.id), [fixtures.leadA.id]);

    const allDashboardA = await listAllDashboardLeadsForBusiness(fixtures.businessA.id);
    assert.deepEqual(allDashboardA.map((lead) => lead.id), [fixtures.leadA.id]);
    assert.deepEqual(getLeadOutcomeSummary(allDashboardA), {
      totalLeads: 1,
      closedLeads: 0,
      lostLeads: 0,
      openLeads: 1,
      conversionRate: 0,
    });

    const leadDetailA = await getLeadDetailForBusiness(fixtures.businessA.id, fixtures.leadA.id);
    assert.equal(leadDetailA?.id, fixtures.leadA.id);
    assert.equal(leadDetailA?.businessId, fixtures.businessA.id);

    const leadDetailBFromA = await getLeadDetailForBusiness(fixtures.businessA.id, fixtures.leadB.id);
    assert.equal(leadDetailBFromA, null);

    const conversationsA = await listConversationsForBusiness(fixtures.businessA.id);
    assert.deepEqual(conversationsA.map((lead) => lead.id), [fixtures.leadA.id]);

    const conversationDetailA = await getConversationDetailForBusiness(fixtures.businessA.id, fixtures.leadA.id);
    assert.equal(conversationDetailA?.id, fixtures.leadA.id);

    const conversationDetailBFromA = await getConversationDetailForBusiness(fixtures.businessA.id, fixtures.leadB.id);
    assert.equal(conversationDetailBFromA, null);

    const settingsA = await getBusinessNotificationSettingsForBusiness(fixtures.businessA.id);
    const settingsB = await getBusinessNotificationSettingsForBusiness(fixtures.businessB.id);
    assert.equal(settingsA?.ownerEmail?.includes('tenant-a-'), true);
    assert.equal(settingsB?.ownerEmail?.includes('tenant-b-'), true);
    assert.notEqual(settingsA?.businessId, settingsB?.businessId);

    const billingSnapshotA = await getBillingUsageSnapshotForBusiness({
      businessId: fixtures.businessA.id,
      start: new Date(Date.now() - 86_400_000),
      end: new Date(Date.now() + 86_400_000),
    });
    assert.deepEqual(billingSnapshotA, {
      cycleSmsSent: 1,
      cycleMissedCalls: 1,
      cycleOwnerAlerts: 1,
    });

    const blockedUpdate = await updateLeadStatusForBusiness({
      businessId: fixtures.businessA.id,
      leadId: fixtures.leadB.id,
      status: LeadStatus.LOST,
    });
    assert.equal(blockedUpdate, null);

    const leadBAfterBlockedUpdate = await db.lead.findUnique({ where: { id: fixtures.leadB.id } });
    assert.equal(leadBAfterBlockedUpdate?.status, LeadStatus.QUALIFIED);

    const allowedUpdate = await updateLeadStatusForBusiness({
      businessId: fixtures.businessA.id,
      leadId: fixtures.leadA.id,
      status: LeadStatus.BOOKED,
    });
    assert.equal(allowedUpdate?.status, LeadStatus.BOOKED);

    const allDashboardAAfterUpdate = await listAllDashboardLeadsForBusiness(fixtures.businessA.id);
    assert.equal(allDashboardAAfterUpdate[0]?.status, LeadStatus.BOOKED);
    assert.deepEqual(getLeadOutcomeSummary(allDashboardAAfterUpdate), {
      totalLeads: 1,
      closedLeads: 1,
      lostLeads: 0,
      openLeads: 0,
      conversionRate: 100,
    });

    const ownRecording = await getLeadRecordingForOwnerClerkId({
      leadId: fixtures.leadA.id,
      ownerClerkId: fixtures.ownerA,
    });
    assert.equal(ownRecording?.id, fixtures.leadA.id);
    assert.ok(ownRecording?.call?.recordingUrl);

    const crossTenantRecording = await getLeadRecordingForOwnerClerkId({
      leadId: fixtures.leadB.id,
      ownerClerkId: fixtures.ownerA,
    });
    assert.equal(crossTenantRecording, null);
  } finally {
    await cleanupTenantFixtures({
      businessAId: fixtures.businessA.id,
      businessBId: fixtures.businessB.id,
    });
  }
});
