import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('public demo route is auth-free and built from isolated demo data', () => {
  const demoPage = read('app/demo/page.tsx');
  const demoData = read('lib/demo-data.ts');
  const middleware = read('middleware.ts');

  assert.match(demoPage, /Live Product Demo \| CallbackCloser/);
  assert.match(demoPage, /PublicDemoReplay/);
  assert.match(demoPage, /Stop losing jobs when you miss the call/i);
  assert.match(demoPage, /This is exactly what your customer sees after you miss their call/i);
  assert.match(demoData, /No login, no real customer data, no live Twilio traffic/i);
  assert.match(demoPage, /from ['"]@\/lib\/demo-data['"]/);
  assert.doesNotMatch(demoPage, /requireBusiness|getBusinessForOwnerClerkId|db\./);
  assert.doesNotMatch(middleware, /\/demo\(.\*\)/);
  assert.match(demoData, /Jamie Carter/);
  assert.match(demoData, /New HVAC lead/);
  assert.match(demoData, /Ready for callback/);
});
