import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sample from "@/lib/sample.json";
import { makeToken, USDC_NEAR } from "@/lib/payment";
import { POST } from "./route";

const SECRET = "test-secret-0123456789";
const ask = (body: unknown) => POST(new Request("http://x/api/v1/best-venue", { method: "POST", body: JSON.stringify(body) }));

/** Fake network: the data file, 1Click quote and status, NEAR AI Cloud. */
function network(status = "SUCCESS") {
  return vi.fn(async (url: string) => {
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.includes("dashboard.json")) return json(sample);
    if (url.endsWith("/v0/quote")) {
      return json({ quote: { depositAddress: "0xDEP", amountIn: "251000", amountInFormatted: "0.251", deadline: "2026-11-04T12:30:00Z", timeEstimate: 20 } });
    }
    if (url.includes("/v0/status")) {
      return json({
        status,
        swapDetails: { amountOut: "250000", destinationChainTxHashes: [{ hash: "h", explorerUrl: "https://nearblocks.io/txns/h" }] },
        quoteResponse: { quoteRequest: { recipient: "assayer.near", destinationAsset: USDC_NEAR } },
      });
    }
    if (url.includes("cloud-api.near.ai")) return json({ choices: [{ message: { content: "NVDAx on Solana is cheapest." } }] });
    return new Response("", { status: 404 });
  });
}

describe("POST /api/v1/best-venue", () => {
  beforeEach(() => {
    vi.stubEnv("ASSAYER_NEAR_ACCOUNT", "assayer.near");
    vi.stubEnv("PAYMENT_SECRET", SECRET);
    vi.stubEnv("NEARAI_API_KEY", "k");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("walks the whole paid flow: 402, invoice, then the answer with an AI reason", async () => {
    vi.stubGlobal("fetch", network());
    const q = { ticker: "NVDA", side: "buy", size_usd: 10000 };

    const first = await ask(q);
    expect(first.status).toBe(402);
    expect((await first.json()).how_to_pay).toHaveLength(3);

    const second = await ask({ ...q, pay_with: { asset: "nep141:arb-usdc", refund_to: "0xBOT" } });
    expect(second.status).toBe(402);
    const { invoice } = await second.json();
    expect(invoice.deposit_address).toBe("0xDEP");

    const third = await ask({ ...q, payment_token: invoice.payment_token });
    expect(third.status).toBe(200);
    const answer = await third.json();
    expect(answer).toMatchObject({ paid: true, ticker: "NVDA", why: "NVDAx on Solana is cheapest.", why_source: "near-ai-cloud" });
    expect(answer.payment.txs).toEqual(["https://nearblocks.io/txns/h"]);
  });

  it("keeps asking for payment until the deposit settles", async () => {
    vi.stubGlobal("fetch", network("PENDING_DEPOSIT"));
    const token = makeToken(SECRET, "0xDEP", { ticker: "NVDA", size_usd: 1000 });
    const res = await ask({ ticker: "NVDA", size_usd: 1000, payment_token: token });
    expect(res.status).toBe(402);
    expect((await res.json()).status).toBe("PENDING_DEPOSIT");
  });

  it("says payments are off when the server has no account set", async () => {
    vi.stubEnv("ASSAYER_NEAR_ACCOUNT", "");
    vi.stubGlobal("fetch", network());
    const res = await ask({ ticker: "NVDA", size_usd: 1000 });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toContain("not switched on");
  });
});
