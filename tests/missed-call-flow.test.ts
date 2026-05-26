import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { SmsConversationState } from '@prisma/client';

import { db } from '../lib/db.ts';
import { cleanupTenantFixtures, seedTenantFixtures } from './tenant-fixtures.ts';

async function loadMissedCallModules() {
  const require = createRequire(import.meta.url);
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as NodeJS.Module;

  const [{ startMissedCallRecovery, processLeadInboundReply }, { advanceLeadConversation }] = await Promise.all([
    import('../lib/missed-call-flow.ts'),
    import('../lib/sms-state-machine.ts'),
  ]);

  return { startMissedCallRecovery, processLeadInboundReply, advanceLeadConversation };
}

test('missed-call recovery collects richer lead details and formats the owner alert', async () => {
  const fixtures = await seedTenantFixtures();
  const callerPhone = '+18655550999';

  try {
    const { startMissedCallRecovery, processLeadInboundReply } = await loadMissedCallModules();
    const recovery = await startMissedCallRecovery({
      business: fixtures.businessA,
      callerPhone,
      isSimulator: true,
      transport: 'simulated',
    });

    assert.equal(recovery.started, true);

    const introMessage = await db.message.findFirst({
      where: {
        leadId: recovery.lead.id,
        direction: 'OUTBOUND',
      },
      orderBy: { createdAt: 'asc' },
      select: { body: true },
    });

    assert.match(introMessage?.body ?? '', /What can we help you with today/i);
    assert.match(introMessage?.body ?? '', /Reply STOP to opt out/i);

    const serviceReply = await processLeadInboundReply({
      business: fixtures.businessA,
      leadId: recovery.lead.id,
      body: 'Repair',
      fromPhone: callerPhone,
      toPhone: fixtures.businessA.twilioPrimaryPhoneNumber!,
      transport: 'simulated',
    });

    assert.equal(serviceReply.transition?.nextState, SmsConversationState.AWAITING_URGENCY);
    assert.match(serviceReply.transition?.responseText ?? '', /how soon do you need help/i);

    const urgencyReply = await processLeadInboundReply({
      business: fixtures.businessA,
      leadId: recovery.lead.id,
      body: '2',
      fromPhone: callerPhone,
      toPhone: fixtures.businessA.twilioPrimaryPhoneNumber!,
      transport: 'simulated',
    });

    assert.equal(urgencyReply.transition?.nextState, SmsConversationState.AWAITING_ZIP);
    assert.match(urgencyReply.transition?.responseText ?? '', /what name should we put on the request/i);

    const contactLocationReply = await processLeadInboundReply({
      business: fixtures.businessA,
      leadId: recovery.lead.id,
      body: 'Sarah Miller - 123 Main St, Oak Ridge',
      fromPhone: callerPhone,
      toPhone: fixtures.businessA.twilioPrimaryPhoneNumber!,
      transport: 'simulated',
    });

    assert.equal(contactLocationReply.transition?.nextState, SmsConversationState.AWAITING_BEST_TIME);
    assert.equal(contactLocationReply.lead.callerName, 'Sarah Miller');
    assert.equal(contactLocationReply.lead.location, '123 Main St, Oak Ridge');

    const callbackReply = await processLeadInboundReply({
      business: fixtures.businessA,
      leadId: recovery.lead.id,
      body: '1',
      fromPhone: callerPhone,
      toPhone: fixtures.businessA.twilioPrimaryPhoneNumber!,
      transport: 'simulated',
    });

    assert.equal(callbackReply.transition?.nextState, SmsConversationState.COMPLETED);
    assert.equal(callbackReply.lead.bestTime, 'ASAP');
    assert.equal(callbackReply.lead.smsState, SmsConversationState.COMPLETED);
    assert.match(callbackReply.transition?.responseText ?? '', /Thanks, Sarah Miller/i);

    const updatedLead = await db.lead.findUniqueOrThrow({
      where: { id: recovery.lead.id },
      select: {
        callerName: true,
        location: true,
        bestTime: true,
        urgency: true,
        serviceType: true,
        summary: true,
        notifiedAt: true,
      },
    });

    assert.equal(updatedLead.callerName, 'Sarah Miller');
    assert.equal(updatedLead.location, '123 Main St, Oak Ridge');
    assert.equal(updatedLead.bestTime, 'ASAP');
    assert.match(updatedLead.summary ?? '', /Callback: ASAP/);
    assert.ok(updatedLead.notifiedAt);

    const ownerAlert = await db.ownerNotification.findUniqueOrThrow({
      where: {
        leadId_channel: {
          leadId: recovery.lead.id,
          channel: 'SMS',
        },
      },
      select: { body: true, status: true },
    });

    assert.equal(ownerAlert.status, 'SENT');
    assert.match(ownerAlert.body, /Name: Sarah Miller/);
    assert.match(ownerAlert.body, /Service: Repair/);
    assert.match(ownerAlert.body, /Urgency: Today/);
    assert.match(ownerAlert.body, /Location: 123 Main St, Oak Ridge/);
    assert.match(ownerAlert.body, /Callback: ASAP/);
    assert.match(ownerAlert.body, /Call now: /);
    assert.match(ownerAlert.body, /View lead: .*\/app\/leads\//);
  } finally {
    await cleanupTenantFixtures({
      businessAId: fixtures.businessA.id,
      businessBId: fixtures.businessB.id,
    });
  }
});

test('contact/location parsing and free-text callback fallback do not break the flow', async () => {
  const businessPromptConfig = {
    serviceLabel1: 'Repair',
    serviceLabel2: 'Install',
    serviceLabel3: 'Tune-up',
  };
  const { advanceLeadConversation } = await loadMissedCallModules();

  const contactOnlyTransition = advanceLeadConversation(
    {
      smsState: SmsConversationState.AWAITING_ZIP,
      callerName: null,
      contactName: null,
    },
    'Mike in Clinton',
    businessPromptConfig
  );

  assert.equal(contactOnlyTransition.nextState, SmsConversationState.AWAITING_BEST_TIME);
  assert.equal(contactOnlyTransition.leadUpdates?.callerName, 'Mike');
  assert.equal(contactOnlyTransition.leadUpdates?.location, 'Clinton');

  const uncertainReplyTransition = advanceLeadConversation(
    {
      smsState: SmsConversationState.AWAITING_ZIP,
      callerName: null,
      contactName: null,
    },
    'Caleb',
    businessPromptConfig
  );

  assert.equal(uncertainReplyTransition.nextState, SmsConversationState.AWAITING_BEST_TIME);
  assert.equal(uncertainReplyTransition.leadUpdates?.callerName, 'Caleb');
  assert.equal(uncertainReplyTransition.leadUpdates?.location ?? null, null);

  const callbackTransition = advanceLeadConversation(
    {
      smsState: SmsConversationState.AWAITING_BEST_TIME,
      callerName: 'Caleb',
      contactName: null,
    },
    'after 5pm',
    businessPromptConfig
  );

  assert.equal(callbackTransition.nextState, SmsConversationState.COMPLETED);
  assert.equal(callbackTransition.leadUpdates?.bestTime, 'after 5pm');
  assert.match(callbackTransition.responseText, /Thanks, Caleb/);
});
