import { describe, expect, it } from "vitest";
import { clientIp, createLimiter } from "./ratelimit";

describe("rate limiter", () => {
  it("allows up to the limit, then refuses until the window ends", () => {
    let t = 0;
    const take = createLimiter([{ prefix: "/api/scan", limit: 2, windowMs: 60_000 }], () => t);
    expect(take("/api/scan", "a")?.ok).toBe(true);
    expect(take("/api/scan", "a")?.ok).toBe(true);
    const third = take("/api/scan", "a")!;
    expect(third.ok).toBe(false);
    expect(third.retryAfterS).toBe(60);
    t = 60_000;
    expect(take("/api/scan", "a")?.ok).toBe(true);
  });

  it("counts each visitor separately", () => {
    const take = createLimiter([{ prefix: "/api/", limit: 1, windowMs: 60_000 }], () => 0);
    expect(take("/api/x", "a")?.ok).toBe(true);
    expect(take("/api/x", "b")?.ok).toBe(true);
    expect(take("/api/x", "a")?.ok).toBe(false);
  });

  it("applies the strictest of several matching rules", () => {
    const take = createLimiter(
      [
        { prefix: "/api/vault/seal", limit: 1, windowMs: 60_000 },
        { prefix: "/api/", limit: 100, windowMs: 60_000 },
      ],
      () => 0,
    );
    take("/api/vault/seal", "a");
    expect(take("/api/vault/seal", "a")?.ok).toBe(false);
    expect(take("/api/scan", "a")?.ok).toBe(true);
  });

  it("ignores paths no rule covers", () => {
    const take = createLimiter([{ prefix: "/api/", limit: 1, windowMs: 1 }]);
    expect(take("/scan", "a")).toBeNull();
  });

  it("reads the visitor address Vercel sets", () => {
    expect(clientIp(new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
