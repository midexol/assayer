import { NextResponse } from "next/server";
import { bestVenue, type Size } from "@/lib/assay";
import { loadDashboard } from "@/lib/data";

const PRICE = { amount: "0.25", asset: "USDC" };

/**
 * POST { ticker, side: "buy", size_usd: 1000 | 10000, preview?: boolean }
 *
 * Without payment the API answers 402 with the price. NEAR Intents settlement
 * is not live yet, so `preview: true` returns the answer free and marks it.
 */
export async function POST(req: Request) {
  let body: { ticker?: string; side?: string; size_usd?: number; preview?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body such as {\"ticker\":\"NVDA\",\"side\":\"buy\",\"size_usd\":1000}." }, { status: 400 });
  }

  const ticker = String(body.ticker ?? "").toUpperCase();
  const size: Size | null = body.size_usd === 1000 ? "a" : body.size_usd === 10000 ? "b" : null;
  if ((body.side ?? "buy") !== "buy" || !size) {
    return NextResponse.json({ error: "Only buys of size_usd 1000 or 10000 are measured." }, { status: 400 });
  }

  const data = await loadDashboard();
  if (!data.stocks[ticker]) {
    return NextResponse.json({ error: `Unknown ticker. Try one of: ${Object.keys(data.stocks).join(", ")}.` }, { status: 404 });
  }

  if (!body.preview) {
    return NextResponse.json(
      {
        price: PRICE,
        pay_with: "Any token on any chain NEAR Intents supports",
        deposit_address: null,
        settlement: "NEAR Intents payments are being connected. Send preview: true for a free answer until then.",
      },
      { status: 402 },
    );
  }

  return NextResponse.json({ paid: false, preview: true, ...bestVenue(data, ticker, size) });
}
