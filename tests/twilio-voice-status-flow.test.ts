import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { BusinessPhoneSetupPath, ForwardedCallAnswerMode, ForwardingVerificationStatus, MessagingSetupMode } from '@prisma/client';

import { db } from '../lib/db.ts';
import { cleanupTenantFixtures, seedTenantFixtures } from './tenant-fixtures.ts';

async function loadTwilioRoutes() {
  const require = createRequire(import.meta.url);
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as NodeJS.Module;

  const [{ POST: voicePost }, { POST: statusPost }] = await Promise.all([
    import('../app/api/twilio/voice/route.ts'),
    import('../app/api/twilio/status/route.ts'),
  ]);

  return { voicePost, statusPost };
}

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

test('voicemail or no press 1 is treated as missed and starts missed-call SMS', async () => {
  const fixtures = await seedTenantFixtures();

  try {
    await db.business.update({
      where: { id: fixtures.businessA.id },
      data: {
        phoneSetupPath: BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING,
        publicBusinessPhone: '+15559990000',
        forwardedCallAnswerMode: ForwardedCallAnswerMode.PRESS_1_REQUIRED,
        messagingSetupMode: MessagingSetupMode.PER_BUSINESS_TWILIO,
        forwardingVerificationStatus: ForwardingVerificationStatus.PENDING,
      },
    });

    await withEnv(
      {
        NODE_ENV: 'test',
        NEXT_PUBLIC_APP_URL: 'https://app.callbackcloser.com',
        STRIPE_PRICE_STARTER: 'price_starter_fixture',
        TWILIO_VALIDATE_SIGNATURE: 'true',
        TWILIO_WEBHOOK_AUTH_TOKEN: 'dev-shared-token',
      },
      async () => {
        const { voicePost, statusPost } = await loadTwilioRoutes();
        const inboundCallSid = 'CA_voice_missed_12345678901234567890';
        const screeningCallSid = 'CA_voice_screen_1234567890123456';

        const inbound = new FormData();
        inbound.set('AccountSid', fixtures.businessA.twilioSubaccountSid!);
        inbound.set('CallSid', inboundCallSid);
        inbound.set('From', '+15554443333');
        inbound.set('To', fixtures.businessA.twilioPrimaryPhoneNumber!);

        const voiceResponse = await voicePost(
          new Request('https://app.callbackcloser.com/api/twilio/voice?webhook_token=dev-shared-token', {
            method: 'POST',
            body: inbound,
          })
        );

        assert.equal(voiceResponse.status, 200);
        assert.match(await voiceResponse.text(), /screen-forwarded-call/i);

        const noAcceptance = new FormData();
        noAcceptance.set('AccountSid', fixtures.businessA.twilioSubaccountSid!);
        noAcceptance.set('CallSid', screeningCallSid);
        noAcceptance.set('ParentCallSid', inboundCallSid);
        noAcceptance.set('From', '+15554443333');
        noAcceptance.set('To', fixtures.businessA.forwardingNumber);

        const screeningResponse = await voicePost(
          new Request(
            `https://app.callbackcloser.com/api/twilio/voice?stage=screen-forwarded-call-result&businessId=${fixtures.businessA.id}&parentCallSid=${inboundCallSid}&webhook_token=dev-shared-token`,
            {
              method: 'POST',
              body: noAcceptance,
            }
          )
        );

        assert.equal(screeningResponse.status, 200);

        const statusPayload = new FormData();
        statusPayload.set('AccountSid', fixtures.businessA.twilioSubaccountSid!);
        statusPayload.set('CallSid', inboundCallSid);
        statusPayload.set('DialCallSid', screeningCallSid);
        statusPayload.set('DialCallStatus', 'completed');
        statusPayload.set('From', '+15554443333');
        statusPayload.set('To', fixtures.businessA.twilioPrimaryPhoneNumber!);

        const statusResponse = await statusPost(
          new Request('https://app.callbackcloser.com/api/twilio/status?webhook_token=dev-shared-token', {
            method: 'POST',
            body: statusPayload,
          })
        );

        assert.equal(statusResponse.status, 200);
      }
    );

    const call = await db.call.findUniqueOrThrow({
      where: { twilioCallSid: 'CA_voice_missed_12345678901234567890' },
      select: {
        answered: true,
        humanAccepted: true,
        missed: true,
        status: true,
      },
    });
    assert.equal(call.answered, false);
    assert.equal(call.humanAccepted, false);
    assert.equal(call.missed, true);
    assert.equal(call.status, 'MISSED');

    const lead = await db.lead.findFirst({
      where: { call: { is: { twilioCallSid: 'CA_voice_missed_12345678901234567890' } } },
      select: { smsStartedAt: true },
    });
    assert.ok(lead?.smsStartedAt);

    const eventTypes = await db.businessOperatorEvent.findMany({
      where: { businessId: fixtures.businessA.id },
      orderBy: { createdAt: 'asc' },
      select: { type: true },
    });
    assert.equal(eventTypes.some((event) => event.type === 'voice.no_human_acceptance_detected'), true);
    assert.equal(eventTypes.some((event) => event.type === 'voice.voicemail_or_timeout_treated_as_missed'), true);
    assert.equal(eventTypes.some((event) => event.type === 'voice.missed_call_sms_started'), true);
  } finally {
    await cleanupTenantFixtures({
      businessAId: fixtures.businessA.id,
      businessBId: fixtures.businessB.id,
    });
  }
});

