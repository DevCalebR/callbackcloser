import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('public simulator is isolated from real customer delivery and runs entirely in demo logic', () => {
  const simulatorPage = read('app/simulator/page.tsx');
  const simulatorExperience = read('components/demo/public-simulator-experience.tsx');
  const publicSimulatorLib = read('lib/public-simulator.ts');
  const ownerNotifications = read('lib/owner-notifications.ts');
  const schema = read('prisma/schema.prisma');

  assert.match(simulatorExperience, /Interactive preview mode/);
  assert.match(publicSimulatorLib, /publicSimulatorStages/);
  assert.match(publicSimulatorLib, /No real SMS will be sent\./);
  assert.match(publicSimulatorLib, /maskPublicSimulatorPhone/);
  assert.doesNotMatch(simulatorPage, /getSimulatorRun|startSimulatorRunAction|replyToSimulatorRunAction|db\./);
  assert.doesNotMatch(simulatorExperience, /db\.|twilio|startMissedCallRecovery|processLeadInboundReply/);
  assert.equal(existsSync(path.join(process.cwd(), 'app/simulator/actions.ts')), false);
  assert.match(ownerNotifications, /if \(lead\.isSimulator\)/);
  assert.match(schema, /isSimulator\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /model SimulatorRun/);
});
