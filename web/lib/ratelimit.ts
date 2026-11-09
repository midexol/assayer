// Per-visitor request limits for the API routes, checked in middleware before any route runs.
// Counts live in memory on each server instance, so they are a first line of defence against
// scripts and floods, not an exact global quota. Vercel's own DDoS protection sits in front.

export interface Rule {
  /** Applies to paths starting with this. */
  prefix: string;
  /** Requests allowed per visitor in each window. */
  limit: number;
  windowMs: number;
}

export interface Verdict {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterS: number;
}

export function createLimiter(rules: Rule[], now: () => number = Date.now) {
  const hits = new Map<string, { start: number; count: number }>();

  function prune(t: number) {
    if (hits.size < 20_000) return;
    for (const [k, v] of hits) {
      const rule = rules.find((r) => k.startsWith(r.prefix + "|"));
      if (!rule || t - v.start >= rule.windowMs) hits.delete(k);
    }
  }

  /** Counts one request from `who` to `path` against every rule that matches it. */
  return function take(path: string, who: string): Verdict | null {
    const matching = rules.filter((r) => path.startsWith(r.prefix));
    if (!matching.length) return null;
    const t = now();
    prune(t);
    let worst: Verdict | null = null;
    for (const r of matching) {
      const key = `${r.prefix}|${r.windowMs}|${who}`;
      let h = hits.get(key);
      if (!h || t - h.start >= r.windowMs) {
        h = { start: t, count: 0 };
        hits.set(key, h);
      }
      h.count++;
      const v: Verdict = {
        ok: h.count <= r.limit,
        limit: r.limit,
        remaining: Math.max(0, r.limit - h.count),
        retryAfterS: Math.max(1, Math.ceil((h.start + r.windowMs - t) / 1000)),
      };
      if (!worst || (!v.ok && worst.ok) || (v.ok === worst.ok && v.remaining < worst.remaining)) worst = v;
    }
    return worst;
  };
}

/** The visitor's address as Vercel reports it. Vercel overwrites these headers, so clients can't forge them there. */
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
