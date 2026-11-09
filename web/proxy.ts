import { NextResponse, type NextRequest } from "next/server";
import { clientIp, createLimiter } from "@/lib/ratelimit";

const MINUTE = 60_000;

// The paid route makes quotes and checks payments with NEAR Intents, so it is the tightest.
// 30 a minute still lets an agent poll for its settlement every few seconds.
const take = createLimiter([
  { prefix: "/api/v1/best-venue", limit: 30, windowMs: MINUTE },
  { prefix: "/api/", limit: 60, windowMs: MINUTE },
]);

const MAX_BODY = 8_000;

export function proxy(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) {
    return NextResponse.json({ error: "That request is too large." }, { status: 413 });
  }
  const v = take(req.nextUrl.pathname, clientIp(req.headers));
  if (v && !v.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${v.retryAfterS} seconds.` },
      { status: 429, headers: { "retry-after": String(v.retryAfterS), "x-ratelimit-limit": String(v.limit), "x-ratelimit-remaining": "0" } },
    );
  }
  const res = NextResponse.next();
  if (v) {
    res.headers.set("x-ratelimit-limit", String(v.limit));
    res.headers.set("x-ratelimit-remaining", String(v.remaining));
  }
  return res;
}

export const config = { matcher: "/api/:path*" };
