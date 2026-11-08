import { describe, expect, it } from "vitest";
import { bestVenue, latest, pct, ranked, spread, symlog, type Dashboard, type Venue } from "./assay";

const venue = (id: string, issuer: string, a: (number | null)[], ap = 100): Venue => {
  const [chain, symbol] = id.split(":");
  return { id, chain, symbol, issuer, a, b: a.map(() => null), ap, bp: null };
};

const d: Dashboard = {
  updated: "2026-11-04T00:30Z",
  market_open: false,
  rounds: ["00:25", "00:30"],
  stocks: {
    NVDA: {
      name: "Nvidia",
      ref: 200,
      venues: [venue("solana:NVDAon", "Ondo", [110, 109]), venue("solana:NVDAx", "xStocks", [0.2, null], 201)],
    },
  },
};

describe("assay helpers", () => {
  it("uses the last non-empty round", () => {
    expect(latest(d.stocks.NVDA.venues[1], "a")).toBe(0.2);
    expect(latest(d.stocks.NVDA.venues[1], "b")).toBeNull();
  });

  it("ranks cheapest first and measures the spread", () => {
    expect(ranked(d.stocks.NVDA, "a").map((r) => r.venue.symbol)).toEqual(["NVDAx", "NVDAon"]);
    expect(spread(d.stocks.NVDA, "a")).toBeCloseTo(108.8);
    expect(spread(d.stocks.NVDA, "b")).toBeNull();
  });

  it("formats premiums", () => {
    expect(pct(0.152)).toBe("+0.15%");
    expect(pct(-1.25)).toBe("−1.25%");
    expect(pct(1884.8)).toBe("+1,885%");
  });

  it("keeps the log scale symmetric and bounded", () => {
    expect(symlog(0)).toBe(0);
    expect(symlog(-3)).toBeCloseTo(-symlog(3));
    expect(symlog(2000)).toBeCloseTo(1);
  });

  it("answers the agent question with the cheapest venue", () => {
    const ans = bestVenue(d, "NVDA", "a");
    expect(ans?.venue).toBe("NVDAx on Solana");
    expect(ans?.price).toBe(201);
    expect(bestVenue(d, "MSFT", "a")).toBeNull();
  });

  it("skips thin pools when asked", () => {
    const first = bestVenue(d, "NVDA", "a")!;
    const skipped = bestVenue(d, "NVDA", "a", new Set([`${d.stocks.NVDA.venues.find((v) => v.symbol === "NVDAx")!.id}`]));
    expect(skipped?.venue).not.toBe(first.venue);
    expect(bestVenue(d, "NVDA", "a", new Set(d.stocks.NVDA.venues.map((v) => v.id)))).toBeNull();
  });
});
