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

test('lead qualifies once service type, urgency, and callback timing are known', () => {
  const lead = {
    serviceType: 'Water heater repair',
    serviceRequested: null,
    urgency: 'Today',
    callbackRequested: true,
    location: '78704',
    zipCode: null,
    callerName: 'Pat Morgan',
    contactName: null,
    bestTime: 'Afternoon',
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

test('lead can qualify from callback intent when urgency is already known', () => {
  const lead = {
    serviceType: 'Drain cleaning',
    serviceRequested: null,
    urgency: 'This week',
    callbackRequested: true,
    location: null,
    zipCode: '78660',
    callerName: null,
    contactName: null,
    bestTime: 'ASAP',
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
    serviceType: 'Water heater repair',
    serviceRequested: 'Water heater repair',
    urgency: 'Today',
    callbackRequested: null,
    location: null,
    zipCode: null,
    callerName: null,
    contactName: null,
    bestTime: null,
    callerPhoneNormalized: '+15125550333',
    status: LeadStatus.NEW,
    notifiedAt: null,
  };

  assert.equal(isLeadQualified(lead), false);
  assert.equal(getLeadReadiness(lead), LeadReadiness.PENDING);
  assert.equal(getQualifiedLeadStatus(lead), LeadStatus.NEW);
});

test('lead summary includes callback timing and customer name when captured', () => {
  const lead = {
    serviceType: 'Panel upgrade',
    serviceRequested: null,
    urgency: 'Emergency',
    callbackRequested: true,
    location: 'Knoxville',
    zipCode: null,
    callerName: 'Jordan',
    contactName: null,
    bestTime: 'ASAP',
    callerPhoneNormalized: '+18655550111',
  };

  const summary = buildLeadSummary(lead);

  assert.match(summary, /Callback: ASAP/);
  assert.match(summary, /Name: Jordan/);
});
