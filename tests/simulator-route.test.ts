import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('homepage and nav both point See Demo directly to /simulator', () => {
  const home = read('app/page.tsx');
  const nav = read('components/public-site-nav.tsx');

  assert.match(home, /href="\/simulator"/);
  assert.match(nav, /href: '\/simulator'/);
});

test('simulator route is a distinct public page with its own metadata and disabled-state copy', () => {
  const simulatorPage = read('app/simulator/page.tsx');
  const middleware = read('middleware.ts');

  assert.match(simulatorPage, /Missed-call Simulator \| CallbackCloser/);
  assert.match(simulatorPage, /See the full CallbackCloser lead loop in minutes/);
  assert.match(simulatorPage, /The public simulator is not configured on this environment yet\./);
  assert.doesNotMatch(middleware, /\/simulator\(.\*\)/);
});
