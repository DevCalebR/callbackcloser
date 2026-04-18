import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('protected app surfaces use shared tenant-scoped access helpers', () => {
  const auth = read('lib/auth.ts');
  const appHomePage = read('app/app/page.tsx');
  const leadsPage = read('app/app/leads/page.tsx');
  const leadDetailPage = read('app/app/leads/[leadId]/page.tsx');
  const conversationsPage = read('app/app/conversations/page.tsx');
  const leadActions = read('app/app/leads/actions.ts');
  const settingsPage = read('app/app/settings/page.tsx');
  const settingsActions = read('app/app/settings/actions.ts');
  const billingPage = read('app/app/billing/page.tsx');
  const recordingRoute = read('app/api/leads/[leadId]/recording/route.ts');

  assert.match(auth, /getBusinessForOwnerClerkId/);
  assert.match(appHomePage, /requireBusiness/);
  assert.match(appHomePage, /listAllDashboardLeadsForBusiness/);
  assert.match(leadsPage, /listAllDashboardLeadsForBusiness/);
  assert.match(leadsPage, /buildLeadDetailHref/);
  assert.doesNotMatch(leadsPage, /selectedLeadId/);
  assert.match(leadDetailPage, /getLeadDetailForBusiness/);
  assert.match(conversationsPage, /listConversationsForBusiness/);
  assert.match(conversationsPage, /getConversationDetailForBusiness/);
  assert.match(leadActions, /updateLeadStatusForBusiness/);
  assert.match(settingsPage, /getBusinessNotificationSettingsForBusiness/);
  assert.match(settingsActions, /getBusinessForOwnerClerkId/);
  assert.match(billingPage, /getBillingUsageSnapshotForBusiness/);
  assert.match(recordingRoute, /getLeadRecordingForOwnerClerkId/);
});
