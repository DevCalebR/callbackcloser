import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('founder bulk delete action keeps redirect outside the try/catch and returns plain admin UI states', () => {
  const actions = read('app/admin/actions.ts');
  const adminPage = read('app/admin/page.tsx');
  const deleteActionStart = actions.indexOf('export async function deleteTestBusinessAction');
  const deleteActionEnd = actions.indexOf('export async function deleteBusinessPermanentlyAction');
  const deleteActionSection = actions.slice(deleteActionStart, deleteActionEnd);
  const permanentDeleteActionStart = actions.indexOf('export async function deleteBusinessPermanentlyAction');
  const permanentDeleteActionEnd = actions.indexOf('export async function founderDeleteAllBusinessesAction');
  const permanentDeleteActionSection = actions.slice(permanentDeleteActionStart, permanentDeleteActionEnd);

  const actionStart = actions.indexOf('export async function founderDeleteAllBusinessesAction');
  const nextActionStart = actions.indexOf('export async function bulkDeleteTestBusinessesAction');
  const actionSection = actions.slice(actionStart, nextActionStart);
  const catchStart = actionSection.indexOf('} catch (error) {');
  const finalRedirectStart = actionSection.lastIndexOf('\n\n  redirect(redirectPath);');
  const catchSection = actionSection.slice(catchStart, finalRedirectStart);

  assert.match(actions, /export async function founderDeleteAllBusinessesAction/);
  assert.match(actions, /const founder = await requireFounderAdmin\(\)/);
  assert.match(actions, /let redirectPath = '\/admin'/);
  assert.match(actions, /redirectPath = `\/admin\?error=\$\{encodeURIComponent\(message\)\}`/);
  assert.match(actions, /redirect\(redirectPath\);/);
  assert.notEqual(catchStart, -1);
  assert.notEqual(finalRedirectStart, -1);
  assert.doesNotMatch(catchSection, /redirect\(/);

  assert.match(actions, /export async function deleteTestBusinessAction/);
  assert.match(deleteActionSection, /const admin = await requireAdmin\(\)/);
  assert.match(deleteActionSection, /parsed\.data\.confirmationName !== business\.name/);
  assert.match(deleteActionSection, /Type the exact business name to delete it\./);
  assert.doesNotMatch(deleteActionSection, /catch \(error\)/);
  assert.match(deleteActionSection, /deletedBusinessName: business\.name/);

  const permanentCatchStart = permanentDeleteActionSection.indexOf('} catch (error) {');
  const permanentFinalRedirectStart = permanentDeleteActionSection.lastIndexOf('\n\n  redirect(redirectPath);');
  const permanentCatchSection = permanentDeleteActionSection.slice(permanentCatchStart, permanentFinalRedirectStart);
  assert.match(actions, /export async function deleteBusinessPermanentlyAction/);
  assert.match(permanentDeleteActionSection, /const founder = await requireFounderAdmin\(\)/);
  assert.match(permanentDeleteActionSection, /validatePermanentDeleteConfirmation/);
  assert.match(permanentDeleteActionSection, /recordBusinessOperatorEvent/);
  assert.match(permanentDeleteActionSection, /deleteBusinessPermanently/);
  assert.match(permanentDeleteActionSection, /deletedExternalReview: 1/);
  assert.notEqual(permanentCatchStart, -1);
  assert.notEqual(permanentFinalRedirectStart, -1);
  assert.doesNotMatch(permanentCatchSection, /redirect\(/);

  assert.match(adminPage, /admin\.isFounder \?/);
  assert.match(adminPage, /Delete one business permanently/);
  assert.match(adminPage, /review its owner and status, then complete the required confirmations/);
  assert.match(adminPage, /Founder-only cleanup\. Archive remains the normal lifecycle control\./);
  assert.match(adminPage, /Advanced founder reset: delete all current businesses/);
  assert.match(adminPage, /founderResetResult === 'deleted'/);
  assert.match(adminPage, /Deleted \{founderResetDeleted\} current/);
  assert.match(adminPage, /founderResetResult === 'noop'/);
  assert.match(adminPage, /No businesses were available for founder reset/);
  assert.match(adminPage, /deletedBusinessName \? `Deleted \$\{deletedBusinessName\} permanently\.`/);
  assert.match(adminPage, /deletedExternalReview \? \(/);
});
