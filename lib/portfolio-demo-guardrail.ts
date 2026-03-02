function parseBooleanFlag(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isProductionRuntime(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
}

export function isPortfolioDemoModeEnabled(env: Record<string, string | undefined> = process.env) {
  return parseBooleanFlag(env.PORTFOLIO_DEMO_MODE);
}

export function isProductionDemoModeOverrideEnabled(env: Record<string, string | undefined> = process.env) {
  return parseBooleanFlag(env.ALLOW_PRODUCTION_DEMO_MODE);
}

export function isPortfolioDemoModeBlockedInProduction(env: Record<string, string | undefined> = process.env) {
  return isProductionRuntime(env) && isPortfolioDemoModeEnabled(env) && !isProductionDemoModeOverrideEnabled(env);
}

export function getPortfolioDemoGuardrailErrorMessage() {
  return (
    'Invalid environment configuration: PORTFOLIO_DEMO_MODE is enabled in production without ALLOW_PRODUCTION_DEMO_MODE=true. ' +
    'Disable demo mode for production or explicitly set ALLOW_PRODUCTION_DEMO_MODE=true for break-glass use.'
  );
}

export function enforcePortfolioDemoGuardrail(env: Record<string, string | undefined> = process.env) {
  if (isPortfolioDemoModeBlockedInProduction(env)) {
    throw new Error(getPortfolioDemoGuardrailErrorMessage());
  }
}
