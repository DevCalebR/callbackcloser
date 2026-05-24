import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function getActionSection(source: string, actionName: string, nextActionName: string) {
  const actionStart = source.indexOf(`export async function ${actionName}`);
  const nextActionStart = source.indexOf(`export async function ${nextActionName}`);
  return source.slice(actionStart, nextActionStart);
}

test('customer test SMS action keeps redirect outside the catchable try/catch and shows friendly errors', () => {
  const settingsActions = read('app/app/settings/actions.ts');
  const actionSection = getActionSection(settingsActions, 'sendBusinessTwilioTestSmsAction', 'buyTwilioNumberAction');
  const redirectPathStart = actionSection.indexOf("let redirectPath = '/app/settings?twilioTestSms=1';");
  const tryStart = actionSection.indexOf('\n  try {', redirectPathStart);
  const catchStart = actionSection.lastIndexOf('} catch (error) {');
  const finalRedirectStart = actionSection.lastIndexOf('\n\n  revalidatePath(\'/app/settings\');\n  redirect(redirectPath);');
  const catchSection = actionSection.slice(catchStart, finalRedirectStart);
  const trySection = actionSection.slice(tryStart, catchStart);

  assert.notEqual(redirectPathStart, -1);
  assert.notEqual(tryStart, -1);
  assert.notEqual(catchStart, -1);
  assert.notEqual(finalRedirectStart, -1);
  assert.match(actionSection, /let redirectPath = '\/app\/settings\?twilioTestSms=1'/);
  assert.match(actionSection, /getTestSmsSuppressionMessage\(result\.reason\)/);
  assert.match(actionSection, /Test SMS failed:/);
  assert.doesNotMatch(catchSection, /redirect\(/);
  assert.doesNotMatch(trySection, /redirect\(/);
});

test('admin test SMS action keeps redirect outside the catchable try/catch and shows friendly errors', () => {
  const adminActions = read('app/admin/actions.ts');
  const actionSection = getActionSection(adminActions, 'sendBusinessTestSmsAction', 'archiveBusinessAction');
  const redirectPathStart = actionSection.indexOf('let redirectPath = buildAdminBusinessRedirectPath');
  const tryStart = actionSection.indexOf('\n  try {', redirectPathStart);
  const catchStart = actionSection.lastIndexOf('} catch (error) {');
  const finalRedirectStart = actionSection.lastIndexOf('\n\n  await revalidateAdminPaths(business.id);\n  redirect(redirectPath);');
  const catchSection = actionSection.slice(catchStart, finalRedirectStart);
  const trySection = actionSection.slice(tryStart, catchStart);

  assert.notEqual(redirectPathStart, -1);
  assert.notEqual(tryStart, -1);
  assert.notEqual(catchStart, -1);
  assert.notEqual(finalRedirectStart, -1);
  assert.match(actionSection, /let redirectPath = buildAdminBusinessRedirectPath\(business\.id, withReturnStepParam\(\{ testSms: 1 \}, returnStep\)\)/);
  assert.match(actionSection, /getTestSmsSuppressionMessage\(result\.reason\)/);
  assert.match(actionSection, /Test SMS failed:/);
  assert.doesNotMatch(catchSection, /redirect\(/);
  assert.doesNotMatch(trySection, /redirect\(/);
});
