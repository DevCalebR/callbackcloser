import assert from 'node:assert/strict';
import test from 'node:test';
import { LeadReadiness, LeadStatus } from '@prisma/client';

import { DEFAULT_AVERAGE_JOB_VALUE } from '../lib/business-settings.ts';
import { buildRecoveryMetrics, estimateRevenueSaved, isRecoveredLead } from '../lib/dashboard-home.ts';

test('isRecoveredLead only counts qualified or progressed leads', () => {
  assert.equal(
    isRecoveredLead({
      status: LeadStatus.NEW,
      readiness: LeadReadiness.PENDING,
      qualifiedAt: null,
      notifiedAt: null,
      ownerNotifiedAt: null,
    }),
    false,
  );

  assert.equal(
    isRecoveredLead({
      status: LeadStatus.QUALIFIED,
      readiness: LeadReadiness.QUALIFIED,
      qualifiedAt: new Date('2026-05-20T10:00:00.000Z'),
      notifiedAt: null,
      ownerNotifiedAt: null,
    }),
    true,
  );
});

test('buildRecoveryMetrics calculates the money-focused dashboard counts', () => {
  const leads = [
    {
      status: LeadStatus.NEW,
      readiness: LeadReadiness.PENDING,
      qualifiedAt: null,
      notifiedAt: null,
      ownerNotifiedAt: null,
    },
    {
      status: LeadStatus.QUALIFIED,
      readiness: LeadReadiness.QUALIFIED,
      qualifiedAt: new Date('2026-05-20T10:00:00.000Z'),
      notifiedAt: null,
      ownerNotifiedAt: null,
    },
    {
      status: LeadStatus.BOOKED,
      readiness: LeadReadiness.URGENT,
      qualifiedAt: new Date('2026-05-20T10:00:00.000Z'),
      notifiedAt: new Date('2026-05-20T10:05:00.000Z'),
      ownerNotifiedAt: new Date('2026-05-20T10:05:00.000Z'),
    },
  ];

  const metrics = buildRecoveryMetrics(leads);

  assert.equal(metrics.missedCallsCaptured, 3);
  assert.equal(metrics.recoveredLeads, 2);
  assert.equal(metrics.bookedJobs, 1);
  assert.equal(metrics.averageJobValue, DEFAULT_AVERAGE_JOB_VALUE);
  assert.equal(metrics.usesDefaultAverageJobValue, true);
  assert.equal(
    metrics.estimatedRevenueSaved,
    estimateRevenueSaved({
      bookedJobs: 1,
      recoveredLeads: 2,
      averageJobValue: DEFAULT_AVERAGE_JOB_VALUE,
    }),
  );
});

test('buildRecoveryMetrics uses the business-specific average job value when configured', () => {
  const leads = [
    {
      status: LeadStatus.QUALIFIED,
      readiness: LeadReadiness.QUALIFIED,
      qualifiedAt: new Date('2026-05-20T10:00:00.000Z'),
      notifiedAt: null,
      ownerNotifiedAt: null,
    },
    {
      status: LeadStatus.BOOKED,
      readiness: LeadReadiness.URGENT,
      qualifiedAt: new Date('2026-05-20T10:00:00.000Z'),
      notifiedAt: new Date('2026-05-20T10:05:00.000Z'),
      ownerNotifiedAt: new Date('2026-05-20T10:05:00.000Z'),
    },
  ];

  const metrics = buildRecoveryMetrics(leads, 75_000);

  assert.equal(metrics.averageJobValue, 750);
  assert.equal(metrics.usesDefaultAverageJobValue, false);
  assert.equal(
    metrics.estimatedRevenueSaved,
    estimateRevenueSaved({
      bookedJobs: 1,
      recoveredLeads: 2,
      averageJobValue: 750,
    }),
  );
});

test('buildRecoveryMetrics treats an explicitly configured $500 value as custom data', () => {
  const metrics = buildRecoveryMetrics(
    [
      {
        status: LeadStatus.BOOKED,
        readiness: LeadReadiness.URGENT,
        qualifiedAt: new Date('2026-05-20T10:00:00.000Z'),
        notifiedAt: new Date('2026-05-20T10:05:00.000Z'),
        ownerNotifiedAt: new Date('2026-05-20T10:05:00.000Z'),
      },
    ],
    50_000,
  );

  assert.equal(metrics.averageJobValue, DEFAULT_AVERAGE_JOB_VALUE);
  assert.equal(metrics.usesDefaultAverageJobValue, false);
});
