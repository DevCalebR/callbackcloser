import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getConfiguredAppBaseUrl } from '@/lib/env.server';
import { getCorrelationIdFromRequest, withCorrelationIdHeader } from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DB_PROBE_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timeout_after_${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
    }),
  ]);
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function getEnvChecks() {
  return {
    appUrl: Boolean(getConfiguredAppBaseUrl()),
    databaseUrl: hasValue(process.env.DATABASE_URL),
    directDatabaseUrl: hasValue(process.env.DIRECT_DATABASE_URL),
    clerk: hasValue(process.env.CLERK_SECRET_KEY) && hasValue(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
    stripe: hasValue(process.env.STRIPE_SECRET_KEY) && hasValue(process.env.STRIPE_WEBHOOK_SECRET),
    twilio: hasValue(process.env.TWILIO_ACCOUNT_SID) && hasValue(process.env.TWILIO_AUTH_TOKEN),
  };
}

async function getDatabaseCheck() {
  try {
    await withTimeout(db.$queryRaw`SELECT 1`, DB_PROBE_TIMEOUT_MS);
    return { ok: true as const, detail: 'ok' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'db_probe_failed';
    return { ok: false as const, detail };
  }
}

export async function GET(request: Request) {
  const correlationId = getCorrelationIdFromRequest(request);
  const withCorrelation = (response: NextResponse) => withCorrelationIdHeader(response, correlationId);
  const envChecks = getEnvChecks();
  const dbCheck = await getDatabaseCheck();
  const envReady = Object.values(envChecks).every(Boolean);
  const ready = envReady && dbCheck.ok;

  return withCorrelation(
    NextResponse.json(
      {
        status: ready ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        checks: {
          env: {
            ready: envReady,
            ...envChecks,
          },
          database: dbCheck,
        },
      },
      { status: ready ? 200 : 503 }
    )
  );
}
