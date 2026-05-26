import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advancePublicSimulatorSession,
  applyPublicSimulatorReply,
  buildPublicSimulatorOwnerAlert,
  canReplyToPublicSimulator,
  getPublicSimulatorQuickReplies,
  maskPublicSimulatorPhone,
  startPublicSimulatorSession,
} from '@/lib/public-simulator';

test('public simulator starts with a masked private run and auto-advances into the first text', () => {
  const startedSession = startPublicSimulatorSession('+1 (865) 555-0148');
  assert.ok(startedSession);
  assert.equal(startedSession.stage, 'started');
  assert.equal(startedSession.callerPhoneMasked, '(***) ***-0148');
  assert.match(startedSession.transcript[0]?.body ?? '', /No real SMS will be sent/);

  const missedCallSession = advancePublicSimulatorSession(startedSession);
  assert.equal(missedCallSession.stage, 'missed_call_received');
  assert.match(missedCallSession.transcript[1]?.body ?? '', /missed a call/);

  const firstMessageSession = advancePublicSimulatorSession(missedCallSession);
  assert.equal(firstMessageSession.stage, 'first_message_shown');
  assert.match(firstMessageSession.transcript[2]?.body ?? '', /What do you need help with today/);
  assert.deepEqual(getPublicSimulatorQuickReplies(firstMessageSession.stage), ['Repair', 'Install', 'Maintenance', 'Emergency']);
  assert.equal(canReplyToPublicSimulator(firstMessageSession.stage), true);
});

test('public simulator captures service and urgency, then prepares the owner alert preview', () => {
  const startedSession = startPublicSimulatorSession('+1 (865) 555-0199');
  assert.ok(startedSession);

  const firstMessageSession = advancePublicSimulatorSession(advancePublicSimulatorSession(startedSession));
  const serviceCapturedSession = applyPublicSimulatorReply(firstMessageSession, 'AC repair, the unit is not cooling');
  assert.equal(serviceCapturedSession.stage, 'service_captured');
  assert.equal(serviceCapturedSession.selectedService, 'Repair');
  assert.match(serviceCapturedSession.issueSummary ?? '', /AC repair, the unit is not cooling/i);
  assert.deepEqual(getPublicSimulatorQuickReplies(serviceCapturedSession.stage), ['Today', 'This week', 'Just getting a quote']);

  const urgencyCapturedSession = applyPublicSimulatorReply(serviceCapturedSession, 'Today');
  assert.equal(urgencyCapturedSession.stage, 'urgency_captured');
  assert.equal(urgencyCapturedSession.selectedUrgency, 'Today');

  const ownerAlertReadySession = advancePublicSimulatorSession(urgencyCapturedSession);
  assert.equal(ownerAlertReadySession.stage, 'owner_alert_ready');

  const completedSession = advancePublicSimulatorSession(ownerAlertReadySession);
  assert.equal(completedSession.stage, 'completed');
  assert.equal(completedSession.completed, true);

  const ownerAlert = buildPublicSimulatorOwnerAlert(completedSession);
  assert.match(ownerAlert.subject, /Northside Home Services: Repair lead ready/);
  assert.match(ownerAlert.body, /Demo only - no real SMS sent/);
  assert.match(ownerAlert.body, /\(\*\*\*\) \*\*\*-0199/);
});

test('public simulator phone masking avoids showing the full caller number', () => {
  assert.equal(maskPublicSimulatorPhone('+18655550148'), '(***) ***-0148');
  assert.equal(maskPublicSimulatorPhone('5550148'), '***-0148');
  assert.equal(maskPublicSimulatorPhone(''), 'Private demo caller');
});
