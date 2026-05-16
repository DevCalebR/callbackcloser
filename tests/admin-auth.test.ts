import assert from 'node:assert/strict';
import test from 'node:test';

import { isFounderUserId } from '../lib/admin.ts';

test('isFounderUserId only authorizes the configured founder account', () => {
  const env = {
    FOUNDER_CLERK_USER_ID: 'user_founder',
  };

  assert.equal(isFounderUserId('user_founder', env), true);
  assert.equal(isFounderUserId('user_customer', env), false);
  assert.equal(isFounderUserId(null, env), false);
});
