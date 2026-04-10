import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('owner notification service claims a lead once and dedupes per channel', () => {
  const ownerNotifications = read('lib/owner-notifications.ts');
  const schema = read('prisma/schema.prisma');

  assert.match(ownerNotifications, /leadId_channel/);
  assert.match(ownerNotifications, /updateMany\(\{\s*where:\s*\{\s*id:\s*leadId,\s*notifiedAt:\s*null/s);
  assert.match(ownerNotifications, /status:\s*LeadStatus\.NOTIFIED/);
  assert.match(schema, /@@unique\(\[leadId, channel\]\)/);
});
