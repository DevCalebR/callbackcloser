import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSmsComplianceReply,
  classifySmsComplianceCommand,
  handleInboundSmsComplianceCommand,
} from '../lib/twilio-sms-compliance.ts';

test('classifies STOP-like / START-like / HELP commands case-insensitively', () => {
  assert.equal(classifySmsComplianceCommand('stop'), 'STOP');
  assert.equal(classifySmsComplianceCommand(' STOPALL '), 'STOP');
  assert.equal(classifySmsComplianceCommand('unsubscribe!'), 'STOP');
  assert.equal(classifySmsComplianceCommand('YES'), 'START');
  assert.equal(classifySmsComplianceCommand('unstop'), 'START');
  assert.equal(classifySmsComplianceCommand('help?'), 'HELP');
  assert.equal(classifySmsComplianceCommand('hello there'), null);
});

test('STOP flow persists opt-out and returns compliant confirmation', async () => {
  const persisted: Array<Record<string, unknown>> = [];

  const result = await handleInboundSmsComplianceCommand({
    businessId: 'biz_123',
    fromPhone: '+15551230000',
    body: 'STOP',
    messageSid: 'SM123',
    persistPreference: async (params) => {
      persisted.push(params as unknown as Record<string, unknown>);
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.command, 'STOP');
  assert.equal(result.stateChange, 'opted_out');
  assert.match(result.replyText, /Reply START to opt back in/i);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].command, 'STOP');
});

test('START flow clears opt-out and returns confirmation', async () => {
  const persisted: Array<Record<string, unknown>> = [];

  const result = await handleInboundSmsComplianceCommand({
    businessId: 'biz_123',
    fromPhone: '+15551230000',
    body: 'YES',
    messageSid: 'SM124',
    persistPreference: async (params) => {
      persisted.push(params as unknown as Record<string, unknown>);
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.command, 'START');
  assert.equal(result.stateChange, 'opted_in');
  assert.match(result.replyText, /Reply HELP for help or STOP to opt out/i);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].command, 'START');
});

test('HELP flow returns help text without writing consent state', async () => {
  let persistCalls = 0;

  const result = await handleInboundSmsComplianceCommand({
    businessId: 'biz_123',
    fromPhone: '+15551230000',
    body: 'HELP',
    appName: 'CallbackCloser',
    persistPreference: async () => {
      persistCalls += 1;
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.command, 'HELP');
  assert.equal(result.stateChange, 'help_only');
  assert.equal(persistCalls, 0);
  assert.equal(
    result.replyText,
    buildSmsComplianceReply('HELP', 'CallbackCloser')
  );
});

test('non-compliance inbound SMS returns handled=false', async () => {
  const result = await handleInboundSmsComplianceCommand({
    businessId: 'biz_123',
    fromPhone: '+15551230000',
    body: 'Can you come by this afternoon?',
  });

  assert.deepEqual(result, {
    handled: false,
    command: null,
    replyText: null,
    stateChange: null,
  });
});
