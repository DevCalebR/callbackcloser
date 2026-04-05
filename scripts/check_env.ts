import process from 'node:process';

import { loadLocalEnvFiles, readBooleanEnv } from './load-env.ts';

type EnvRequirement = {
  name: string;
  required: boolean;
  reason: string;
};

const loadedFiles = loadLocalEnvFiles();

const signatureValidationEnabled = readBooleanEnv('TWILIO_VALIDATE_SIGNATURE');
const productionNodeEnv = process.env.NODE_ENV === 'production';
const demoModeEnabled = readBooleanEnv('PORTFOLIO_DEMO_MODE');
const demoModeOverrideEnabled = readBooleanEnv('ALLOW_PRODUCTION_DEMO_MODE');
const founderBillingBypassEnabled = readBooleanEnv('ALLOW_FOUNDER_BILLING_BYPASS');

const requirements: EnvRequirement[] = [
  { name: 'NEXT_PUBLIC_APP_URL', required: true, reason: 'Canonical app URL / webhook URL generation' },
  { name: 'DATABASE_URL', required: true, reason: 'Prisma runtime DB connection' },
  { name: 'DIRECT_DATABASE_URL', required: true, reason: 'Prisma migrations / direct DB connection' },
  { name: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', required: true, reason: 'Clerk frontend auth' },
  { name: 'CLERK_SECRET_KEY', required: true, reason: 'Clerk backend auth' },
  { name: 'STRIPE_SECRET_KEY', required: true, reason: 'Stripe API access' },
  { name: 'STRIPE_WEBHOOK_SECRET', required: true, reason: 'Stripe webhook verification' },
  { name: 'STRIPE_PRICE_STARTER', required: true, reason: 'Starter plan mapping' },
  { name: 'STRIPE_PRICE_PRO', required: true, reason: 'Pro plan mapping' },
  { name: 'TWILIO_ACCOUNT_SID', required: true, reason: 'Twilio API access' },
  { name: 'TWILIO_AUTH_TOKEN', required: true, reason: 'Twilio API access / signature validation' },
  {
    name: 'TWILIO_WEBHOOK_AUTH_TOKEN',
    required: true,
    reason: 'Twilio shared-token local/dev fallback + webhook URL tooling',
  },
  {
    name: 'TWILIO_VALIDATE_SIGNATURE',
    required: productionNodeEnv,
    reason: productionNodeEnv
      ? 'Required in production: must enable X-Twilio-Signature validation'
      : 'Optional in non-production',
  },
  { name: 'DEBUG_ENV_ENDPOINT_TOKEN', required: false, reason: 'Optional debug endpoint token' },
  { name: 'PORTFOLIO_DEMO_MODE', required: false, reason: 'Optional demo mode' },
  { name: 'ALLOW_PRODUCTION_DEMO_MODE', required: false, reason: 'Optional break-glass override for demo mode in production' },
  { name: 'ALLOW_FOUNDER_BILLING_BYPASS', required: false, reason: 'Optional founder-only billing override for smoke testing' },
  { name: 'FOUNDER_CLERK_USER_ID', required: founderBillingBypassEnabled, reason: 'Required when founder-only billing bypass is enabled' },
];

const missing = requirements.filter((item) => item.required && !process.env[item.name]?.trim());
const configErrors: string[] = [];

function validateAbsoluteUrl(name: string, options: { requireHttps: boolean }) {
  const raw = process.env[name]?.trim();
  if (!raw) return;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    configErrors.push(`${name} must be a valid absolute URL`);
    return;
  }

  if (options.requireHttps && parsed.protocol !== 'https:') {
    configErrors.push(`${name} must use https:// when NODE_ENV=production`);
  }
}

function validateIntegerEnv(name: string, options: { min: number; max: number }) {
  const raw = process.env[name]?.trim();
  if (!raw) return;

  if (!/^-?\d+$/.test(raw)) {
    configErrors.push(`${name} must be an integer`);
    return;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < options.min || parsed > options.max) {
    configErrors.push(`${name} must be between ${options.min} and ${options.max}`);
  }
}

if (productionNodeEnv && !signatureValidationEnabled) {
  configErrors.push('TWILIO_VALIDATE_SIGNATURE must be true when NODE_ENV=production');
}

