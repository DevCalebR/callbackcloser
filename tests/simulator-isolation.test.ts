import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('public simulator is gated and isolated from real customer delivery', () => {
  const simulatorPage = read('app/simulator/page.tsx');
  const publicSimulator = read('lib/public-simulator.ts');
  const simulatorActions = read('app/simulator/actions.ts');
  const simulatorLib = read('lib/simulator.ts');
  const ownerNotifications = read('lib/owner-notifications.ts');
  const schema = read('prisma/schema.prisma');

  assert.match(simulatorPage, /PublicSimulatorExperience/);
  assert.doesNotMatch(simulatorPage, /isPublicSimulatorEnabled|getSimulatorBusiness|startSimulatorRunAction|replyToSimulatorRunAction/);
  assert.doesNotMatch(simulatorPage, /SIMULATOR_BUSINESS_ID|ENABLE_PUBLIC_SIMULATOR_REAL_SMS|The public simulator is not configured/);

  assert.match(publicSimulator, /must stay self-contained/i);
  assert.doesNotMatch(publicSimulator, /db\./);
  assert.doesNotMatch(publicSimulator, /from ['"]@\/lib\/simulator['"]/);
  assert.doesNotMatch(publicSimulator, /SimulatorRun/);
  assert.doesNotMatch(publicSimulator, /processLeadInboundReply|startMissedCallRecovery/);

  assert.match(simulatorActions, /isPublicSimulatorEnabled/);
  assert.match(simulatorActions, /getSimulatorBusiness/);
  assert.match(simulatorLib, /SIMULATOR_BUSINESS_ID/);
  assert.match(simulatorLib, /ENABLE_PUBLIC_MISSED_CALL_SIMULATOR/);
  assert.match(simulatorLib, /ENABLE_PUBLIC_SIMULATOR_REAL_SMS/);
  assert.match(simulatorLib, /canSendRealSimulatorSms/);
  assert.match(simulatorActions, /isSimulator:\s*true/);
  assert.match(simulatorActions, /Preview mode active\./);
  assert.match(ownerNotifications, /if \(lead\.isSimulator\)/);
  assert.match(schema, /isSimulator\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /model SimulatorRun/);
});
