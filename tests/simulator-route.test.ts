import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('homepage and nav both point See Demo directly to /demo', () => {
  const home = read('app/page.tsx');
  const nav = read('components/public-site-nav.tsx');

  assert.match(home, /href="\/demo"/);
  assert.match(nav, /href: '\/demo'/);
});

test('simulator route is a distinct public page with its own metadata and self-contained public experience', () => {
  const simulatorPage = read('app/simulator/page.tsx');
  const middleware = read('middleware.ts');

  assert.match(simulatorPage, /Missed-Call Simulator \| CallbackCloser/);
  assert.match(simulatorPage, /PublicSimulatorExperience/);
  assert.match(simulatorPage, /Run the self-contained CallbackCloser missed-call simulator/i);
  assert.doesNotMatch(simulatorPage, /The public simulator is not configured on this environment yet\./);
  assert.doesNotMatch(simulatorPage, /Preview mode is active/);
  assert.doesNotMatch(simulatorPage, /Real SMS mode is active/);
  assert.doesNotMatch(middleware, /\/simulator\(.\*\)/);
});
