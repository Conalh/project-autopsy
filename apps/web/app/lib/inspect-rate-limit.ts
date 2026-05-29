type RateLimitEnv = Record<string, string | undefined>;

interface BucketState {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  limit: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
  reset(): void;
}

/**
 * A small in-memory fixed-window rate limiter for the inspect endpoint. It is
 * per-process (sufficient for a single instance / abuse throttling); a
 * multi-instance deployment should front it with a shared store. Limit and
 * window are configurable, and a limit of 0 disables throttling.
 */
export function createInspectRateLimiter(env: RateLimitEnv = process.env): RateLimiter {
  const limit = readNonNegativeInt(env.PROJECT_AUTOPSY_INSPECT_RATE_LIMIT, 60);
  const windowMs = readPositiveInt(env.PROJECT_AUTOPSY_INSPECT_RATE_WINDOW_SECONDS, 60) * 1000;
  const buckets = new Map<string, BucketState>();

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      if (limit <= 0) {
        return { allowed: true, retryAfterSeconds: 0, limit };
      }

      const state = buckets.get(key);
      if (!state || now >= state.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0, limit };
      }

      if (state.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
          limit
        };
      }

      state.count += 1;
      return { allowed: true, retryAfterSeconds: 0, limit };
    },
    reset(): void {
      buckets.clear();
    }
  };
}

/** Derive a stable client key from proxy headers, falling back to a shared bucket. */
export function clientKeyFromHeaders(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return headers.get("x-real-ip")?.trim() || "global";
}

function readNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
