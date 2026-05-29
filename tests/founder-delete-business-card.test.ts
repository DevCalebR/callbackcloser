import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('founder single-business delete card keeps permanent delete exact-name gated and adds the real-customer phrase', () => {
  const component = read('components/founder-delete-business-card.tsx');

  assert.match(component, /Choose a business/);
  assert.match(component, /Owner email/);
  assert.match(component, /Test\/demo/);
  assert.match(component, /Real customer/);
  assert.match(component, /Type the exact business name/);
  assert.match(component, /REAL_CUSTOMER_DELETE_CONFIRMATION/);
  assert.match(component, /getPermanentDeleteButtonLabel/);
  assert.match(component, /getPermanentDeleteWarningText/);
  assert.match(component, /Real customers also require the explicit founder phrase/);
  assert.match(component, /confirmationName === selectedBusiness\.name/);
  assert.match(component, /disabled=\{!selectedBusiness \|\| !exactNameMatch \|\| !phraseMatch\}/);
});
