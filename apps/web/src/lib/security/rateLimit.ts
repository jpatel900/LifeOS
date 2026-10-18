/**
 * Per-user fixed-window rate limit for the AI routes that spend OpenAI credit
 * (#670 denial-of-wallet follow-up): /api/parse-capture, /api/task-map and
 * /api/rollup-prose.
 *
 * Deliberately in-memory, per server instance. AGENTS.md rules out adding a
 * hosted store (Vercel KV, Redis) without the owner, and a Postgres counter
 * would need a new user-owned table, a SECURITY DEFINER increment (an
 * RLS-writable counter could simply be reset by its owner), export coverage
 * and a production migration -- a lot of surface for a single-user app. The
 * trade-off: each warm instance keeps its own count, so the true ceiling is
 * the limit times the number of live instances. It still stops a runaway
 * client loop or a scripted burst from one session, which is the goal.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the current window ends; 0 when allowed. */
  retryAfterSeconds: number;
}

interface WindowState {
  windowStart: number;
  count: number;
}

export function createFixedWindowRateLimiter(options: {
  limit: number;
  windowMs: number;
  /** Expired windows are swept once this many keys are held. */
  maxKeys?: number;
}) {
  const { limit, windowMs, maxKeys = 10_000 } = options;
  const windows = new Map<string, WindowState>();

  function sweep(now: number) {
    for (const [key, state] of windows) {
      if (now - state.windowStart >= windowMs) {
        windows.delete(key);
      }
    }
  }

  return {
    take(key: string, now: number = Date.now()): RateLimitDecision {
      let state = windows.get(key);

      if (!state || now - state.windowStart >= windowMs) {
        if (!state && windows.size >= maxKeys) {
          sweep(now);
        }
        state = { windowStart: now, count: 0 };
        windows.set(key, state);
      }

      if (state.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((state.windowStart + windowMs - now) / 1000),
          ),
        };
      }

      state.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
    size() {
      return windows.size;
    },
    reset() {
      windows.clear();
    },
  };
}

/** Generous on purpose: normal use never comes close. */
export const AI_ROUTE_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const;

export const RATE_LIMITED_ERROR = "Too many requests. Try again in a minute.";

export type AiRateLimitedRoute = "parse-capture" | "task-map" | "rollup-prose";

const aiRouteLimiter = createFixedWindowRateLimiter(AI_ROUTE_RATE_LIMIT);

/** Counts one request against this user's budget for this route. */
export function takeAiRouteRequest(
  route: AiRateLimitedRoute,
  userId: string,
): RateLimitDecision {
  return aiRouteLimiter.take(`${route}:${userId}`);
}

export function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { ok: false, error: RATE_LIMITED_ERROR },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

/** Test-only: clears every AI route window. */
export function resetAiRouteRateLimitsForTests() {
  aiRouteLimiter.reset();
}
