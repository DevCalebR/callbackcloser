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
  const businessPicker = read('components/admin-business-picker.tsx');
  const appLayout = read('app/app/layout.tsx');

  assert.match(adminHome, /Operator control panel/);
  assert.match(adminHome, /Fast onboard/);
  assert.match(adminHome, /Create business workspace/);
  assert.match(adminHome, /Reset test data/);
  assert.match(adminHome, /Delete all test\/demo businesses/);
  assert.match(adminHome, /BULK_TEST_DATA_RESET_CONFIRMATION/);
  assert.match(adminHome, /Business triage board/);
  assert.match(adminHome, /Open customer workspace/);
  assert.match(adminHome, /Delete demo\/test business permanently/);
  assert.match(adminHome, /Type business name to permanently delete/);
  assert.match(adminHome, /Open customer leads/);
  assert.match(adminActions, /export async function bulkDeleteTestBusinessesAction/);
  assert.match(adminActions, /export async function saveAdminTwilioSetupAction/);
  assert.match(adminActions, /const admin = await requireAdmin\(\)/);
  assert.match(adminHome, /View support workspace snapshot/);
  assert.match(businessPicker, /Jump to business/);
  assert.match(businessPicker, /Clear selection/);
  assert.match(adminDetail, /Twilio setup control panel/);
  assert.match(adminDetail, /main Twilio account or business subaccount/i);
  assert.match(adminDetail, /CallbackCloser Twilio launch flow/);
  assert.match(adminDetail, /Mark live/);
  assert.match(adminDetail, /Advanced/);
  assert.match(adminDetail, /Invite owner by email/);
  assert.match(adminDetail, /Connect existing owner/);
  assert.match(adminDetail, /Send test SMS/);
  assert.match(adminDetail, /Open customer settings/);
  assert.match(adminDetail, /Open customer call flow/);
  assert.match(adminDetail, /View support workspace snapshot/);
  assert.doesNotMatch(adminDetail, /Connect or invite owner/);
  assert.match(supportWorkspace, /support mode workspace/);
  assert.match(supportWorkspace, /Open customer workspace/);
  assert.match(supportWorkspace, /View leads snapshot/);
  assert.match(supportWorkspace, /View settings snapshot/);
  assert.match(supportWorkspace, /View call flow snapshot/);
  assert.match(supportWorkspace, /Customer settings snapshot/);
  assert.match(supportWorkspace, /Customer call flow snapshot/);
  assert.match(appLayout, /Admin customer mode/);
  assert.match(appLayout, /Exit customer mode/);
});