test('press 1 marks the call answered and prevents missed-call SMS recovery', async () => {
  const fixtures = await seedTenantFixtures();

  try {
    await db.business.update({
      where: { id: fixtures.businessA.id },
      data: {
        phoneSetupPath: BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING,
        publicBusinessPhone: '+15558887777',
        forwardedCallAnswerMode: ForwardedCallAnswerMode.PRESS_1_REQUIRED,
        messagingSetupMode: MessagingSetupMode.PER_BUSINESS_TWILIO,
        forwardingVerificationStatus: ForwardingVerificationStatus.PENDING,
      },
    });

    await withEnv(
      {
        NODE_ENV: 'test',
        NEXT_PUBLIC_APP_URL: 'https://app.callbackcloser.com',
        STRIPE_PRICE_STARTER: 'price_starter_fixture',
        TWILIO_VALIDATE_SIGNATURE: 'true',
        TWILIO_WEBHOOK_AUTH_TOKEN: 'dev-shared-token',
      },
      async () => {
        const { voicePost, statusPost } = await loadTwilioRoutes();
        const inboundCallSid = 'CA_voice_answered_1234567890123456';
        const screeningCallSid = 'CA_voice_screen_accepted_12345678';

        const inbound = new FormData();
        inbound.set('AccountSid', fixtures.businessA.twilioSubaccountSid!);
        inbound.set('CallSid', inboundCallSid);
        inbound.set('From', '+15556667777');
        inbound.set('To', fixtures.businessA.twilioPrimaryPhoneNumber!);
        await voicePost(
          new Request('https://app.callbackcloser.com/api/twilio/voice?webhook_token=dev-shared-token', {
            method: 'POST',
            body: inbound,
          })
        );

        const accepted = new FormData();
        accepted.set('AccountSid', fixtures.businessA.twilioSubaccountSid!);
        accepted.set('CallSid', screeningCallSid);
        accepted.set('ParentCallSid', inboundCallSid);
        accepted.set('From', '+15556667777');
        accepted.set('To', fixtures.businessA.forwardingNumber);
        accepted.set('Digits', '1');

        const screeningResponse = await voicePost(
          new Request(
            `https://app.callbackcloser.com/api/twilio/voice?stage=screen-forwarded-call-result&businessId=${fixtures.businessA.id}&parentCallSid=${inboundCallSid}&webhook_token=dev-shared-token`,
            {
              method: 'POST',
              body: accepted,
            }
          )
        );

        assert.equal(screeningResponse.status, 200);
        assert.match(await screeningResponse.text(), /Connecting you now/i);

        const statusPayload = new FormData();
        statusPayload.set('AccountSid', fixtures.businessA.twilioSubaccountSid!);
        statusPayload.set('CallSid', inboundCallSid);
        statusPayload.set('DialCallSid', screeningCallSid);
        statusPayload.set('DialCallStatus', 'completed');
        statusPayload.set('From', '+15556667777');
        statusPayload.set('To', fixtures.businessA.twilioPrimaryPhoneNumber!);

        const statusResponse = await statusPost(
          new Request('https://app.callbackcloser.com/api/twilio/status?webhook_token=dev-shared-token', {
            method: 'POST',
            body: statusPayload,
          })
        );

        assert.equal(statusResponse.status, 200);
      }
    );

    const call = await db.call.findUniqueOrThrow({
      where: { twilioCallSid: 'CA_voice_answered_1234567890123456' },
      select: {
        answered: true,
        humanAccepted: true,
        missed: true,
        status: true,
      },
    });
    assert.equal(call.answered, true);
    assert.equal(call.humanAccepted, true);
    assert.equal(call.missed, false);
    assert.equal(call.status, 'ANSWERED');

    const lead = await db.lead.findFirst({
      where: { call: { is: { twilioCallSid: 'CA_voice_answered_1234567890123456' } } },
    });
    assert.equal(lead, null);

    const eventTypes = await db.businessOperatorEvent.findMany({
      where: { businessId: fixtures.businessA.id },
      orderBy: { createdAt: 'asc' },
      select: { type: true },
    });
    assert.equal(eventTypes.some((event) => event.type === 'voice.human_accepted_call'), true);
    assert.equal(eventTypes.some((event) => event.type === 'voice.missed_call_sms_started'), false);
  } finally {
    await cleanupTenantFixtures({
      businessAId: fixtures.businessA.id,
      businessBId: fixtures.businessB.id,
    });
  }
});
