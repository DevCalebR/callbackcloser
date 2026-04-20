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
  const businessPicker = read('components/admin-business-picker.tsx');

  assert.match(adminHome, /Operator control panel/);
  assert.match(adminHome, /Fast onboard/);
  assert.match(adminHome, /Create workspace and start provisioning/);
  assert.match(adminHome, /Business triage board/);
  assert.match(adminHome, /Delete demo\/test business permanently/);
  assert.match(adminHome, /Type business name to permanently delete/);
  assert.match(adminHome, /Open customer leads/);
  assert.match(businessPicker, /Jump to business/);
  assert.match(businessPicker, /Clear selection/);
  assert.match(adminDetail, /Onboarding confidence/);
  assert.match(adminDetail, /Business info/);
  assert.match(adminDetail, /Provisioning health/);
  assert.match(adminDetail, /Messaging \/ A2P readiness/);
  assert.match(adminDetail, /Automation settings/);
  assert.match(adminDetail, /Account \/ commercial state/);
  assert.match(adminDetail, /Recent activity/);
  assert.match(adminDetail, /Advanced \/ rare actions/);
  assert.match(adminDetail, /Invite owner by email/);
  assert.match(adminDetail, /Connect existing owner/);
  assert.match(adminDetail, /Send test SMS/);
  assert.doesNotMatch(adminDetail, /Connect or invite owner/);
  assert.match(supportWorkspace, /support mode workspace/);
  assert.match(supportWorkspace, /Customer settings snapshot/);
  assert.match(supportWorkspace, /Customer call flow snapshot/);
});
