import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('bulk delete action keeps redirect outside the try/catch and returns plain admin UI states', () => {
  const actions = read('app/admin/actions.ts');
  const adminPage = read('app/admin/page.tsx');

  const actionSection = actions.slice(actions.indexOf('export async function bulkDeleteTestBusinessesAction'));
  const catchStart = actionSection.indexOf('} catch (error) {');
  const finalRedirectStart = actionSection.lastIndexOf('\n\n  redirect(redirectPath);');
  const catchSection = actionSection.slice(catchStart, finalRedirectStart);

  assert.match(actions, /export async function bulkDeleteTestBusinessesAction/);
  assert.match(actions, /let redirectPath = '\/admin'/);
  assert.match(actions, /redirectPath = `\/admin\?error=\$\{encodeURIComponent\(message\)\}`/);
  assert.match(actions, /redirect\(redirectPath\);/);
  assert.notEqual(catchStart, -1);
  assert.notEqual(finalRedirectStart, -1);
  assert.doesNotMatch(catchSection, /redirect\(/);

  assert.match(adminPage, /resetResult === 'deleted'/);
  assert.match(adminPage, /Deleted \{resetDeleted\} test\/demo/);
  assert.match(adminPage, /resetResult === 'noop'/);
  assert.match(adminPage, /No test\/demo businesses were eligible for deletion/);
});
