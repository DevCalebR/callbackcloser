import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('legal public pages exist with required headings', () => {
  const terms = read('app/terms/page.tsx');
  const privacy = read('app/privacy/page.tsx');
  const refund = read('app/refund/page.tsx');

  assert.match(terms, /Terms of Service/);
  assert.match(privacy, /Privacy Policy/);
  assert.match(refund, /Refund Policy/);
});
