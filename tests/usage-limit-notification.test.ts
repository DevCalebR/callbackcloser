import assert from 'node:assert/strict';
import test from 'node:test';

import { claimUsageLimitNotification } from '../lib/usage-limit-notification.ts';

test('claimUsageLimitNotification returns true only for first claim', async () => {
  let claimed = false;
  const fakeClient = {
    lead: {
      async updateMany() {
        if (claimed) return { count: 0 };
        claimed = true;
        return { count: 1 };
      },
    },
  };

  const first = await claimUsageLimitNotification(fakeClient, 'lead_123', new Date('2026-03-02T00:00:00.000Z'));
  const replay = await claimUsageLimitNotification(fakeClient, 'lead_123', new Date('2026-03-02T00:00:01.000Z'));

  assert.equal(first, true);
  assert.equal(replay, false);
});
