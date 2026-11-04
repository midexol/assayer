// Shape of site/thesis.json, written by assayer/thesis.py each round.
import sample from "./sample-thesis.json";
import { THESIS_URL } from "./urls";

export interface PoolStats {
  rounds: number;
  spread_median: number | null;
  spread_max: number | null;
  tax_mean: number | null;
  tax_median: number | null;
  best_static_venue: string | null;
  router_savings_mean: number | null;
  router_beats_static_share: number | null;
  gaps: number;
  gap_minutes_median: number | null;
  gap_minutes_max: number | null;
}

export interface SizeThesis {
  venues: { id: string; median_premium: number | null; round_trip_median: number | null; thin: boolean }[];
  all_venues: PoolStats;
  usable_venues: PoolStats;
}

export interface Thesis {
  from: string | null;
  to: string | null;
  rounds_total: number;
  rounds_used: number;
  market_open_only: boolean;
  thin_points: number;
  gap_points: number;
  headline: Record<
    "1000" | "10000",
    {
      spread_median: number | null;
      tax_mean: number | null;
      tax_mean_all_venues: number | null;
      router_savings_mean: number | null;
      thin_venues: number;
      venues: number;
    }
  >;
  stocks: Record<string, { name: string } & Record<"1000" | "10000", SizeThesis>>;
}

export const SAMPLE_THESIS = sample as unknown as Thesis;

export async function loadThesis(): Promise<Thesis> {
  try {
    const res = await fetch(THESIS_URL, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const t = (await res.json()) as Thesis;
    if (!t.headline) throw new Error("empty");
    return t;
  } catch {
    return SAMPLE_THESIS;
  }
}

/** Percentage points of a trade, as dollars on that trade. */
export const dollars = (points: number | null, sizeUsd: number) =>
  points === null
    ? "None"
    : (points * sizeUsd) / 100 >= 100
      ? "$" + Math.round((points * sizeUsd) / 100).toLocaleString("en-US")
      : "$" + ((points * sizeUsd) / 100).toFixed(2);

/** "solana:NVDAx" → "NVDAx on Solana" */
export function venueLabel(id: string | null): string {
  if (!id) return "None";
  const [chain, symbol] = id.split(":");
  const names: Record<string, string> = { solana: "Solana", ethereum: "Ethereum", bsc: "BNB Chain", gate: "Gate.io" };
  return `${symbol} on ${names[chain] ?? chain}`;
}
