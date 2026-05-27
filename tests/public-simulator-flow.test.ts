import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPublicSimulatorReply,
  buildPublicSimulatorLeadSummary,
  buildPublicSimulatorOwnerAlert,
  canReplyToPublicSimulator,
  createPublicSimulatorSession,
  getPublicSimulatorReplyOptions,
} from '@/lib/public-simulator';

test('public simulator masks the caller number and opens on the service prompt', () => {
  const session = createPublicSimulatorSession('+1 (865) 555-0148');

  assert.equal(session.stage, 'waiting_for_service');
  assert.equal(session.lead.customerPhone, '(***) ***-0148');
  assert.match(session.messages[0]?.body ?? '', /Missed call from \(\*\*\*\) \*\*\*-0148/);
  assert.match(session.messages[1]?.body ?? '', /What can we help you with today/i);
  assert.equal(canReplyToPublicSimulator(session.stage), true);
});

test('public simulator keeps moving through urgency, name plus location, and callback time', () => {
  let session = createPublicSimulatorSession('+1 (865) 555-0199');
  session = applyPublicSimulatorReply(session, 'AC repair, the unit is not cooling');

  assert.equal(session.stage, 'waiting_for_urgency');
  assert.deepEqual(
    getPublicSimulatorReplyOptions(session.stage).map((option) => option.value),
    ['Emergency', 'Today', 'This week', 'Just getting a quote'],
  );

  session = applyPublicSimulatorReply(session, 'Today');
  assert.equal(session.stage, 'waiting_for_contact_location');
  assert.match(session.messages.at(-1)?.body ?? '', /what name should we put on the request/i);

  session = applyPublicSimulatorReply(session, 'Jamie Carter, Knoxville');
  assert.equal(session.stage, 'waiting_for_callback_time');
  assert.equal(session.lead.customerName, 'Jamie Carter');
  assert.equal(session.lead.location, 'Knoxville');

  session = applyPublicSimulatorReply(session, 'Afternoon');
  assert.equal(session.stage, 'qualified');
  assert.equal(session.qualified, true);

  const summary = buildPublicSimulatorLeadSummary(session);
  const ownerAlert = buildPublicSimulatorOwnerAlert(session);

  assert.equal(summary.phone, '(***) ***-0199');
  assert.equal(summary.service, 'Repair');
  assert.equal(summary.urgency, 'Today');
  assert.equal(summary.location, 'Knoxville');
  assert.equal(summary.callbackTime, 'Afternoon');
  assert.equal(summary.status, 'Ready for callback');
  assert.match(ownerAlert, /🔥 Hot missed-call lead/);
  assert.match(ownerAlert, /Name: Jamie Carter/);
  assert.match(ownerAlert, /Callback: Afternoon/);
  assert.match(ownerAlert, /\(\*\*\*\) \*\*\*-0199/);
});
