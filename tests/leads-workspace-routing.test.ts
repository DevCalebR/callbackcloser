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
  assert.match(appHomePage, /buildRecoveryMetrics/);
  assert.match(appHomePage, /return `\/app\/leads\/\$\{leadId\}\?from=%2Fapp`/);
  assert.match(homeDashboard, /Missed-call leads that need action/);
  assert.match(homeDashboard, /Leads needing attention first/);
  assert.match(homeDashboard, /Today&apos;s recovery queue/);

  assert.match(leadsPage, /Lead inbox/);
  assert.match(leadsPage, /LeadConversionSummaryCard/);
  assert.match(leadsPage, /getLeadOutcomeSummary/);
  assert.match(leadsPage, /This page is only for scanning/i);
  assert.match(leadsPage, /Needs follow-up/);
  assert.match(leadsPage, /Closed/);
  assert.doesNotMatch(leadsPage, /selectedLeadId/);
  assert.doesNotMatch(leadsPage, /Lead detail panel/);
  assert.doesNotMatch(leadsPage, /Quick actions/);
  assert.doesNotMatch(leadsPage, /Open Conversations/);

  assert.match(leadDetailPage, /Lead details/);
  assert.match(leadDetailPage, /Call now/);
  assert.match(leadDetailPage, /Mark contacted/);
  assert.match(leadDetailPage, /Mark as Closed \(Won\)/);
  assert.match(leadDetailPage, /Mark as Lost/);
  assert.match(leadDetailPage, /Did this lead turn into a real job\?/);
  assert.match(leadDetailPage, /Conversation history/);
  assert.match(leadDetailPage, /Qualification info/);
  assert.match(leadDetailPage, /Missed call details/);
  assert.match(leadDetailPage, /const error = typeof searchParams\?\.error === 'string' \? searchParams\.error : undefined;/);
  assert.match(leadDetailPage, /border-destructive\/30 bg-destructive\/5 p-3 text-sm text-destructive/);

  assert.match(conversationsPage, /href=\{`\/app\/leads\/\$\{selectedLead\.id\}\?from=%2Fapp%2Fconversations`\}/);
  assert.match(conversationsPage, /Open lead details/);
});
