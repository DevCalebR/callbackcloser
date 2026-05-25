import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('lead status action keeps failures on the detail page and redirects successful outcomes to the inbox', () => {
  const actions = read('app/app/leads/actions.ts');

  assert.match(actions, /const redirectTo = resolveSafeAppRedirect\(formData\.get\('redirectTo'\), fallbackPath\);/);
  assert.match(actions, /const successRedirectTo = resolveSafeAppRedirect\(formData\.get\('successRedirectTo'\), redirectTo\);/);
  assert.match(actions, /redirect\(`\$\{redirectTo\}\$\{redirectTo\.includes\('\?'\) \? '&' : '\?'\}error=Invalid%20status`\);/);
  assert.match(actions, /redirect\(`\$\{redirectTo\}\$\{redirectTo\.includes\('\?'\) \? '&' : '\?'\}error=Lead%20not%20found`\);/);
  assert.match(actions, /revalidatePath\('\/app\/leads'\);/);
  assert.match(actions, /redirect\(`\$\{successRedirectTo\}\$\{successRedirectTo\.includes\('\?'\) \? '&' : '\?'\}saved=1`\);/);
});

test('lead detail outcome buttons post back to the detail page on failure and return to the inbox on success', () => {
  const leadDetailPage = read('app/app/leads/[leadId]/page.tsx');

  assert.match(
    leadDetailPage,
    /const detailRedirectTo =\s+returnPath === '\/app\/leads' \? `\/app\/leads\/\$\{lead\.id\}` : `\/app\/leads\/\$\{lead\.id\}\?from=\$\{encodeURIComponent\(returnPath\)\}`;/
  );
  assert.match(leadDetailPage, /const successRedirectTo = '\/app\/leads';/);
  assert.match(leadDetailPage, /<input type="hidden" name="successRedirectTo" value=\{successRedirectTo\} \/>/);
  assert.match(leadDetailPage, /status="CONTACTED"[\s\S]*redirectTo=\{detailRedirectTo\}[\s\S]*successRedirectTo=\{successRedirectTo\}/);
  assert.match(leadDetailPage, /status="BOOKED"[\s\S]*redirectTo=\{detailRedirectTo\}[\s\S]*successRedirectTo=\{successRedirectTo\}/);
  assert.match(leadDetailPage, /status="LOST"[\s\S]*redirectTo=\{detailRedirectTo\}[\s\S]*successRedirectTo=\{successRedirectTo\}/);
});
