// Pay-per-answer through NEAR Intents 1Click (https://docs.near-intents.org).
//
// 1. A bot asks without paying, naming the token it wants to pay with and a refund address.
//    We ask 1Click for an EXACT_OUTPUT quote that delivers 0.25 USDC on NEAR to Assayer's
//    account, and answer 402 with the deposit address plus a signed payment token.
// 2. The bot sends the quoted amount to the deposit address, from any chain 1Click supports.
// 3. The bot asks again with the token. We check the token's signature, then ask 1Click
//    whether that deposit settled to our account for at least 0.25 USDC, and answer.
//
// The token binds one deposit to one question (ticker and size) until it expires, so no
// database is needed. Server-only: uses node:crypto and secrets from the environment.
import { createHmac, timingSafeEqual } from "node:crypto";

export const ONECLICK_URL = "https://1click.chaindefuser.com";
// USDC on NEAR, as a NEAR Intents asset id. Override with ASSAYER_PRICE_ASSET if it changes.
export const USDC_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
export const PRICE_UNITS = "250000"; // 0.25 USDC, 6 decimals
export const QUOTE_MINUTES = 30; // how long the deposit address stays usable
export const TOKEN_HOURS = 2; // how long a paid answer can be fetched

export interface PayConfig {
  recipient: string; // Assayer's NEAR account that receives the USDC
  secret: string; // signs payment tokens
  apiKey?: string; // optional 1Click key: lower fees
  priceAsset: string;
}

export function payConfig(env: Record<string, string | undefined> = process.env): PayConfig | null {
  const recipient = env.ASSAYER_NEAR_ACCOUNT?.trim();
  const secret = env.PAYMENT_SECRET?.trim();
  if (!recipient || !secret || secret.length < 16) return null;
  return { recipient, secret, apiKey: env.ONECLICK_API_KEY?.trim() || undefined, priceAsset: env.ASSAYER_PRICE_ASSET?.trim() || USDC_NEAR };
}

export interface PayWith {
  asset: string; // NEAR Intents asset id, e.g. "nep141:arb-0xaf88...omft.near" for USDC on Arbitrum
  refund_to: string; // address on the origin chain for refunds
}

export interface Question {
  ticker: string;
  size_usd: number;
}

// ---------- payment tokens ----------

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString();

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function makeToken(secret: string, depositAddress: string, q: Question, now = Date.now()): string {
  const body = JSON.stringify({ d: depositAddress, t: q.ticker, s: q.size_usd, e: now + TOKEN_HOURS * 3600_000 });
  return `${b64(body)}.${sign(secret, body)}`;
}

export type TokenCheck = { ok: true; depositAddress: string } | { ok: false; error: string };

export function readToken(secret: string, token: string, q: Question, now = Date.now()): TokenCheck {
  const [part, mac] = String(token).split(".");
  if (!part || !mac) return { ok: false, error: "The payment token is malformed." };
  let body: string;
  try {
    body = unb64(part);
  } catch {
    return { ok: false, error: "The payment token is malformed." };
  }
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, error: "The payment token was not issued by this server." };
  }
  const t = JSON.parse(body) as { d: string; t: string; s: number; e: number };
  if (t.e < now) return { ok: false, error: "The payment token has expired. Ask for a new quote." };
  if (t.t !== q.ticker || t.s !== q.size_usd) {
    return { ok: false, error: `This payment was for ${t.t} at $${t.s.toLocaleString("en-US")}. Ask the same question, or pay again.` };
  }
  return { ok: true, depositAddress: t.d };
}

// ---------- 1Click ----------

type Fetch = typeof fetch;

/** fetch, with network failures turned into a message a bot can act on. */
async function reach(f: Fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await f(url, init);
  } catch {
    throw new Error("Couldn't reach NEAR Intents just now. Try again in a few seconds.");
  }
}

function headers(cfg: PayConfig): Record<string, string> {
  return { "content-type": "application/json", ...(cfg.apiKey ? { "X-API-Key": cfg.apiKey } : {}) };
}

