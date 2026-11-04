import { describe, expect, it } from "vitest";
import { checkSettlement, createInvoice, makeToken, payConfig, PRICE_UNITS, readToken, USDC_NEAR } from "./payment";
import { aiReason, plainReason } from "./reason";

const cfg = { recipient: "assayer.near", secret: "s".repeat(32), priceAsset: USDC_NEAR };
const q = { ticker: "NVDA", size_usd: 10000 };
const T0 = Date.parse("2026-11-04T12:00:00Z");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("payConfig", () => {
  it("needs an account and a long secret", () => {
    expect(payConfig({})).toBeNull();
    expect(payConfig({ ASSAYER_NEAR_ACCOUNT: "a.near", PAYMENT_SECRET: "short" })).toBeNull();
    expect(payConfig({ ASSAYER_NEAR_ACCOUNT: "a.near", PAYMENT_SECRET: "x".repeat(16) })?.priceAsset).toBe(USDC_NEAR);
  });
});

describe("payment tokens", () => {
  it("round-trips for the same question", () => {
    const t = makeToken(cfg.secret, "dep1", q, T0);
    expect(readToken(cfg.secret, t, q, T0 + 1000)).toEqual({ ok: true, depositAddress: "dep1" });
  });

  it("rejects another question, a forged token and an expired one", () => {
    const t = makeToken(cfg.secret, "dep1", q, T0);
    expect(readToken(cfg.secret, t, { ticker: "TSLA", size_usd: 10000 }, T0).ok).toBe(false);
    expect(readToken("other-secret-xxxxxxxx", t, q, T0).ok).toBe(false);
    expect(readToken(cfg.secret, t, q, T0 + 3 * 3600_000).ok).toBe(false);
    const [body] = t.split(".");
    expect(readToken(cfg.secret, `${body}.AAAA`, q, T0).ok).toBe(false);
    expect(readToken(cfg.secret, "garbage", q, T0).ok).toBe(false);
  });
});

describe("createInvoice", () => {
  it("asks 1Click for an exact 0.25 USDC to Assayer and signs the deposit address", async () => {
    let sent: Record<string, unknown> = {};
    const f = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return json({ quote: { depositAddress: "0xDEP", amountIn: "251000", amountInFormatted: "0.251", deadline: "2026-11-04T12:30:00Z", timeEstimate: 20 } });
    }) as unknown as typeof fetch;
    const inv = await createInvoice(cfg, { asset: "nep141:arb-usdc", refund_to: "0xBOT" }, q, f, T0);
    expect(sent).toMatchObject({
      dry: false,
      swapType: "EXACT_OUTPUT",
      originAsset: "nep141:arb-usdc",
      destinationAsset: USDC_NEAR,
      amount: PRICE_UNITS,
      recipient: "assayer.near",
      refundTo: "0xBOT",
    });
    expect(inv.deposit_address).toBe("0xDEP");
    expect(readToken(cfg.secret, inv.payment_token, q, T0)).toEqual({ ok: true, depositAddress: "0xDEP" });
  });

  it("surfaces a 1Click error", async () => {
    const f = (async () => json({ message: "Amount is too low" }, 400)) as unknown as typeof fetch;
    await expect(createInvoice(cfg, { asset: "x", refund_to: "y" }, q, f, T0)).rejects.toThrow("Amount is too low");
  });
});

describe("checkSettlement", () => {
  const status = (s: string, recipient = "assayer.near", out = PRICE_UNITS) =>
    (async () =>
      json({
        status: s,
        swapDetails: { amountOut: out, destinationChainTxHashes: [{ hash: "h1", explorerUrl: "https://nearblocks.io/txns/h1" }] },
        quoteResponse: { quoteRequest: { recipient, destinationAsset: USDC_NEAR } },
      })) as unknown as typeof fetch;

  it("accepts a settled payment to Assayer", async () => {
    expect(await checkSettlement(cfg, "0xDEP", status("SUCCESS"))).toEqual({ paid: true, amountOut: PRICE_UNITS, txs: ["https://nearblocks.io/txns/h1"] });
  });

  it("waits while pending, and refuses refunds, other recipients and short payments", async () => {
    expect(await checkSettlement(cfg, "0xDEP", status("PROCESSING"))).toMatchObject({ paid: false, error: expect.stringContaining("not settled yet") });
    expect((await checkSettlement(cfg, "0xDEP", status("REFUNDED"))).paid).toBe(false);
    expect((await checkSettlement(cfg, "0xDEP", status("SUCCESS", "someone.near"))).paid).toBe(false);
    expect((await checkSettlement(cfg, "0xDEP", status("SUCCESS", "assayer.near", "100"))).paid).toBe(false);
  });
});

describe("reason", () => {
  const a = {
    ticker: "NVDA", side: "buy" as const, size_usd: 10000, venue: "NVDAx on Solana", issuer: "xStocks", chain: "Solana",
    price: 206.9, nasdaq: 206.6, over_nasdaq_pct: 0.168, round: "2026-11-04T12:00Z", market_open: true,
  };
  const others = [{ venue: "NVDAon on Ethereum", over_nasdaq_pct: 1.148 }];

  it("builds a plain sentence from the numbers", () => {
    expect(plainReason(a, others[0])).toBe("NVDAx on Solana was the cheapest place to buy $10,000, at +0.17% against Nasdaq. Next best was NVDAon on Ethereum, at +1.15%.");
  });

  it("uses the template without a key, and NEAR AI Cloud with one", async () => {
    expect((await aiReason(a, others, {})).source).toBe("template");
    let auth = "";
    const f = (async (_u: string, init: RequestInit) => {
      auth = (init.headers as Record<string, string>).authorization;
      return json({ choices: [{ message: { content: "<think>x</think>Solana's NVDAx is closest." } }] });
    }) as unknown as typeof fetch;
    const r = await aiReason(a, others, { NEARAI_API_KEY: "k" }, f);
    expect(auth).toBe("Bearer k");
    expect(r).toEqual({ text: "Solana's NVDAx is closest.", source: "near-ai-cloud", model: "zai-org/GLM-5.1-FP8" });
  });

  it("falls back when NEAR AI Cloud fails", async () => {
    const f = (async () => json({}, 500)) as unknown as typeof fetch;
    expect((await aiReason(a, others, { NEARAI_API_KEY: "k" }, f)).source).toBe("template");
  });
});
