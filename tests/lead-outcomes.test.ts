import assert from 'node:assert/strict';
import test from 'node:test';

import { LeadStatus } from '@prisma/client';

import { formatConversionRate, getLeadOutcomeSummary } from '../lib/lead-outcomes.ts';

test('lead outcome summary counts closed and lost leads with a simple conversion rate', () => {
  const summary = getLeadOutcomeSummary([
    { status: LeadStatus.NEW },
    { status: LeadStatus.CONTACTED },
    { status: LeadStatus.BOOKED },
    { status: LeadStatus.BOOKED },
    { status: LeadStatus.LOST },
  ]);

  assert.deepEqual(summary, {
    totalLeads: 5,
    closedLeads: 2,
    lostLeads: 1,
    openLeads: 2,
    conversionRate: 40,
  });
  assert.equal(formatConversionRate(summary.conversionRate), '40%');
});

test('lead outcome summary stays readable when no leads exist', () => {
  assert.deepEqual(getLeadOutcomeSummary([]), {
    totalLeads: 0,
    closedLeads: 0,
    lostLeads: 0,
    openLeads: 0,
    conversionRate: 0,
  });
});
