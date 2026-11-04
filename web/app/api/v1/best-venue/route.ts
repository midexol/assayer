import { NextResponse } from "next/server";
import { bestVenue, chainName, ranked, type Size } from "@/lib/assay";
import { loadDashboard } from "@/lib/data";
import { checkSettlement, createInvoice, payConfig, readToken, type PayWith } from "@/lib/payment";
import { aiReason, plainReason } from "@/lib/reason";

export const dynamic = "force-dynamic";

const PRICE = { amount: "0.25", asset: "USDC on NEAR", settled_through: "NEAR Intents 1Click" };
const HOW_TO_PAY = [
  "1. POST this request again with pay_with: { asset, refund_to }. asset is any NEAR Intents asset id (list: https://1click.chaindefuser.com/v0/tokens); refund_to is your address on that chain.",
  "2. Send amount_in of that asset to deposit_address.",
  "3. POST this request again with payment_token. Once the deposit settles you get the answer.",
];

interface Body {
  ticker?: string;
  side?: string;
  size_usd?: number;
  preview?: boolean;
  pay_with?: PayWith;
  payment_token?: string;
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * POST { ticker, side: "buy", size_usd: 1000 | 10000 }
 *   → 402 with the price and how to pay
 *   + pay_with: { asset, refund_to } → 402 with a NEAR Intents deposit address and payment_token
 *   + payment_token → 200 with the answer once the deposit has settled
 *   + preview: true → 200 with the answer free, marked unpaid, without the AI reason
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad('Send a JSON body such as {"ticker":"NVDA","side":"buy","size_usd":1000}.');
  }

  const ticker = String(body.ticker ?? "").toUpperCase();
  const size: Size | null = body.size_usd === 1000 ? "a" : body.size_usd === 10000 ? "b" : null;
  if ((body.side ?? "buy") !== "buy" || !size) return bad("Only buys of size_usd 1000 or 10000 are measured.");

  const data = await loadDashboard();
  if (!data.stocks[ticker]) return bad(`Unknown ticker. Try one of: ${Object.keys(data.stocks).join(", ")}.`, 404);
  const answer = bestVenue(data, ticker, size);
  if (!answer) return bad(`No venue priced ${ticker} in the latest round.`, 503);
  const others = ranked(data.stocks[ticker], size)
    .slice(1)
    .map((r) => ({ venue: `${r.venue.symbol} on ${chainName(r.venue.chain)}`, over_nasdaq_pct: r.premium }));
  const question = { ticker, size_usd: body.size_usd as number };

  if (body.preview) {
    return NextResponse.json({ paid: false, preview: true, ...answer, why: plainReason(answer, others[0]) });
  }

  const cfg = payConfig();
  if (!cfg) {
    return NextResponse.json(
      { price: PRICE, error: "Payments are not switched on for this deployment yet. Send preview: true for a free answer." },
      { status: 402 },
    );
  }

  if (body.payment_token) {
    const token = readToken(cfg.secret, body.payment_token, question);
    if (!token.ok) return NextResponse.json({ price: PRICE, error: token.error }, { status: 402 });
    let settled;
    try {
      settled = await checkSettlement(cfg, token.depositAddress);
    } catch (e) {
      return NextResponse.json({ price: PRICE, error: e instanceof Error ? e.message : "Could not check the payment." }, { status: 502 });
    }
    if (!settled.paid) {
      return NextResponse.json({ price: PRICE, status: settled.status, error: settled.error }, { status: 402 });
    }
    const why = await aiReason(answer, others);
    return NextResponse.json({
      paid: true,
      ...answer,
      why: why.text,
      why_source: why.source,
      ...(why.model ? { model: why.model } : {}),
      payment: { deposit_address: token.depositAddress, settled_usdc_units: settled.amountOut, txs: settled.txs },
    });
  }

  if (body.pay_with?.asset && body.pay_with?.refund_to) {
    try {
      const invoice = await createInvoice(cfg, body.pay_with, question);
      return NextResponse.json({ price: PRICE, invoice, next: HOW_TO_PAY.slice(1) }, { status: 402 });
    } catch (e) {
      return NextResponse.json({ price: PRICE, error: e instanceof Error ? e.message : "Could not create a quote." }, { status: 502 });
    }
  }

  return NextResponse.json({ price: PRICE, how_to_pay: HOW_TO_PAY }, { status: 402 });
}
