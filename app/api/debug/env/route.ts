import { NextResponse } from 'next/server';

import { resolveConfiguredAppBaseUrl } from '@/lib/env.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request) {
  if (process.env.NODE_ENV !== 'production') return true;

  const expected = process.env.DEBUG_ENV_ENDPOINT_TOKEN?.trim();
  if (!expected) return false;

  const token = new URL(request.url).searchParams.get('token')?.trim();
  return Boolean(token && token === expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const resolution = resolveConfiguredAppBaseUrl();
  if (!resolution.appUrlResolved || !resolution.sourceUsed) {
    return NextResponse.json(
      {
        error: 'App URL could not be resolved',
        appUrlResolved: null,
        sourceUsed: null,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    appUrlResolved: resolution.appUrlResolved,
    sourceUsed: resolution.sourceUsed,
  });
}
