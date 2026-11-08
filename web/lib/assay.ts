// Shapes of site/dashboard.json (written by assayer/site_export.py) and the
// pure helpers every page uses to read it.

export type Size = "a" | "b"; // a = $1,000 buy, b = $10,000 buy

export interface Venue {
  id: string; // "solana:NVDAx"
  symbol: string;
  chain: "solana" | "ethereum" | "bsc" | string;
  issuer: string;
  a: (number | null)[]; // % over Nasdaq per round
  b: (number | null)[];
  ap: number | null; // latest fill price per share
  bp: number | null;
}

export interface Stock {
  name: string;
  ref: number | null;
  venues: Venue[];
}

export interface Dashboard {
  updated: string | null; // "2026-11-04T00:30Z"
  market_open: boolean;
  rounds: string[]; // "HH:MM" UTC
  stocks: Record<string, Stock>;
}

export const SIZES: Record<Size, { label: string; usd: number }> = {
  a: { label: "$1,000", usd: 1000 },
  b: { label: "$10,000", usd: 10000 },
};

export const CHAIN_NAMES: Record<string, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  bsc: "BNB Chain",
  gate: "Gate.io",
};

// One column per issuer + chain, in a fixed order, with a fixed colour.
export const COLUMNS = [
  { key: "xStocks:solana", label: "xStocks on Solana", color: "#D6AE55" },
  { key: "Ondo:ethereum", label: "Ondo on Ethereum", color: "#7FA7D6" },
  { key: "Ondo:bsc", label: "Ondo on BNB Chain", color: "#B9A6E8" },
  { key: "Ondo:solana", label: "Ondo on Solana", color: "#E58363" },
  { key: "xStocks:gate", label: "xStocks on Gate.io", color: "#8FB8A8" },
] as const;

export const columnOf = (v: Venue) => `${v.issuer}:${v.chain}`;
export const colorOf = (v: Venue) => COLUMNS.find((c) => c.key === columnOf(v))?.color ?? "#F2EFE8";
export const chainName = (chain: string) => CHAIN_NAMES[chain] ?? chain;
export const venueName = (v: Venue) => `${v.symbol} on ${chainName(v.chain)}`;

/** The latest non-empty premium of a venue at a size. */
export function latest(v: Venue, size: Size): number | null {
  const s = v[size];
  for (let i = s.length - 1; i >= 0; i--) if (s[i] !== null) return s[i];
  return null;
}

/** Venues with a latest premium, cheapest first. */
export function ranked(stock: Stock, size: Size): { venue: Venue; premium: number }[] {
  return stock.venues
    .map((venue) => ({ venue, premium: latest(venue, size) }))
    .filter((r): r is { venue: Venue; premium: number } => r.premium !== null)
    .sort((x, y) => x.premium - y.premium);
}

/** Gap between the dearest and the cheapest venue, in percentage points. */
export function spread(stock: Stock, size: Size): number | null {
  const r = ranked(stock, size);
  return r.length < 2 ? null : r[r.length - 1].premium - r[0].premium;
}

// Symmetric log scale: keeps +0.1% and +1,000% readable on one axis.
const LIN = 0.05;
const TOP = 2000;
export const symlog = (p: number) => (Math.sign(p) * Math.log1p(Math.abs(p) / LIN)) / Math.log1p(TOP / LIN);

export const money = (v: number | null) =>
  v === null ? "None" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const pct = (p: number | null) =>
  p === null
    ? "None"
    : (p >= 0 ? "+" : "−") +
      (Math.abs(p) >= 100 ? Math.round(Math.abs(p)).toLocaleString("en-US") : Math.abs(p).toFixed(2)) +
      "%";

export const pts = (p: number | null) =>
  p === null ? "None" : (Math.abs(p) >= 100 ? Math.round(p).toLocaleString("en-US") : p.toFixed(2)) + " pts";

/** "1 pt or more over Nasdaq" is what the site calls dear. */
export const isDear = (p: number | null) => p !== null && p >= 1;

export function updatedLabel(d: Dashboard): string {
  if (!d.updated) return "No rounds yet";
  const t = new Date(d.updated.replace("Z", ":00Z"));
  return t.toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

/** The answer the Agent API sells: the cheapest venue for a ticker and size. */
export function bestVenue(d: Dashboard, ticker: string, size: Size, skip: ReadonlySet<string> = new Set()) {
  const stock = d.stocks[ticker];
  if (!stock) return null;
  const r = ranked(stock, size).filter((x) => !skip.has(x.venue.id));
  if (!r.length) return null;
  const { venue, premium } = r[0];
  return {
    ticker,
    side: "buy" as const,
    size_usd: SIZES[size].usd,
    venue: venueName(venue),
    issuer: venue.issuer,
    chain: chainName(venue.chain),
    price: size === "a" ? venue.ap : venue.bp,
    nasdaq: stock.ref,
    over_nasdaq_pct: premium,
    round: d.updated,
    market_open: d.market_open,
  };
}
