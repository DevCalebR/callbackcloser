import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPublicSimulatorReply,
  buildPublicSimulatorLeadSummary,
  buildPublicSimulatorOwnerAlert,
  canReplyToPublicSimulator,
  createPublicSimulatorSession,
  getPublicSimulatorReplyOptions,
} from '../lib/public-simulator.ts';

test('public simulator starts with the missed-call recovery prompt and stays self-contained', () => {
  const session = createPublicSimulatorSession('+1 (865) 555-0148');

  assert.equal(session.stage, 'waiting_for_service');
  assert.equal(session.messages[0]?.role, 'event');
  assert.match(session.messages[0]?.body ?? '', /Missed call from \(\*\*\*\) \*\*\*-0148/i);
  assert.match(session.messages[1]?.body ?? '', /What can we help you with today/i);
  assert.equal(session.qualified, false);
  assert.equal(canReplyToPublicSimulator(session.stage), true);
});

test('service reply advances to urgency prompt', () => {
  const session = applyPublicSimulatorReply(createPublicSimulatorSession(), 'repair');

  assert.equal(session.stage, 'waiting_for_urgency');
  assert.equal(session.lead.serviceNeed, 'Repair');
  assert.match(session.messages.at(-1)?.body ?? '', /how soon do you need help/i);
});

test('urgency reply advances to name and location prompt and does not stop after urgency', () => {
  let session = createPublicSimulatorSession();
  session = applyPublicSimulatorReply(session, 'repair');
  session = applyPublicSimulatorReply(session, '2');

  assert.equal(session.stage, 'waiting_for_contact_location');
  assert.equal(session.lead.urgency, 'Today');
  assert.match(session.messages.at(-1)?.body ?? '', /what name should we put on the request/i);
  assert.equal(canReplyToPublicSimulator(session.stage), true);
});

test('name and location reply advances to callback time prompt', () => {
  let session = createPublicSimulatorSession();
  session = applyPublicSimulatorReply(session, 'repair');
  session = applyPublicSimulatorReply(session, '2');
  session = applyPublicSimulatorReply(session, 'Sarah Miller - 123 Main St, Oak Ridge');

  assert.equal(session.stage, 'waiting_for_callback_time');
  assert.equal(session.lead.customerName, 'Sarah Miller');
  assert.equal(session.lead.location, '123 Main St, Oak Ridge');
  assert.match(session.messages.at(-1)?.body ?? '', /best time for someone to call you back/i);
});

test('callback reply completes the flow, shows confirmation, summary, and owner alert preview', () => {
  let session = createPublicSimulatorSession();
  session = applyPublicSimulatorReply(session, 'repair');
  session = applyPublicSimulatorReply(session, '2');
  session = applyPublicSimulatorReply(session, 'Sarah Miller - 123 Main St, Oak Ridge');
  session = applyPublicSimulatorReply(session, '1');

  const summary = buildPublicSimulatorLeadSummary(session);
  const ownerAlert = buildPublicSimulatorOwnerAlert(session);

  assert.equal(session.stage, 'qualified');
  assert.equal(session.qualified, true);
  assert.match(session.messages.at(-1)?.body ?? '', /Thanks, Sarah Miller/i);
  assert.equal(summary.status, 'Ready for callback');
  assert.equal(summary.callbackTime, 'ASAP');
  assert.equal(summary.priority, 'Hot lead');
  assert.match(ownerAlert, /🔥 Hot missed-call lead/);
  assert.match(ownerAlert, /Name: Sarah Miller/);
  assert.match(ownerAlert, /View lead: \/app\/leads\/demo-missed-call-lead/);
});

test('free-text replies work for service and callback time', () => {
  let session = createPublicSimulatorSession();
  session = applyPublicSimulatorReply(session, 'Need someone to look at a leaking water heater');
  session = applyPublicSimulatorReply(session, 'This week');
  session = applyPublicSimulatorReply(session, 'Caleb, 37769');
  session = applyPublicSimulatorReply(session, 'after 5pm');

  const summary = buildPublicSimulatorLeadSummary(session);

  assert.equal(summary.service, 'Need someone to look at a leaking water heater');
  assert.equal(summary.urgency, 'This week');
  assert.equal(summary.name, 'Caleb');
  assert.equal(summary.location, '37769');
  assert.equal(summary.callbackTime, 'after 5pm');
});

test('quick reply options appear for urgency and callback steps', () => {
  let session = createPublicSimulatorSession();
  session = applyPublicSimulatorReply(session, 'repair');
  assert.deepEqual(
    getPublicSimulatorReplyOptions(session.stage).map((option) => option.value),
    ['Emergency', 'Today', 'This week', 'Just getting a quote']
  );

  session = applyPublicSimulatorReply(session, '2');
  session = applyPublicSimulatorReply(session, 'Jordan, Knoxville');
  assert.deepEqual(
    getPublicSimulatorReplyOptions(session.stage).map((option) => option.value),
    ['ASAP', 'Morning', 'Afternoon', 'Evening']
  );
});

test('restart produces a fresh session after completion', () => {
  let session = createPublicSimulatorSession('+1 (865) 555-0199');
  session = applyPublicSimulatorReply(session, 'repair');
  session = applyPublicSimulatorReply(session, '2');
  session = applyPublicSimulatorReply(session, 'Jordan, Knoxville');
  session = applyPublicSimulatorReply(session, '1');

  const restarted = createPublicSimulatorSession('+1 (865) 555-0101');

  assert.equal(restarted.stage, 'waiting_for_service');
  assert.equal(restarted.qualified, false);
  assert.equal(restarted.messages.length, 2);
  assert.match(restarted.messages[0]?.body ?? '', /0101/);
});
