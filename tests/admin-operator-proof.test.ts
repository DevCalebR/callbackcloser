import assert from 'node:assert/strict';
import test from 'node:test';

import { BusinessProvisioningStatus, OperatorEventStatus } from '@prisma/client';

import { buildAdminMissedCallValidationTruth, buildAdminOperationalProofs } from '../lib/admin-operator-proof.ts';

test('missed-call validation truth distinguishes explicit sequence proof from manual confirmation', () => {
  const sequenceTruth = buildAdminMissedCallValidationTruth({
    events: [
      {
        type: 'voice.lead_created_from_call',
        status: OperatorEventStatus.SUCCESS,
        summary: 'Lead created from missed call',
        detailsJson: null,
        createdAt: new Date('2026-04-21T10:00:00.000Z'),
        relatedEntityType: 'lead',
        relatedEntityId: 'lead_123456',
      },
      {
        type: 'messaging.missed_call_sms_started',
        status: OperatorEventStatus.SUCCESS,
        summary: 'Recovery SMS started',
        detailsJson: null,
        createdAt: new Date('2026-04-21T10:01:00.000Z'),
        relatedEntityType: 'lead',
        relatedEntityId: 'lead_123456',
      },
      {
        type: 'owner_alert.sms_sent',
        status: OperatorEventStatus.SUCCESS,
        summary: 'Owner alert sent',
        detailsJson: null,
        createdAt: new Date('2026-04-21T10:03:00.000Z'),
        relatedEntityType: 'lead',
        relatedEntityId: 'lead_123456',
      },
    ],
    successfulLeadCount: 0,
  });

  assert.equal(sequenceTruth.state, 'validated_by_sequence');
  assert.equal(sequenceTruth.countsAsLaunchProof, true);
  assert.match(sequenceTruth.detail, /owner alert/i);

  const manualTruth = buildAdminMissedCallValidationTruth({
    events: [
      {
        type: 'admin.missed_call_validation_confirmed',
        status: OperatorEventStatus.SUCCESS,
        summary: 'Missed-call flow manually confirmed',
        detailsJson: { note: 'Validated from a real missed call and owner alert on my phone.' },
        createdAt: new Date('2026-04-21T11:00:00.000Z'),
        relatedEntityType: null,
        relatedEntityId: null,
      },
    ],
    successfulLeadCount: 0,
  });

  assert.equal(manualTruth.state, 'manually_confirmed');
  assert.equal(manualTruth.countsAsLaunchProof, true);
  assert.match(manualTruth.detail, /real missed call/i);
});

test('operational proofs keep go-live truth honest when proof is incomplete', () => {
  const missedCallValidation = buildAdminMissedCallValidationTruth({
    events: [],
    successfulLeadCount: 0,
  });

  const proofBundle = buildAdminOperationalProofs({
    ownerConnected: true,
    ownerEmail: 'owner@acme.com',
    ownerPhone: '+15551230000',
    messagingServiceReady: true,
    numberAssigned: true,
    testSmsTruth: {
      state: 'delivered',
      label: 'Delivered',
      tone: 'success',
      summary: 'Test SMS delivered',
      detail: 'Delivery confirmed.',
      reason: null,
      lastAttemptAt: new Date('2026-04-21T12:00:00.000Z'),
      eventType: 'admin.test_sms_delivered',
    },
    missedCallValidation,
    webhookSnapshot: {
      currentVoiceUrl: 'https://app.callbackcloser.com/api/twilio/voice',
      currentSmsUrl: 'https://app.callbackcloser.com/api/twilio/sms',
      currentStatusUrl: 'https://app.callbackcloser.com/api/twilio/message-status',
      expectedVoiceUrl: 'https://app.callbackcloser.com/api/twilio/voice',
      expectedSmsUrl: 'https://app.callbackcloser.com/api/twilio/sms',
      expectedStatusUrl: 'https://app.callbackcloser.com/api/twilio/message-status',
      voiceSynced: true,
      smsSynced: true,
      statusSynced: true,
      error: null,
    },
    provisioningStatus: BusinessProvisioningStatus.LIVE,
    canSafelyMarkLive: false,
    blockers: ['Run one real missed-call test and confirm the lead reaches the owner before marking this business live.'],
    events: [],
  });

  const goLiveProof = proofBundle.proofs.find((proof) => proof.key === 'go_live_decision');
  const missedCallProof = proofBundle.proofs.find((proof) => proof.key === 'missed_call_flow');

  assert.equal(goLiveProof?.status, 'failed');
  assert.match(goLiveProof?.detail || '', /launch gaps still exist/i);
  assert.equal(missedCallProof?.status, 'not_started');
  assert.equal(proofBundle.goLiveDecision.state, 'marked_live_with_warnings');
});
