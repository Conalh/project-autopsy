import { describe, expect, test } from "vitest";
import { clientKeyFromHeaders, createInspectRateLimiter } from "./inspect-rate-limit";

describe("inspect rate limiter", () => {
  test("allows requests up to the configured limit, then blocks within the window", () => {
    const limiter = createInspectRateLimiter({
      PROJECT_AUTOPSY_INSPECT_RATE_LIMIT: "2",
      PROJECT_AUTOPSY_INSPECT_RATE_WINDOW_SECONDS: "60"
    });

    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 1000).allowed).toBe(true);

    const blocked = limiter.check("ip", 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("resets after the window elapses", () => {
    const limiter = createInspectRateLimiter({
      PROJECT_AUTOPSY_INSPECT_RATE_LIMIT: "1",
      PROJECT_AUTOPSY_INSPECT_RATE_WINDOW_SECONDS: "10"
    });

    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 5000).allowed).toBe(false);
    expect(limiter.check("ip", 10001).allowed).toBe(true);
  });

  test("tracks clients independently", () => {
    const limiter = createInspectRateLimiter({ PROJECT_AUTOPSY_INSPECT_RATE_LIMIT: "1" });

    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
    expect(limiter.check("a", 0).allowed).toBe(false);
  });

  test("a limit of 0 disables throttling", () => {
    const limiter = createInspectRateLimiter({ PROJECT_AUTOPSY_INSPECT_RATE_LIMIT: "0" });

    for (let i = 0; i < 100; i += 1) {
      expect(limiter.check("ip", i).allowed).toBe(true);
    }
  });

  test("derives a client key from forwarded headers", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientKeyFromHeaders(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientKeyFromHeaders(new Headers())).toBe("global");
  });
});
