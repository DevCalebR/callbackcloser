import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('founder single-business delete card keeps hard delete narrow and exact-name gated', () => {
  const component = read('components/founder-delete-business-card.tsx');

  assert.match(component, /Choose a business/);
  assert.match(component, /Owner email/);
  assert.match(component, /Test\/demo/);
  assert.match(component, /Real customer/);
  assert.match(component, /Deletion is permanent/);
  assert.match(component, /Type the exact business name/);
  assert.match(component, /Archive real customers\. Hard delete test\/demo businesses only\./);
  assert.match(component, /Delete this business/);
  assert.match(component, /confirmationName === selectedBusiness\.name/);
  assert.match(component, /disabled=\{!selectedBusiness \|\| !selectedBusiness\.deleteEligible \|\| !exactNameMatch\}/);
});
