import type { NextRequest } from 'next/server';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

function prune(bucket: Bucket, now: number) {
  const cutoff = now - WINDOW_MS;
  while (bucket.timestamps.length > 0 && bucket.timestamps[0]! < cutoff) {
    bucket.timestamps.shift();
  }
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]!.trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  const reqWithIp = request as NextRequest & { ip?: string };
  return reqWithIp.ip?.trim() || 'unknown';
}

/** Sliding-window limiter: max `MAX_REQUESTS` per `WINDOW_MS` per IP. */
export function isConnectionsApiRateLimited(request: NextRequest): {
  limited: boolean;
  retryAfterSec: number;
} {
  const ip = getClientIp(request);
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(ip, bucket);
  }
  prune(bucket, now);

  if (bucket.timestamps.length >= MAX_REQUESTS) {
    const oldest = bucket.timestamps[0]!;
    const retryAfterMs = WINDOW_MS - (now - oldest);
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  bucket.timestamps.push(now);
  return { limited: false, retryAfterSec: 0 };
}
