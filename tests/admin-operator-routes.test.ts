import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('admin routes expose support workspace and safe lifecycle controls', () => {
  const adminHome = read('app/admin/page.tsx');
  const adminDetail = read('app/admin/[businessId]/page.tsx');
  const supportWorkspace = read('app/admin/[businessId]/workspace/page.tsx');
  const adminActions = read('app/admin/actions.ts');

  assert.match(adminHome, /Operator control panel/);
  assert.match(adminHome, /Fast onboard/);
  assert.match(adminHome, /Reset test data/);
  assert.match(adminHome, /Delete all test\/demo businesses/);
  assert.match(adminHome, /BULK_TEST_DATA_RESET_CONFIRMATION/);
  assert.match(adminHome, /Business triage board/);
  assert.match(adminHome, /Open customer leads/);
  assert.match(adminActions, /export async function bulkDeleteTestBusinessesAction/);
  assert.match(adminActions, /const admin = await requireAdmin\(\)/);
  assert.match(adminDetail, /Onboarding confidence/);
  assert.match(adminDetail, /Business info/);
  assert.match(adminDetail, /Provisioning health/);
  assert.match(adminDetail, /Messaging \/ A2P readiness/);
  assert.match(adminDetail, /Automation settings/);
  assert.match(adminDetail, /Account \/ commercial state/);
  assert.match(adminDetail, /Recent activity/);
  assert.match(adminDetail, /Advanced \/ rare actions/);
  assert.match(adminDetail, /Send test SMS/);
  assert.match(supportWorkspace, /support mode workspace/);
  assert.match(supportWorkspace, /Customer settings snapshot/);
  assert.match(supportWorkspace, /Customer call flow snapshot/);
});
