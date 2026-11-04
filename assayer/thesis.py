"""The thesis numbers: what splitting one stock across many chains costs a trader.

Run:  python -m assayer.thesis <archive_dir>
Reads every archived round in <archive_dir>/raw/ and writes <archive_dir>/site/thesis.json.

Definitions (all on buys, all in percentage points of the Nasdaq price):

premium            fill price / Nasdaq - 1, for one venue in one round.
spread             dearest venue's premium - cheapest venue's premium, in one round.
fragmentation tax  how much more a buyer pays at a venue than at the cheapest venue that
                   round, averaged over every venue: what not knowing where to trade costs.
router savings     how much less a buyer pays by picking the cheapest venue every round,
                   instead of always using the venue that is cheapest on median.
round-trip cost    buy premium - sell premium at the same venue and size: the cost of
                   buying and selling straight back.
gap lifespan       how long, in consecutive rounds, the spread between usable venues stays
                   above GAP_POINTS.

Usable venues exclude thin pools: venues whose median premium at that trade size is more
than THIN_POINTS away from Nasdaq. Their prices are reported, never hidden, but they would
swamp every average, so headline numbers are given with and without them.

Only rounds while Nasdaq is open count, because a closed market's last price goes stale.
"""

from __future__ import annotations

import bisect
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

from assayer.site_export import NAMES, _read_jsonl, _round_key

SIZES = (1000, 10000)
THIN_POINTS = 5.0
GAP_POINTS = 0.5
ROUND_MINUTES = 5


def _median(xs: list[float]) -> float | None:
    return round(statistics.median(xs), 4) if xs else None


def _mean(xs: list[float]) -> float | None:
    return round(statistics.fmean(xs), 4) if xs else None


