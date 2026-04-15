import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('lead inbox stays list-only while lead detail is the main action workspace', () => {
  const leadsPage = read('app/app/leads/page.tsx');
  const leadDetailPage = read('app/app/leads/[leadId]/page.tsx');
  const conversationsPage = read('app/app/conversations/page.tsx');

  assert.match(leadsPage, /Lead inbox/);
  assert.match(leadsPage, /Click a lead to open the full action screen/i);
  assert.match(leadsPage, /buildLeadDetailHref/);
  assert.doesNotMatch(leadsPage, /selectedLeadId/);
  assert.doesNotMatch(leadsPage, /Lead detail panel/);
  assert.doesNotMatch(leadsPage, /Quick actions/);

  assert.match(leadDetailPage, /Lead workspace/);
  assert.match(leadDetailPage, /Call Now/);
  assert.match(leadDetailPage, /Mark Contacted/);
  assert.match(leadDetailPage, /Mark Booked/);
  assert.match(leadDetailPage, /Mark Lost/);
  assert.match(leadDetailPage, /Conversation history/);
  assert.match(leadDetailPage, /Missed call details/);

  assert.match(conversationsPage, /href=\{`\/app\/leads\/\$\{selectedLead\.id\}\?from=%2Fapp%2Fconversations`\}/);
});
