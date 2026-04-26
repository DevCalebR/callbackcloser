import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('admin step actions keep operators on the current business step with visible feedback', () => {
  const adminActions = read('app/admin/actions.ts');
  const adminDetailPage = read('app/admin/[businessId]/page.tsx');

  assert.match(adminActions, /return step \? `\$\{path\}#step-\$\{step\}` : path;/);
  assert.match(adminActions, /function redirectToBusinessActionError\(formData: FormData, message: string, returnStep = getReturnStep\(formData\)\): never/);
  assert.match(adminActions, /redirectToBusinessActionError\(formData, parsed\.error\.issues\[0\]\?\.message \|\| 'Invalid owner invite request\.', returnStep\);/);
  assert.match(adminActions, /redirectToBusinessActionError\(formData, parsed\.error\.issues\[0\]\?\.message \|\| 'Invalid owner connection request\.', returnStep\);/);
  assert.match(adminActions, /event: 'admin_business_owner_invited'/);
  assert.match(adminActions, /event: 'admin_business_owner_connected'/);

  assert.match(adminDetailPage, /const stepFeedbackNotice = error/);
  assert.match(adminDetailPage, /Owner invitation sent to \$\{ownerEmail\}\./);
  assert.match(adminDetailPage, /Customer access should now reflect the linked account\./);
  assert.match(adminDetailPage, /stepFeedbackNotice\.variant === 'destructive'/);
});
