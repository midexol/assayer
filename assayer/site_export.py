"""Build the small JSON file the website reads, from the archived raw rounds.

Run:  python -m assayer.site_export <archive_dir>
Writes <archive_dir>/site/dashboard.json with the last 24 hours of rounds:
Nasdaq reference per ticker, and each venue's % over Nasdaq at $1,000 and
$10,000 for every round. Kept small (tens of KB) so the site loads it fast.
"""

from __future__ import annotations

import bisect
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from assayer import registry

MAX_ROUNDS = 288  # 24 hours of 5-minute rounds
NAMES = {"NVDA": "Nvidia", "TSLA": "Tesla", "AAPL": "Apple",
         "SPY": "S&P 500 ETF", "QQQ": "Nasdaq-100 ETF"}
SIZES = {1000: "a", 10000: "b"}


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _round_key(ts: str) -> str:
    """Bucket a timestamp into its 5-minute collection round, as YYYY-MM-DDTHH:MM."""
    t = datetime.fromisoformat(ts).astimezone(timezone.utc)
    return t.replace(minute=t.minute - t.minute % 5, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M")


def build(snapshots: list[dict], references: list[dict]) -> dict:
    tokens, _ = registry.load()
    issuer_of = {(t.chain, t.symbol): t.issuer for t in tokens}

    # Reference prices per ticker, sorted, so each quote uses the latest
    # Nasdaq price collected at or before it.
    refs: dict[str, tuple[list[str], list[dict]]] = {}
    for row in sorted(references, key=lambda r: r["ts"]):
        times, rows = refs.setdefault(row["ticker"], ([], []))
        times.append(row["ts"])
        rows.append(row)

    def ref_at(ticker: str, ts: str) -> dict | None:
        if ticker not in refs:
            return None
        times, rows = refs[ticker]
        i = bisect.bisect_right(times, ts) - 1
        return rows[i] if i >= 0 else None

    buys = [s for s in snapshots if s["side"] == "buy" and s["size_usd"] in SIZES]
    rounds = sorted({_round_key(s["ts"]) for s in buys})[-MAX_ROUNDS:]
    index = {r: i for i, r in enumerate(rounds)}

    stocks: dict[str, dict] = {}
    for s in buys:
        key = _round_key(s["ts"])
        if key not in index:
            continue
        ref = ref_at(s["ticker"], s["ts"])
        if not ref:
            continue
        stock = stocks.setdefault(s["ticker"], {"name": NAMES.get(s["ticker"], s["ticker"]), "venues": {}})
        venue_id = f"{s['chain']}:{s['symbol']}"
        venue = stock["venues"].setdefault(venue_id, {
            "id": venue_id, "symbol": s["symbol"], "chain": s["chain"],
            "issuer": issuer_of.get((s["chain"], s["symbol"])) or ("xStocks" if s["symbol"].endswith("x") else "Ondo"),
            "a": [None] * len(rounds), "b": [None] * len(rounds), "ap": None, "bp": None,
        })
        size = SIZES[s["size_usd"]]
        venue[size][index[key]] = round((s["fill_price"] / ref["price"] - 1) * 100, 3)
        if index[key] == len(rounds) - 1:
            venue[size + "p"] = s["fill_price"]

    for ticker, stock in stocks.items():
        latest = ref_at(ticker, "9999")
        stock["ref"] = latest["price"] if latest else None
        stock["venues"] = sorted(stock["venues"].values(), key=lambda v: v["id"])

    latest_ref = max(references, key=lambda r: r["ts"]) if references else None
    return {
        "updated": rounds[-1] + "Z" if rounds else None,
        "market_open": bool(latest_ref and latest_ref["market_open"]),
        "rounds": [r[11:] for r in rounds],
        "stocks": stocks,
    }


def export(archive_dir: Path, now: datetime | None = None) -> Path:
    now = now or datetime.now(timezone.utc)
    days = [(now - timedelta(days=d)).strftime("%Y-%m-%d") for d in (1, 0)]
    snapshots, references = [], []
    for day in days:
        snapshots += _read_jsonl(archive_dir / "raw" / day / "snapshots.jsonl")
        references += _read_jsonl(archive_dir / "raw" / day / "reference_prices.jsonl")
    out = archive_dir / "site" / "dashboard.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(build(snapshots, references), separators=(",", ":")), encoding="utf-8")
    return out


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m assayer.site_export <archive_dir>", file=sys.stderr)
        return 2
    path = export(Path(argv[0]))
    print(f"site: wrote {path} ({path.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
