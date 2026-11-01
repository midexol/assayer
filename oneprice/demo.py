"""Offline demo: runs without API keys or a database.

Reads data/snapshot/ (real collected data, exported daily once collection
runs). Until the first snapshot exists it reports the registry coverage and
says plainly that no measured data is available yet.
"""

from __future__ import annotations

import json
from pathlib import Path

from oneprice import registry

SNAPSHOT_DIR = Path(__file__).resolve().parent.parent / "data" / "snapshot"


def main() -> int:
    tokens, skipped = registry.load()
    print(f"Token registry: {len(tokens)} usable venues across "
          f"{len(registry.tickers(tokens))} tickers ({', '.join(registry.tickers(tokens))})")
    for reason in skipped:
        print(f"  skipped: {reason}")

    reference = SNAPSHOT_DIR / "reference_prices.jsonl"
    if not reference.exists():
        print("\nNo snapshot yet: data/snapshot/ is filled once live collection has run.")
        print("No measured prices to show yet.")
        return 0

    rows = [json.loads(line) for line in reference.read_text().splitlines() if line]
    print(f"\nReference prices in snapshot: {len(rows)} rows")
    latest: dict[str, dict] = {}
    for row in rows:
        latest[row["ticker"]] = row
    for ticker, row in sorted(latest.items()):
        state = "open" if row["market_open"] else "closed"
        print(f"  {ticker:5} ${row['price']:>10.2f}  at {row['quote_ts']}  (market {state})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
