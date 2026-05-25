import assert from 'node:assert/strict';
import test from 'node:test';

import { OperatorEventCategory, OperatorEventStatus } from '@prisma/client';

import { db } from '../lib/db.ts';
import { persistAcceptedOutboundMessage } from '../lib/outbound-message-persistence.ts';
import { buildOutboundMessageStatusEvent, getOutboundMessageContext } from '../lib/outbound-message-events.ts';
import { cleanupTenantFixtures, seedTenantFixtures } from './tenant-fixtures.ts';

test('outbound message context distinguishes admin test, owner alert, and lead flows', () => {
  assert.equal(
    getOutboundMessageContext({
      leadId: null,
      participant: 'OWNER',
      body: 'CallbackCloser admin test: Acme Plumbing is using +15550001111 for live support verification.',
      rawPayload: null,
    }),
    'admin_test'
  );

  assert.equal(
    getOutboundMessageContext({
      leadId: null,
      participant: 'OWNER',
      body: 'CallbackCloser setup test: Acme Plumbing is using +15550001111 for launch verification.',
      rawPayload: { context: 'admin_test' },
    }),
    'admin_test'
  );

  assert.equal(
    getOutboundMessageContext({
      leadId: 'lead_123',
      participant: 'OWNER',
      body: 'CallbackCloser lead for Acme Plumbing: Emergency repair.',
      rawPayload: null,
    }),
    'owner_alert'
  );

  assert.equal(
    getOutboundMessageContext({
      leadId: 'lead_456',
      participant: 'LEAD',
      body: 'What service do you need help with?',
      rawPayload: null,
    }),
    'lead_recovery'
  );
});

test('terminal outbound message status events stay founder-facing', () => {
  const deliveredTest = buildOutboundMessageStatusEvent(
    {
      leadId: null,
      participant: 'OWNER',
      body: 'CallbackCloser admin test: Acme Plumbing is using +15550001111 for live support verification.',
      rawPayload: null,
    },
    'delivered'
  );

  assert.deepEqual(deliveredTest, {
    type: 'admin.test_sms_delivered',
    category: OperatorEventCategory.ADMIN_ACTIONS,
    status: OperatorEventStatus.SUCCESS,
    summary: 'Test SMS delivered',
  });

  const failedOwnerAlert = buildOutboundMessageStatusEvent(
    {
      leadId: 'lead_123',
      participant: 'OWNER',
      body: 'CallbackCloser lead for Acme Plumbing: Emergency repair.',
      rawPayload: null,
    },
    'undelivered'
  );

  assert.deepEqual(failedOwnerAlert, {
    type: 'owner_alert.sms_delivery_failed',
    category: OperatorEventCategory.OWNER_ALERTS,
    status: OperatorEventStatus.FAILED,
    summary: 'Owner SMS alert delivery failed',
  });
});

test('outbound setup test SMS persists the Twilio sid and destination on the message record', async () => {
  const fixtures = await seedTenantFixtures();

  try {
    const stored = await persistAcceptedOutboundMessage({
      businessId: fixtures.businessA.id,
      fromPhone: fixtures.businessA.twilioPrimaryPhoneNumber!,
      toPhone: '+15554443333',
      body: `CallbackCloser setup test: ${fixtures.businessA.name} is using ${fixtures.businessA.twilioPrimaryPhoneNumber} for launch verification.`,
      participant: 'OWNER',
      twilioSid: 'SMsetup1234567890',
      status: 'queued',
      context: 'admin_test',
      statusCallback: 'https://app.callbackcloser.com/api/twilio/message-status',
      messagingServiceSid: fixtures.businessA.twilioMessagingServiceSid,
      twilioCreatedAt: new Date('2026-05-24T14:15:00.000Z'),
    });

    const storedMessage = await db.message.findUniqueOrThrow({
      where: { id: stored.id },
      select: {
        twilioSid: true,
        toPhone: true,
        rawPayload: true,
      },
    });

    assert.equal(storedMessage.twilioSid, 'SMsetup1234567890');
    assert.equal(storedMessage.toPhone, '+15554443333');
    assert.deepEqual(storedMessage.rawPayload, {
      source: 'twilio_api',
      context: 'admin_test',
      statusCallback: 'https://app.callbackcloser.com/api/twilio/message-status',
      messagingServiceSid: fixtures.businessA.twilioMessagingServiceSid,
    });
  } finally {
    await cleanupTenantFixtures({
      businessAId: fixtures.businessA.id,
      businessBId: fixtures.businessB.id,
    });
  }
});
