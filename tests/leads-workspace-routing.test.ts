import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('lead inbox stays list-only while lead detail is the main action workspace', () => {
  const appHomePage = read('app/app/page.tsx');
  const homeDashboard = read('components/home-dashboard.tsx');
  const leadsPage = read('app/app/leads/page.tsx');
  const leadDetailPage = read('app/app/leads/[leadId]/page.tsx');
  const conversationsPage = read('app/app/conversations/page.tsx');

  assert.match(appHomePage, /HomeDashboard/);
  assert.match(appHomePage, /label: 'New leads'/);
  assert.match(appHomePage, /label: 'Needs follow-up'/);
  assert.match(appHomePage, /label: 'Booked leads'/);
  assert.match(appHomePage, /label: 'Missed calls today'/);
  assert.match(appHomePage, /return `\/app\/leads\/\$\{leadId\}\?from=%2Fapp`/);
  assert.match(homeDashboard, /Missed-call leads/);
  assert.match(homeDashboard, /Leads needing attention/);
  assert.match(homeDashboard, /Recent leads/);
  assert.match(homeDashboard, /System status/);
  assert.match(homeDashboard, /Test recovery flow/);
  assert.doesNotMatch(homeDashboard, /Run test missed call/);
  assert.doesNotMatch(homeDashboard, /Run demo lead/);
  assert.doesNotMatch(homeDashboard, /Test demo flow/);

  assert.match(leadsPage, /Lead inbox/);
  assert.match(leadsPage, /Scan missed-call leads/i);
  assert.match(leadsPage, /Needs follow-up/);
  assert.match(leadsPage, /Booked/);
  assert.doesNotMatch(leadsPage, /selectedLeadId/);
  assert.doesNotMatch(leadsPage, /Lead detail panel/);
  assert.doesNotMatch(leadsPage, /Quick actions/);
  assert.doesNotMatch(leadsPage, /Open Conversations/);
  assert.doesNotMatch(leadsPage, /LeadConversionSummaryCard|getLeadOutcomeSummary/);

  assert.match(leadDetailPage, /Lead details/);
  assert.match(leadDetailPage, /Call now/);
  assert.match(leadDetailPage, /Mark contacted/);
  assert.match(leadDetailPage, /Mark booked/);
  assert.match(leadDetailPage, /Mark lost/);
  assert.match(leadDetailPage, /Did this lead turn into a real job\?/);
  assert.match(leadDetailPage, /Conversation history/);
  assert.match(leadDetailPage, /Qualification info/);
  assert.match(leadDetailPage, /Missed call details/);
  assert.match(leadDetailPage, /Customer name/);
  assert.match(leadDetailPage, /Preferred callback time/);
  assert.match(leadDetailPage, /Location \/ address/);
  assert.match(leadDetailPage, /No preferred time yet/);
  assert.match(leadDetailPage, /const error = typeof searchParams\?\.error === 'string' \? searchParams\.error : undefined;/);
  assert.match(leadDetailPage, /border-destructive\/30 bg-destructive\/5 p-3 text-sm text-destructive/);
  assert.doesNotMatch(leadDetailPage, /Mark as Closed \(Won\)|Mark as Lost/);

  assert.match(conversationsPage, /Latest conversations/);
  assert.match(conversationsPage, /href=\{`\/app\/leads\/\$\{lead\.id\}\?from=%2Fapp%2Fconversations`\}/);
  assert.doesNotMatch(conversationsPage, /selectedLeadId|getConversationDetailForBusiness|Conversation detail|Open lead details/);
});
