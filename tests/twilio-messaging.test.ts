import assert from 'node:assert/strict';
import test from 'node:test';

import { OperatorEventCategory, OperatorEventStatus } from '@prisma/client';

import { buildOutboundMessageStatusEvent, getOutboundMessageContext } from '../lib/outbound-message-events.ts';

test('outbound message context distinguishes admin test, owner alert, and lead flows', () => {
  assert.equal(
    getOutboundMessageContext({
      leadId: null,
      participant: 'OWNER',
      body: 'CallbackCloser admin test: Acme Plumbing is using +15550001111 for live support verification.',
    }),
    'admin_test'
  );

  assert.equal(
    getOutboundMessageContext({
      leadId: 'lead_123',
      participant: 'OWNER',
      body: 'CallbackCloser lead for Acme Plumbing: Emergency repair.',
    }),
    'owner_alert'
  );

  assert.equal(
    getOutboundMessageContext({
      leadId: 'lead_456',
      participant: 'LEAD',
      body: 'What service do you need help with?',
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
