import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdminCustomerExitHref,
  buildAdminCustomerOpenHref,
  resolveSafeAdminCustomerAppPath,
} from '../lib/admin-customer-paths.ts';

test('admin customer app paths stay scoped to /app routes', () => {
  assert.equal(resolveSafeAdminCustomerAppPath('/app/settings'), '/app/settings');
  assert.equal(resolveSafeAdminCustomerAppPath('/app/leads?view=attention'), '/app/leads?view=attention');
  assert.equal(resolveSafeAdminCustomerAppPath(''), '/app');
  assert.equal(resolveSafeAdminCustomerAppPath('/admin'), '/app');
  assert.equal(resolveSafeAdminCustomerAppPath('//evil.example.com'), '/app');
});

test('admin customer open and exit href builders stay predictable', () => {
  assert.equal(buildAdminCustomerOpenHref('biz_123'), '/admin/biz_123/open-customer');
  assert.equal(
    buildAdminCustomerOpenHref('biz_123', '/app/settings'),
    '/admin/biz_123/open-customer?path=%2Fapp%2Fsettings'
  );
  assert.equal(
    buildAdminCustomerOpenHref('biz_123', '/app/leads?view=attention'),
    '/admin/biz_123/open-customer?path=%2Fapp%2Fleads%3Fview%3Dattention'
  );
  assert.equal(buildAdminCustomerExitHref('biz_123'), '/admin/exit-customer-mode?businessId=biz_123');
  assert.equal(buildAdminCustomerExitHref(), '/admin/exit-customer-mode');
});
