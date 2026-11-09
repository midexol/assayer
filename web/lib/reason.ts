// A one-line reason for the Agent API's answer, written by a model on NEAR AI Cloud
// (OpenAI-compatible, https://docs.near.ai/cloud/quickstart). Falls back to a plain
// sentence built from the numbers when no key is set or the call fails.
import { pct, type bestVenue } from "./assay";

type Answer = NonNullable<ReturnType<typeof bestVenue>>;

export const NEARAI_URL = "https://cloud-api.near.ai/v1/chat/completions";
export const DEFAULT_MODEL = "z-ai/glm-5.3-flash";

export function plainReason(a: Answer, runnerUp?: { venue: string; over_nasdaq_pct: number }): string {
  const base = `${a.venue} was the cheapest place to buy $${a.size_usd.toLocaleString("en-US")}, at ${pct(a.over_nasdaq_pct)} against Nasdaq`;
  const vs = runnerUp ? `. Next best was ${runnerUp.venue}, at ${pct(runnerUp.over_nasdaq_pct)}` : "";
  const when = a.market_open ? "" : ". Nasdaq is closed, so this compares with its last price";
  return `${base}${vs}${when}.`;
}

export async function aiReason(
  a: Answer,
  others: { venue: string; over_nasdaq_pct: number }[],
  env: Record<string, string | undefined> = process.env,
  f: typeof fetch = fetch,
): Promise<{ text: string; source: "near-ai-cloud" | "template"; model?: string }> {
  const fallback = { text: plainReason(a, others[0]), source: "template" as const };
  const key = env.NEARAI_API_KEY?.trim();
  if (!key) return fallback;
  const model = env.NEARAI_MODEL?.trim() || DEFAULT_MODEL;
  const facts = {
    question: `Cheapest place to buy $${a.size_usd} of ${a.ticker}`,
    nasdaq_price: a.nasdaq,
    nasdaq_open: a.market_open,
    best: { venue: a.venue, price: a.price, over_nasdaq_pct: a.over_nasdaq_pct },
    others,
  };
  try {
    const res = await f(NEARAI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model,
        max_tokens: 400,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You explain tokenized-stock prices to a trading bot. Reply with one plain sentence under 35 words: why the best venue is the best choice and how much it saves versus the next one. Use only the numbers given. No advice, no hedging.",
          },
          { role: "user", content: JSON.stringify(facts) },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return text ? { text, source: "near-ai-cloud", model } : fallback;
  } catch {
    return fallback;
  }
}
