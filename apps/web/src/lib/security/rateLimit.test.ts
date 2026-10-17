import { beforeEach, describe, expect, it } from "vitest";
import {
  AI_ROUTE_RATE_LIMIT,
  RATE_LIMITED_ERROR,
  createFixedWindowRateLimiter,
  rateLimitedResponse,
  resetAiRouteRateLimitsForTests,
  takeAiRouteRequest,
} from "./rateLimit";

describe("createFixedWindowRateLimiter", () => {
  it("allows up to the limit in one window, then blocks", () => {
    const limiter = createFixedWindowRateLimiter({
      limit: 3,
      windowMs: 60_000,
    });
    const now = 1_000_000;

    expect(limiter.take("user-a", now).allowed).toBe(true);
    expect(limiter.take("user-a", now + 1).allowed).toBe(true);
    expect(limiter.take("user-a", now + 2).allowed).toBe(true);

    const blocked = limiter.take("user-a", now + 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(50);
  });

  it("opens a fresh window once the old one has passed", () => {
    const limiter = createFixedWindowRateLimiter({
      limit: 1,
      windowMs: 60_000,
    });
    const now = 1_000_000;

    expect(limiter.take("user-a", now).allowed).toBe(true);
    expect(limiter.take("user-a", now + 59_999).allowed).toBe(false);
    expect(limiter.take("user-a", now + 60_000).allowed).toBe(true);
  });

  it("keeps a separate budget per key", () => {
    const limiter = createFixedWindowRateLimiter({
      limit: 1,
      windowMs: 60_000,
    });

    expect(limiter.take("user-a", 0).allowed).toBe(true);
    expect(limiter.take("user-a", 1).allowed).toBe(false);
    expect(limiter.take("user-b", 1).allowed).toBe(true);
  });

  it("does not count blocked requests toward the next window", () => {
    const limiter = createFixedWindowRateLimiter({ limit: 1, windowMs: 1_000 });

    limiter.take("user-a", 0);
    for (let i = 0; i < 50; i += 1) {
      limiter.take("user-a", 10);
    }
    expect(limiter.take("user-a", 1_000).allowed).toBe(true);
  });

  it("drops expired windows so memory stays bounded", () => {
    const limiter = createFixedWindowRateLimiter({
      limit: 1,
      windowMs: 1_000,
      maxKeys: 2,
    });

    limiter.take("a", 0);
    limiter.take("b", 0);
    limiter.take("c", 5_000);

    expect(limiter.size()).toBeLessThanOrEqual(2);
  });
});

describe("AI route rate limit", () => {
  beforeEach(() => {
    resetAiRouteRateLimitsForTests();
  });

  it("defaults to a generous 30 requests per minute", () => {
    expect(AI_ROUTE_RATE_LIMIT).toEqual({ limit: 30, windowMs: 60_000 });
  });

  it("counts each route separately for the same user", () => {
    for (let i = 0; i < AI_ROUTE_RATE_LIMIT.limit; i += 1) {
      expect(takeAiRouteRequest("parse-capture", "user-a").allowed).toBe(true);
    }
    expect(takeAiRouteRequest("parse-capture", "user-a").allowed).toBe(false);
    expect(takeAiRouteRequest("task-map", "user-a").allowed).toBe(true);
    expect(takeAiRouteRequest("parse-capture", "user-b").allowed).toBe(true);
  });

  it("builds the plain-language 429 response", async () => {
    const response = rateLimitedResponse(42);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(await response.json()).toEqual({
      ok: false,
      error: RATE_LIMITED_ERROR,
    });
    expect(RATE_LIMITED_ERROR).toBe(
      "Too many requests. Try again in a minute.",
    );
  });
});
