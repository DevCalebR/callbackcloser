import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('homepage keeps demo access while the top nav stays focused on the simulator route', () => {
  const home = read('app/page.tsx');
  const nav = read('components/public-site-nav.tsx');

  assert.match(home, /href="\/demo"/);
  assert.match(home, /href="\/simulator"/);
  assert.doesNotMatch(nav, /href: '\/demo'/);
  assert.match(nav, /href: '\/simulator'/);
});

test('simulator route is a distinct public page with its own metadata and self-contained public experience', () => {
  const simulatorPage = read('app/simulator/page.tsx');
  const simulatorExperience = read('components/simulator/public-simulator-experience.tsx');
  const middleware = read('middleware.ts');

  assert.match(simulatorPage, /Missed-Call Simulator \| CallbackCloser/);
  assert.match(simulatorPage, /PublicSimulatorExperience/);
  assert.match(simulatorPage, /Run the self-contained CallbackCloser missed-call simulator/i);
  assert.match(simulatorExperience, /Show the missed-call recovery flow without setup/);
  assert.match(simulatorExperience, /Lead qualified/);
  assert.match(simulatorExperience, /No real SMS is sent/);
  assert.doesNotMatch(simulatorPage, /The public simulator is not configured on this environment yet\./);
  assert.doesNotMatch(simulatorPage, /Preview mode is active/);
  assert.doesNotMatch(simulatorPage, /Real SMS mode is active/);
  assert.doesNotMatch(simulatorExperience, /Demo number unavailable|not configured on this environment yet|Real SMS mode is active/);
  assert.doesNotMatch(middleware, /\/simulator\(.\*\)/);
});