if (productionNodeEnv && demoModeEnabled && !demoModeOverrideEnabled) {
  configErrors.push('PORTFOLIO_DEMO_MODE cannot be enabled in production without ALLOW_PRODUCTION_DEMO_MODE=true');
}

if (founderBillingBypassEnabled && !process.env.FOUNDER_CLERK_USER_ID?.trim()) {
  configErrors.push('FOUNDER_CLERK_USER_ID is required when ALLOW_FOUNDER_BILLING_BYPASS=true');
}

validateAbsoluteUrl('NEXT_PUBLIC_APP_URL', { requireHttps: productionNodeEnv });
validateAbsoluteUrl('ALERT_WEBHOOK_URL', { requireHttps: productionNodeEnv });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (databaseUrl?.includes('neon.tech') && !/[?&]sslmode=require(?:&|$)/i.test(databaseUrl)) {
  configErrors.push('DATABASE_URL for Neon must include sslmode=require');
}

const directDatabaseUrl = process.env.DIRECT_DATABASE_URL?.trim();
if (directDatabaseUrl?.includes('neon.tech') && !/[?&]sslmode=require(?:&|$)/i.test(directDatabaseUrl)) {
  configErrors.push('DIRECT_DATABASE_URL for Neon must include sslmode=require');
}
if (directDatabaseUrl?.includes('-pooler.')) {
  configErrors.push('DIRECT_DATABASE_URL must use the Neon direct (non-pooler) host');
}

const starterPriceId = process.env.STRIPE_PRICE_STARTER?.trim();
const proPriceId = process.env.STRIPE_PRICE_PRO?.trim();
if (starterPriceId && proPriceId && starterPriceId === proPriceId) {
  configErrors.push('STRIPE_PRICE_STARTER and STRIPE_PRICE_PRO must be different price IDs');
}

validateIntegerEnv('ALERT_WEBHOOK_TIMEOUT_MS', { min: 1_000, max: 30_000 });
validateIntegerEnv('RATE_LIMIT_WINDOW_MS', { min: 1_000, max: 3_600_000 });
validateIntegerEnv('RATE_LIMIT_TWILIO_AUTH_MAX', { min: 10, max: 10_000 });
validateIntegerEnv('RATE_LIMIT_TWILIO_UNAUTH_MAX', { min: 5, max: 5_000 });
validateIntegerEnv('RATE_LIMIT_STRIPE_AUTH_MAX', { min: 10, max: 10_000 });
validateIntegerEnv('RATE_LIMIT_STRIPE_UNAUTH_MAX', { min: 5, max: 5_000 });
validateIntegerEnv('RATE_LIMIT_PROTECTED_API_MAX', { min: 10, max: 10_000 });

console.log('CallbackCloser env check');
console.log(`- Loaded env files: ${loadedFiles.join(', ') || '(none)'}`);
console.log(`- NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL?.trim() ? 'set' : 'missing'}`);
console.log(`- TWILIO_VALIDATE_SIGNATURE: ${signatureValidationEnabled ? 'enabled' : 'disabled'}`);
console.log(`- PORTFOLIO_DEMO_MODE: ${demoModeEnabled ? 'enabled' : 'disabled'}`);
console.log(`- ALLOW_PRODUCTION_DEMO_MODE: ${demoModeOverrideEnabled ? 'enabled' : 'disabled'}`);
console.log(`- ALLOW_FOUNDER_BILLING_BYPASS: ${founderBillingBypassEnabled ? 'enabled' : 'disabled'}`);
console.log(`- FOUNDER_CLERK_USER_ID: ${process.env.FOUNDER_CLERK_USER_ID?.trim() ? 'set' : 'missing'}`);

if (missing.length === 0 && configErrors.length === 0) {
  console.log('- Result: PASS (all required env vars are present)');
  console.log(
    '- Note: env check does not verify business-level live smoke prerequisites such as forwarding number, owner notify phone, Twilio number + webhook sync, or active billing.'
  );
  process.exit(0);
}

console.log('- Result: FAIL (missing required env vars)');
for (const item of missing) {
  console.log(`  - ${item.name}`);
}
for (const message of configErrors) {
  console.log(`  - ${message}`);
}
process.exit(1);
