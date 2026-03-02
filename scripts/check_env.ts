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
];

const missing = requirements.filter((item) => item.required && !process.env[item.name]?.trim());
const configErrors: string[] = [];

if (productionNodeEnv && !signatureValidationEnabled) {
  configErrors.push('TWILIO_VALIDATE_SIGNATURE must be true when NODE_ENV=production');
}

console.log('CallbackCloser env check');
console.log(`- Loaded env files: ${loadedFiles.join(', ') || '(none)'}`);
console.log(`- TWILIO_VALIDATE_SIGNATURE: ${signatureValidationEnabled ? 'enabled' : 'disabled'}`);

if (missing.length === 0 && configErrors.length === 0) {
  console.log('- Result: PASS (all required env vars are present)');
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
