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
  assert.match(nav, /href: '\/simulator'/);
});

test('simulator route is a distinct public page with a safe interactive preview', () => {
  const simulatorPage = read('app/simulator/page.tsx');
  const simulatorExperience = read('components/demo/public-simulator-experience.tsx');
  const middleware = read('middleware.ts');

  assert.match(simulatorPage, /Missed-Call Simulator \| CallbackCloser/);
  assert.match(simulatorPage, /PublicSimulatorExperience/);
  assert.match(simulatorExperience, /Interactive preview mode/);
  assert.match(simulatorExperience, /No real SMS will be sent in this demo/);
  assert.match(simulatorExperience, /See how CallbackCloser would recover a missed call/);
  assert.match(simulatorExperience, /Start 14-Day Pilot/);
  assert.doesNotMatch(simulatorExperience, /Demo number unavailable|not configured on this environment yet|Real SMS mode is active/);
  assert.doesNotMatch(middleware, /\/simulator\(.\*\)/);
});
