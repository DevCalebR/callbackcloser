import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('lead inbox stays list-only while lead detail is the main action workspace', () => {
  const appHomePage = read('app/app/page.tsx');
  const leadsPage = read('app/app/leads/page.tsx');
  const leadDetailPage = read('app/app/leads/[leadId]/page.tsx');
  const conversationsPage = read('app/app/conversations/page.tsx');

  assert.match(appHomePage, /Who needs follow-up right now\?/);
  assert.match(appHomePage, /Leads needing attention first/);
  assert.match(appHomePage, /Recent leads/);
  assert.match(appHomePage, /Missed calls today/);
  assert.match(appHomePage, /return `\/app\/leads\/\$\{leadId\}\?from=%2Fapp`/);

  assert.match(leadsPage, /Lead inbox/);
  assert.match(leadsPage, /This page is only for scanning/i);
  assert.match(leadsPage, /Needs follow-up/);
  assert.doesNotMatch(leadsPage, /selectedLeadId/);
  assert.doesNotMatch(leadsPage, /Lead detail panel/);
  assert.doesNotMatch(leadsPage, /Quick actions/);
  assert.doesNotMatch(leadsPage, /Open Conversations/);

  assert.match(leadDetailPage, /Lead details/);
  assert.match(leadDetailPage, /Call now/);
  assert.match(leadDetailPage, /Mark contacted/);
  assert.match(leadDetailPage, /Mark booked/);
  assert.match(leadDetailPage, /Mark lost/);
  assert.match(leadDetailPage, /Conversation history/);
  assert.match(leadDetailPage, /Qualification info/);
  assert.match(leadDetailPage, /Missed call details/);

  assert.match(conversationsPage, /href=\{`\/app\/leads\/\$\{selectedLead\.id\}\?from=%2Fapp%2Fconversations`\}/);
  assert.match(conversationsPage, /Open lead details/);
});