export interface Invoice {
  deposit_address: string;
  deposit_memo?: string;
  amount_in: string;
  amount_in_formatted: string;
  pay_asset: string;
  deadline: string;
  time_estimate_s: number;
  payment_token: string;
}

/** Ask 1Click for a deposit address that turns the bot's token into 0.25 USDC for Assayer. */
export async function createInvoice(cfg: PayConfig, payWith: PayWith, q: Question, f: Fetch = fetch, now = Date.now()): Promise<Invoice> {
  const res = await reach(f, `${ONECLICK_URL}/v0/quote`, {
    method: "POST",
    headers: headers(cfg),
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      dry: false,
      swapType: "EXACT_OUTPUT",
      slippageTolerance: 100,
      originAsset: payWith.asset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: cfg.priceAsset,
      amount: PRICE_UNITS,
      refundTo: payWith.refund_to,
      refundType: "ORIGIN_CHAIN",
      recipient: cfg.recipient,
      recipientType: "DESTINATION_CHAIN",
      deadline: new Date(now + QUOTE_MINUTES * 60_000).toISOString(),
      referral: "assayer",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    quote?: { depositAddress?: string; depositMemo?: string; amountIn: string; amountInFormatted: string; deadline?: string; timeEstimate: number };
    message?: string;
  };
  if (!res.ok || !body.quote?.depositAddress) {
    throw new Error(body.message ?? `1Click could not quote this payment (HTTP ${res.status}).`);
  }
  const quote = body.quote;
  const depositAddress = quote.depositAddress!;
  return {
    deposit_address: depositAddress,
    ...(quote.depositMemo ? { deposit_memo: quote.depositMemo } : {}),
    amount_in: quote.amountIn,
    amount_in_formatted: quote.amountInFormatted,
    pay_asset: payWith.asset,
    deadline: quote.deadline ?? new Date(now + QUOTE_MINUTES * 60_000).toISOString(),
    time_estimate_s: quote.timeEstimate,
    payment_token: makeToken(cfg.secret, depositAddress, q, now),
  };
}

export type Settlement = { paid: true; amountOut: string; txs: string[] } | { paid: false; status: string; error: string };

/** Ask 1Click whether the deposit has settled to Assayer's account for at least the price. */
export async function checkSettlement(cfg: PayConfig, depositAddress: string, f: Fetch = fetch): Promise<Settlement> {
  const res = await reach(f, `${ONECLICK_URL}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`, {
    headers: headers(cfg),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { paid: false, status: "UNKNOWN", error: `1Click status check failed (HTTP ${res.status}). Try again shortly.` };
  const s = (await res.json()) as {
    status: string;
    swapDetails?: { amountOut?: string; destinationChainTxHashes?: { hash: string; explorerUrl?: string }[] };
    quoteResponse?: { quoteRequest?: { recipient?: string; destinationAsset?: string } };
  };
  if (s.status !== "SUCCESS") {
    const waiting = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "INCOMPLETE_DEPOSIT"].includes(s.status);
    return {
      paid: false,
      status: s.status,
      error: waiting ? "Payment not settled yet. Ask again in a few seconds." : `Payment ${s.status.toLowerCase()}. Ask for a new quote.`,
    };
  }
  const req = s.quoteResponse?.quoteRequest;
  if (req?.recipient !== cfg.recipient || req?.destinationAsset !== cfg.priceAsset) {
    return { paid: false, status: s.status, error: "That deposit did not pay Assayer." };
  }
  const out = s.swapDetails?.amountOut ?? "0";
  if (BigInt(out) < BigInt(PRICE_UNITS)) return { paid: false, status: s.status, error: "That deposit paid less than the price." };
  return { paid: true, amountOut: out, txs: (s.swapDetails?.destinationChainTxHashes ?? []).map((t) => t.explorerUrl ?? t.hash) };
}
