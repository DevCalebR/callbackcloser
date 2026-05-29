import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { BusinessProvisioningStatus } from '@prisma/client';

import {
  customerSetupStatusLabels,
  getCustomerSetupStatusDetail,
  getCustomerWorkspaceNotice,
  shouldShowCustomerSetupWaitingPage,
} from '../lib/customer-setup.ts';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('managed setup status helpers keep pending, live, and attention states distinct', () => {
  assert.equal(shouldShowCustomerSetupWaitingPage(BusinessProvisioningStatus.DRAFT), true);
  assert.equal(shouldShowCustomerSetupWaitingPage(BusinessProvisioningStatus.ONBOARDING), true);
  assert.equal(shouldShowCustomerSetupWaitingPage(BusinessProvisioningStatus.LIVE), false);
  assert.equal(customerSetupStatusLabels[BusinessProvisioningStatus.DRAFT], 'Pending setup');
  assert.equal(customerSetupStatusLabels[BusinessProvisioningStatus.ONBOARDING], 'Setup in progress');
  assert.match(getCustomerSetupStatusDetail(BusinessProvisioningStatus.DRAFT), /preparing the first setup steps/i);
  assert.match(getCustomerSetupStatusDetail(BusinessProvisioningStatus.ONBOARDING), /running the launch checks/i);
  assert.match(getCustomerWorkspaceNotice(BusinessProvisioningStatus.NEEDS_ATTENTION)?.title || '', /Support follow-up/i);
  assert.match(getCustomerWorkspaceNotice(BusinessProvisioningStatus.PAUSED)?.detail || '', /paused/i);
  assert.equal(getCustomerWorkspaceNotice(BusinessProvisioningStatus.LIVE), null);
});

test('managed setup handoff is wired through customer and admin surfaces', () => {
  const setupHandoff = read('lib/customer-setup-handoff.ts');
  const auth = read('lib/auth.ts');
  const appLayout = read('app/app/layout.tsx');
  const adminHome = read('app/admin/page.tsx');
  const adminDetail = read('app/admin/[businessId]/page.tsx');
  const adminActions = read('app/admin/actions.ts');

  assert.match(setupHandoff, /type: 'onboarding\.customer_signup_pending_setup'/);
  assert.match(setupHandoff, /summary: 'New customer signup is waiting for founder setup'/);
  assert.match(setupHandoff, /subject: 'New CallbackCloser signup needs setup'/);
  assert.match(setupHandoff, /subject: 'Your CallbackCloser account is ready'/);
  assert.match(auth, /getOrCreateOwnedBusinessForClerkUser/);
  assert.match(appLayout, /CustomerSetupWaitingPage/);
  assert.match(appLayout, /getCustomerWorkspaceNotice/);
  assert.match(adminHome, /Pending setup/);
  assert.match(adminHome, /In setup/);
  assert.match(adminHome, /New public pilot signups land here waiting for founder setup/i);
  assert.match(adminDetail, /This business is waiting for founder setup/);
  assert.match(adminActions, /await sendCustomerReadyNotification\(business\.id\)/);
});

test('pricing page stays focused on the 14-day pilot instead of vague plan tiers', () => {
  const pricing = read('app/pricing/page.tsx');

  assert.match(pricing, /Start with a 14-day pilot/i);
  assert.match(pricing, /Early pilot pricing starts at \$50/i);
  assert.match(pricing, /White-glove setup included/i);
  assert.match(pricing, /Try the missed-call simulator/i);
  assert.doesNotMatch(pricing, /Starter/);
  assert.doesNotMatch(pricing, /Growth/);
  assert.doesNotMatch(pricing, /Agency \/ Multi-location/);
  assert.doesNotMatch(pricing, /Founder-run customer pilot setup is separate/i);
  assert.doesNotMatch(pricing, /self-serve phone system/i);
});
