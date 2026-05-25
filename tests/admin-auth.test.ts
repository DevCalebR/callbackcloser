import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { isFounderUserId } from '../lib/admin.ts';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('isFounderUserId only authorizes the configured founder account', () => {
  const env = {
    FOUNDER_CLERK_USER_ID: 'user_founder',
  };

  assert.equal(isFounderUserId('user_founder', env), true);
  assert.equal(isFounderUserId('user_customer', env), false);
  assert.equal(isFounderUserId(null, env), false);
});

test('admin pages and customer-mode routes require real admin authorization', () => {
  const adminPage = read('app/admin/page.tsx');
  const adminBusinessPage = read('app/admin/[businessId]/page.tsx');
  const adminActions = read('app/admin/actions.ts');
  const openCustomerRoute = read('app/admin/[businessId]/open-customer/route.ts');
  const exitCustomerModeRoute = read('app/admin/exit-customer-mode/route.ts');
  const appLayout = read('app/app/layout.tsx');
  const adminContext = read('lib/admin-customer-context.ts');

  assert.match(adminPage, /const admin = await requireAdmin\(\)/);
  assert.match(adminBusinessPage, /await requireAdmin\(\)/);
  assert.match(adminActions, /const admin = await requireAdmin\(\)/);
  assert.match(openCustomerRoute, /const adminSession = await getAdminSession\(\)/);
  assert.match(openCustomerRoute, /if \(!adminSession\.isAdmin\)/);
  assert.match(exitCustomerModeRoute, /const adminSession = await getAdminSession\(\)/);
  assert.match(exitCustomerModeRoute, /if \(!adminSession\.isAdmin\)/);
  assert.match(appLayout, /const adminCustomerContext = await getAdminCustomerActingContext\(\)/);
  assert.match(adminContext, /if \(!adminSession\?\.isAdmin\)/);
});
