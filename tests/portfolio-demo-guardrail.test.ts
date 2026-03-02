import assert from 'node:assert/strict';
import test from 'node:test';

import {
  enforcePortfolioDemoGuardrail,
  isPortfolioDemoModeBlockedInProduction,
} from '../lib/portfolio-demo-guardrail.ts';

test('blocks production when demo mode is enabled without override', () => {
  const env = {
    NODE_ENV: 'production',
    PORTFOLIO_DEMO_MODE: '1',
    ALLOW_PRODUCTION_DEMO_MODE: '',
  };

  assert.equal(isPortfolioDemoModeBlockedInProduction(env), true);
  assert.throws(() => enforcePortfolioDemoGuardrail(env));
});

test('allows production demo mode only with explicit override', () => {
  const env = {
    NODE_ENV: 'production',
    PORTFOLIO_DEMO_MODE: 'true',
    ALLOW_PRODUCTION_DEMO_MODE: 'true',
  };

  assert.equal(isPortfolioDemoModeBlockedInProduction(env), false);
  assert.doesNotThrow(() => enforcePortfolioDemoGuardrail(env));
});

test('does not block demo mode in non-production', () => {
  const env = {
    NODE_ENV: 'development',
    PORTFOLIO_DEMO_MODE: '1',
    ALLOW_PRODUCTION_DEMO_MODE: '',
  };

  assert.equal(isPortfolioDemoModeBlockedInProduction(env), false);
});
