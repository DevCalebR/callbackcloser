import 'server-only';

type EnvSpec = {
  name: string;
  provider: 'Vercel' | 'Database' | 'Clerk' | 'Stripe' | 'Twilio';
  visibility: 'server' | 'public';
  requiredInProduction: boolean;
};

const ENV_SPECS: EnvSpec[] = [
  { name: 'NEXT_PUBLIC_APP_URL', provider: 'Vercel', visibility: 'public', requiredInProduction: true },
  { name: 'DATABASE_URL', provider: 'Database', visibility: 'server', requiredInProduction: true },
  { name: 'DIRECT_DATABASE_URL', provider: 'Database', visibility: 'server', requiredInProduction: true },

  { name: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', provider: 'Clerk', visibility: 'public', requiredInProduction: true },
  { name: 'CLERK_SECRET_KEY', provider: 'Clerk', visibility: 'server', requiredInProduction: true },
  { name: 'NEXT_PUBLIC_CLERK_SIGN_IN_URL', provider: 'Clerk', visibility: 'public', requiredInProduction: false },
  { name: 'NEXT_PUBLIC_CLERK_SIGN_UP_URL', provider: 'Clerk', visibility: 'public', requiredInProduction: false },

  { name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', provider: 'Stripe', visibility: 'public', requiredInProduction: false },
  { name: 'STRIPE_SECRET_KEY', provider: 'Stripe', visibility: 'server', requiredInProduction: true },
  { name: 'STRIPE_WEBHOOK_SECRET', provider: 'Stripe', visibility: 'server', requiredInProduction: true },
  { name: 'STRIPE_PRICE_STARTER', provider: 'Stripe', visibility: 'server', requiredInProduction: true },
  { name: 'STRIPE_PRICE_PRO', provider: 'Stripe', visibility: 'server', requiredInProduction: true },

  { name: 'TWILIO_ACCOUNT_SID', provider: 'Twilio', visibility: 'server', requiredInProduction: true },
  { name: 'TWILIO_AUTH_TOKEN', provider: 'Twilio', visibility: 'server', requiredInProduction: true },
  { name: 'TWILIO_WEBHOOK_AUTH_TOKEN', provider: 'Twilio', visibility: 'server', requiredInProduction: true },
];

let validated = false;

function getMissingEnvVars() {
  return ENV_SPECS.filter((spec) => spec.requiredInProduction && !process.env[spec.name]?.trim());
}

function validateAppUrl() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      'Invalid environment configuration: NEXT_PUBLIC_APP_URL must be a valid absolute URL (e.g. https://app.example.com).'
    );
  }

  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('Invalid environment configuration: NEXT_PUBLIC_APP_URL must use https:// in production.');
  }
}

function validateDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return;

  if (raw.includes('neon.tech') && !/[?&]sslmode=require(?:&|$)/i.test(raw)) {
    throw new Error('Invalid environment configuration: DATABASE_URL for Neon must include sslmode=require.');
  }

  const direct = process.env.DIRECT_DATABASE_URL?.trim();
  if (!direct) return;

  if (direct.includes('neon.tech') && !/[?&]sslmode=require(?:&|$)/i.test(direct)) {
    throw new Error('Invalid environment configuration: DIRECT_DATABASE_URL for Neon must include sslmode=require.');
  }

  if (direct.includes('-pooler.')) {
    throw new Error('Invalid environment configuration: DIRECT_DATABASE_URL must use the Neon direct (non-pooler) host.');
  }
}

export function validateServerEnv() {
  if (validated) return;
  if (process.env.NODE_ENV !== 'production') return;

  const missing = getMissingEnvVars();
  if (missing.length > 0) {
    const details = missing
      .map((spec) => `- ${spec.name} (${spec.visibility}, set by ${spec.provider})`)
      .join('\n');

    throw new Error(
      `Missing required environment variables for production.\n${details}\n\n` +
        'Set these in Vercel Project Settings -> Environment Variables before starting the app.'
    );
  }

  validateAppUrl();
  validateDatabaseUrl();
  validated = true;
}

export function getConfiguredAppBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

export const productionEnvSpecs = ENV_SPECS;
