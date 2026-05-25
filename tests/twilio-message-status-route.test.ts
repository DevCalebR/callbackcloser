import assert from 'node:assert/strict';
import test from 'node:test';

import { MessageDirection, MessageParticipant, OperatorEventStatus } from '@prisma/client';

import { POST } from '../app/api/twilio/message-status/route.ts';
import { getAdminTestSmsConfidenceState } from '../lib/admin-dashboard.ts';
import { buildAdminTestSmsTruth } from '../lib/admin-operator-visibility.ts';
import { db } from '../lib/db.ts';
import { cleanupTenantFixtures, seedTenantFixtures } from './tenant-fixtures.ts';

async function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => Promise<T> | T) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('message-status route marks a setup test SMS delivered and clears the checklist gate', async () => {
  const fixtures = await seedTenantFixtures();

  try {
    const destinationPhone = '+15554443333';
    await db.message.create({
      data: {
        businessId: fixtures.businessA.id,
        direction: MessageDirection.OUTBOUND,
        participant: MessageParticipant.OWNER,
        fromPhone: fixtures.businessA.twilioPrimaryPhoneNumber!,
        toPhone: destinationPhone,
        body: `CallbackCloser setup test: ${fixtures.businessA.name} is using ${fixtures.businessA.twilioPrimaryPhoneNumber} for launch verification.`,
        status: 'sent',
        twilioSid: 'SM_setup_delivered_123',
        rawPayload: {
          source: 'twilio_api',
          context: 'admin_test',
        },
      },
    });

    await withEnv(
      {
        NODE_ENV: 'development',
        TWILIO_VALIDATE_SIGNATURE: 'true',
        TWILIO_WEBHOOK_AUTH_TOKEN: 'dev-shared-token',
      },
      async () => {
        const formData = new FormData();
        formData.set('AccountSid', fixtures.businessA.twilioSubaccountSid!);
        formData.set('MessageSid', 'SM_setup_delivered_123');
        formData.set('MessageStatus', 'delivered');
        formData.set('From', fixtures.businessA.twilioPrimaryPhoneNumber!);
        formData.set('To', destinationPhone);
        formData.set('MessagingServiceSid', fixtures.businessA.twilioMessagingServiceSid!);

        const response = await POST(
          new Request('https://app.callbackcloser.com/api/twilio/message-status?webhook_token=dev-shared-token', {
            method: 'POST',
            body: formData,
          })
        );

        assert.equal(response.status, 200);
      }
    );

    const updatedMessage = await db.message.findUniqueOrThrow({
      where: { twilioSid: 'SM_setup_delivered_123' },
      select: { status: true },
    });
    assert.equal(updatedMessage.status, 'delivered');

    const operatorEvents = await db.businessOperatorEvent.findMany({
      where: {
        businessId: fixtures.businessA.id,
        type: {
          startsWith: 'admin.test_sms_',
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        type: true,
        status: true,
        summary: true,
        detailsJson: true,
        createdAt: true,
      },
    });

    assert.equal(operatorEvents[0]?.type, 'admin.test_sms_delivered');
    assert.equal(
      getAdminTestSmsConfidenceState(
        operatorEvents.map((event) => ({
          type: event.type,
          status: event.status,
          createdAt: event.createdAt,
        }))
      ),
      'delivered'
    );
  } finally {
    await cleanupTenantFixtures({
      businessAId: fixtures.businessA.id,
      businessBId: fixtures.businessB.id,
    });
  }
});

test('message-status route surfaces undelivered setup test SMS failures from SmsSid and SmsStatus payloads', async () => {
  const fixtures = await seedTenantFixtures();

  try {
    const destinationPhone = '+15556667777';
    await db.message.create({
      data: {
        businessId: fixtures.businessA.id,
        direction: MessageDirection.OUTBOUND,
        participant: MessageParticipant.OWNER,
        fromPhone: fixtures.businessA.twilioPrimaryPhoneNumber!,
        toPhone: destinationPhone,
        body: `CallbackCloser setup test: ${fixtures.businessA.name} is using ${fixtures.businessA.twilioPrimaryPhoneNumber} for launch verification.`,
        status: 'sent',
        twilioSid: 'SM_setup_failed_456',
        rawPayload: {
          source: 'twilio_api',
          context: 'admin_test',
        },
      },
    });

    await withEnv(
      {
        NODE_ENV: 'development',
        TWILIO_VALIDATE_SIGNATURE: 'true',
        TWILIO_WEBHOOK_AUTH_TOKEN: 'dev-shared-token',
      },
      async () => {
        const formData = new FormData();
        formData.set('AccountSid', fixtures.businessA.twilioSubaccountSid!);
        formData.set('SmsSid', 'SM_setup_failed_456');
        formData.set('SmsStatus', 'undelivered');
        formData.set('From', fixtures.businessA.twilioPrimaryPhoneNumber!);
        formData.set('To', destinationPhone);
        formData.set('MessagingServiceSid', fixtures.businessA.twilioMessagingServiceSid!);
        formData.set('ErrorCode', '30007');
        formData.set('ErrorMessage', 'Carrier violation');

        const response = await POST(
          new Request('https://app.callbackcloser.com/api/twilio/message-status?webhook_token=dev-shared-token', {
            method: 'POST',
            body: formData,
          })
        );

        assert.equal(response.status, 200);
      }
    );

    const updatedMessage = await db.message.findUniqueOrThrow({
      where: { twilioSid: 'SM_setup_failed_456' },
      select: { status: true },
    });
    assert.equal(updatedMessage.status, 'undelivered');

    const operatorEvents = await db.businessOperatorEvent.findMany({
      where: {
        businessId: fixtures.businessA.id,
        type: {
          startsWith: 'admin.test_sms_',
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        type: true,
        status: true,
        summary: true,
        detailsJson: true,
        createdAt: true,
      },
    });

    assert.equal(operatorEvents[0]?.type, 'admin.test_sms_delivery_failed');
    assert.equal(operatorEvents[0]?.status, OperatorEventStatus.FAILED);
    assert.equal(
      getAdminTestSmsConfidenceState(
        operatorEvents.map((event) => ({
          type: event.type,
          status: event.status,
          createdAt: event.createdAt,
        }))
      ),
      'failed'
    );

    const truth = buildAdminTestSmsTruth(operatorEvents);
    assert.equal(truth.label, 'Failed');
    assert.match(truth.detail, /Carrier violation/i);
  } finally {
    await cleanupTenantFixtures({
      businessAId: fixtures.businessA.id,
      businessBId: fixtures.businessB.id,
    });
  }
});
