type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
};

const bucketStore = new Map<string, RateLimitBucket>();
let consumeCount = 0;

function clampInteger(value: number, min: number, max: number) {
  const next = Math.trunc(value);
  if (!Number.isFinite(next)) return min;
  if (next < min) return min;
  if (next > max) return max;
  return next;
}

function pruneExpiredBuckets(nowMs: number) {
  consumeCount += 1;
  if (consumeCount % 200 !== 0) return;

  for (const [key, bucket] of bucketStore.entries()) {
    if (bucket.resetAtMs <= nowMs) {
      bucketStore.delete(key);
    }
  }
}

export function consumeRateLimit(input: { key: string; limit: number; windowMs: number; nowMs?: number }): RateLimitDecision {
  const nowMs = input.nowMs ?? Date.now();
  const limit = clampInteger(input.limit, 1, 1_000_000);
  const windowMs = clampInteger(input.windowMs, 1_000, 3_600_000);
  const key = input.key.trim();

  if (!key) {
    return {
      allowed: true,
      limit,
      remaining: limit,
      resetAtMs: nowMs + windowMs,
      retryAfterSeconds: 0,
    };
  }

  const existing = bucketStore.get(key);
  if (!existing || existing.resetAtMs <= nowMs) {
    const next: RateLimitBucket = { count: 1, resetAtMs: nowMs + windowMs };
    bucketStore.set(key, next);
    pruneExpiredBuckets(nowMs);
    return {
      allowed: true,
      limit,
      remaining: Math.max(limit - 1, 0),
      resetAtMs: next.resetAtMs,
      retryAfterSeconds: 0,
    };
  }

  if (existing.count >= limit) {
    const retryAfterMs = Math.max(existing.resetAtMs - nowMs, 0);
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAtMs: existing.resetAtMs,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  existing.count += 1;
  bucketStore.set(key, existing);

  return {
    allowed: true,
    limit,
    remaining: Math.max(limit - existing.count, 0),
    resetAtMs: existing.resetAtMs,
    retryAfterSeconds: 0,
  };
}

export function getClientIpAddress(request: Pick<Request, 'headers'>) {
  const headers = request.headers;
  const forwardedFor = headers.get('x-forwarded-for')?.trim();
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const cloudflareIp = headers.get('cf-connecting-ip')?.trim();
  if (cloudflareIp) return cloudflareIp;

  return 'unknown';
}

export function getRateLimitNumber(
  envName: string,
  fallback: number,
  options: {
    min?: number;
    max?: number;
    env?: Record<string, string | undefined>;
  } = {}
) {
  const env = options.env ?? process.env;
  const min = options.min ?? 1;
  const max = options.max ?? 1_000_000;
  const raw = env[envName]?.trim();
  if (!raw) return clampInteger(fallback, min, max);

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return clampInteger(fallback, min, max);
  return clampInteger(parsed, min, max);
}

export function buildRateLimitHeaders(result: RateLimitDecision) {
  return {
    'Retry-After': String(result.retryAfterSeconds),
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAtMs / 1000)),
  };
}

export function resetRateLimitStore() {
  bucketStore.clear();
  consumeCount = 0;
}
