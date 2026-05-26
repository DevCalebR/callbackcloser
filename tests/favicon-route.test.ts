import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('app icon exists so public pages do not rely on a missing default favicon', () => {
  assert.equal(existsSync(path.join(process.cwd(), 'app/icon.svg')), true);
});
