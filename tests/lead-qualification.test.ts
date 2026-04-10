import assert from 'node:assert/strict';
import test from 'node:test';

import { LeadReadiness, LeadStatus } from '@prisma/client';

import {
  buildLeadSummary,
  getLeadReadiness,
  getQualifiedLeadStatus,
  isLeadQualified,
  isUrgentLead,
} from '../lib/lead-qualification.ts';

test('lead qualifies once service type and urgency are known', () => {
  const lead = {
    serviceType: 'Water heater repair',
    serviceRequested: null,
    urgency: 'Today',
    callbackRequested: null,
    location: '78704',
    zipCode: null,
    callerName: 'Pat Morgan',
    contactName: null,
    callerPhoneNormalized: '+15125550177',
    status: LeadStatus.NEW,
    notifiedAt: null,
  };

  assert.equal(isLeadQualified(lead), true);
  assert.equal(isUrgentLead(lead), true);
  assert.equal(getLeadReadiness(lead), LeadReadiness.URGENT);
  assert.equal(getQualifiedLeadStatus(lead), LeadStatus.QUALIFIED);
  assert.match(buildLeadSummary(lead), /Water heater repair/);
  assert.match(buildLeadSummary(lead), /78704/);
});

test('lead can qualify from callback intent even without urgency', () => {
  const lead = {
    serviceType: 'Drain cleaning',
    serviceRequested: null,
    urgency: null,
    callbackRequested: true,
    location: null,
    zipCode: '78660',
    callerName: null,
    contactName: null,
    callerPhoneNormalized: '+15125550222',
    status: LeadStatus.NEW,
    notifiedAt: null,
  };

  assert.equal(isLeadQualified(lead), true);
  assert.equal(getLeadReadiness(lead), LeadReadiness.QUALIFIED);
  assert.equal(getQualifiedLeadStatus(lead), LeadStatus.QUALIFIED);
});

test('lead stays new until required qualification fields are present', () => {
  const lead = {
    serviceType: null,
    serviceRequested: null,
    urgency: 'Today',
    callbackRequested: null,
    location: null,
    zipCode: null,
    callerName: null,
    contactName: null,
    callerPhoneNormalized: '+15125550333',
    status: LeadStatus.NEW,
    notifiedAt: null,
  };

  assert.equal(isLeadQualified(lead), false);
  assert.equal(getLeadReadiness(lead), LeadReadiness.PENDING);
  assert.equal(getQualifiedLeadStatus(lead), LeadStatus.NEW);
});
