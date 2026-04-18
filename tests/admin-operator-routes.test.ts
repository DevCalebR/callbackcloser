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

  assert.match(adminHome, /Operator triage board/);
  assert.match(adminHome, /Open support workspace/);
  assert.match(adminDetail, /What should I do next\?/);
  assert.match(adminDetail, /Archive \/ delete controls/);
  assert.match(adminDetail, /Send test SMS/);
  assert.match(supportWorkspace, /support workspace/);
  assert.match(supportWorkspace, /Read-only snapshot/);
});