def premiums(snapshots: list[dict], references: list[dict]) -> dict:
    """{(ticker, size, side): {round: {venue_id: premium}}} plus {round: market_open}."""
    refs: dict[str, tuple[list[str], list[dict]]] = {}
    for row in sorted(references, key=lambda r: r["ts"]):
        times, rows = refs.setdefault(row["ticker"], ([], []))
        times.append(row["ts"])
        rows.append(row)

    table: dict[tuple, dict[str, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
    open_by_round: dict[str, bool] = {}
    for s in snapshots:
        if s["size_usd"] not in SIZES or s["ticker"] not in refs:
            continue
        times, rows = refs[s["ticker"]]
        i = bisect.bisect_right(times, s["ts"]) - 1
        if i < 0:
            continue
        ref = rows[i]
        key = _round_key(s["ts"])
        open_by_round[key] = open_by_round.get(key, False) or bool(ref["market_open"])
        venue = f"{s['chain']}:{s['symbol']}"
        table[(s["ticker"], s["size_usd"], s["side"])][key][venue] = (s["fill_price"] / ref["price"] - 1) * 100
    return {"table": table, "open": open_by_round}


def _runs(flags: list[bool]) -> list[int]:
    runs, n = [], 0
    for f in flags:
        if f:
            n += 1
        elif n:
            runs.append(n)
            n = 0
    if n:
        runs.append(n)
    return runs


def stock_thesis(buys: dict[str, dict[str, float]], sells: dict[str, dict[str, float]], rounds: list[str]) -> dict:
    """Thesis numbers for one stock at one size, over the given rounds."""
    venues = sorted({v for r in rounds for v in buys.get(r, {})})
    median_premium = {v: _median([buys[r][v] for r in rounds if v in buys.get(r, {})]) for v in venues}
    thin = {v for v, p in median_premium.items() if p is not None and abs(p) > THIN_POINTS}
    usable = [v for v in venues if v not in thin]

    def per_round(pool: list[str]):
        spreads, taxes, savings, gaps = [], [], [], []
        static = min((v for v in pool if median_premium[v] is not None), key=lambda v: median_premium[v], default=None)
        for r in rounds:
            ps = {v: p for v, p in buys.get(r, {}).items() if v in pool}
            if len(ps) < 2:
                gaps.append(False)
                continue
            best = min(ps.values())
            spreads.append(max(ps.values()) - best)
            taxes.append(statistics.fmean(p - best for p in ps.values()))
            if static in ps:
                savings.append(ps[static] - best)
            gaps.append(max(ps.values()) - best > GAP_POINTS)
        runs = _runs(gaps)
        return {
            "rounds": len(spreads),
            "spread_median": _median(spreads),
            "spread_max": round(max(spreads), 4) if spreads else None,
            "tax_mean": _mean(taxes),
            "tax_median": _median(taxes),
            "best_static_venue": static,
            "router_savings_mean": _mean(savings),
            "router_beats_static_share": round(sum(s > 1e-9 for s in savings) / len(savings), 4) if savings else None,
            "gaps": len(runs),
            "gap_minutes_median": _median([n * ROUND_MINUTES for n in runs]),
            "gap_minutes_max": max(runs) * ROUND_MINUTES if runs else None,
        }

    round_trip = {}
    for v in venues:
        legs = [buys[r][v] - sells[r][v] for r in rounds if v in buys.get(r, {}) and v in sells.get(r, {})]
        round_trip[v] = _median(legs)

    return {
        "venues": [
            {"id": v, "median_premium": median_premium[v], "round_trip_median": round_trip[v], "thin": v in thin}
            for v in venues
        ],
        "all_venues": per_round(venues),
        "usable_venues": per_round(usable),
    }


def build(snapshots: list[dict], references: list[dict]) -> dict:
    p = premiums(snapshots, references)
    table, open_by_round = p["table"], p["open"]
    all_rounds = sorted(open_by_round)
    open_rounds = [r for r in all_rounds if open_by_round[r]]
    use_open = len(open_rounds) > 0
    rounds = open_rounds if use_open else all_rounds

    stocks: dict[str, dict] = {}
    for ticker in sorted({k[0] for k in table}):
        stocks[ticker] = {"name": NAMES.get(ticker, ticker)}
        for size in SIZES:
            stocks[ticker][str(size)] = stock_thesis(
                table.get((ticker, size, "buy"), {}), table.get((ticker, size, "sell"), {}), rounds
            )

    # Headline: across all stocks at each size, on usable venues.
    headline = {}
    for size in SIZES:
        u = [s[str(size)]["usable_venues"] for s in stocks.values()]
        a = [s[str(size)]["all_venues"] for s in stocks.values()]
        headline[str(size)] = {
            "spread_median": _median([x["spread_median"] for x in u if x["spread_median"] is not None]),
            "tax_mean": _mean([x["tax_mean"] for x in u if x["tax_mean"] is not None]),
            "tax_mean_all_venues": _mean([x["tax_mean"] for x in a if x["tax_mean"] is not None]),
            "router_savings_mean": _mean([x["router_savings_mean"] for x in u if x["router_savings_mean"] is not None]),
            "thin_venues": sum(v["thin"] for s in stocks.values() for v in s[str(size)]["venues"]),
            "venues": sum(len(s[str(size)]["venues"]) for s in stocks.values()),
        }

    return {
        "from": all_rounds[0] + "Z" if all_rounds else None,
        "to": all_rounds[-1] + "Z" if all_rounds else None,
        "rounds_total": len(all_rounds),
        "rounds_used": len(rounds),
        "market_open_only": use_open,
        "thin_points": THIN_POINTS,
        "gap_points": GAP_POINTS,
        "headline": headline,
        "stocks": stocks,
    }


def export(archive_dir: Path) -> Path:
    snapshots, references = [], []
    for day in sorted((archive_dir / "raw").glob("*/")):
        snapshots += _read_jsonl(day / "snapshots.jsonl")
        references += _read_jsonl(day / "reference_prices.jsonl")
    out = archive_dir / "site" / "thesis.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(build(snapshots, references), separators=(",", ":")), encoding="utf-8")
    return out


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m assayer.thesis <archive_dir>", file=sys.stderr)
        return 2
    path = export(Path(argv[0]))
    print(f"thesis: wrote {path} ({path.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
