"""Quote xStocks on Gate.io, a centralized exchange, by walking its public order book.

Same rows as the on-chain collector: for each size, a buy that spends $1,000 or $10,000
of USDT (counted at $1), and a sell of exactly the shares that buy received. Fill price
is USDT per share. Gate.io is the one exchange we found that lists all five xStocks and
answers from GitHub's US runners (Bybit blocks them; Kraken and Bitget don't list them).

Run:  python -m assayer.collect.cex
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone

import requests

from assayer import storage
from assayer.collect.quotes import SIZES_USD

GATE_BOOK = "https://api.gateio.ws/api/v4/spot/order_book"
DEPTH = 100
TIMEOUT_SECONDS = 20
VENUE = "gate"
TICKERS = ("NVDA", "TSLA", "AAPL", "SPY", "QQQ")


class BookTooThin(Exception):
    """The visible order book can't fill the whole trade."""


def buy_with(asks: list[tuple[float, float]], usd: float) -> float:
    """Shares received for spending `usd`, walking asks from the best price up."""
    shares, left = 0.0, usd
    for price, size in asks:
        cost = price * size
        if cost >= left:
            return shares + left / price
        shares += size
        left -= cost
    raise BookTooThin(f"asks hold only ${usd - left:,.0f} of the ${usd:,.0f} needed")


def sell(bids: list[tuple[float, float]], shares: float) -> float:
    """USDT received for selling `shares`, walking bids from the best price down."""
    usd, left = 0.0, shares
    for price, size in bids:
        if size >= left:
            return usd + left * price
        usd += price * size
        left -= size
    raise BookTooThin(f"bids hold only {shares - left:.4f} of {shares:.4f} shares")


def parse_book(body: dict) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    if not isinstance(body, dict) or "asks" not in body or "bids" not in body:
        raise ValueError(f"unexpected order book: {str(body)[:200]}")
    asks = sorted((float(p), float(s)) for p, s in body["asks"])
    bids = sorted(((float(p), float(s)) for p, s in body["bids"]), reverse=True)
    return asks, bids


def rows_for(ticker: str, asks, bids, now: datetime) -> list[dict]:
    rows = []
    for size in SIZES_USD:
        shares = buy_with(asks, size)
        proceeds = sell(bids, shares)
        for side, price in (("buy", size / shares), ("sell", proceeds / shares)):
            rows.append({
                "ts": now.isoformat(), "ticker": ticker, "venue": VENUE, "chain": VENUE,
                "symbol": f"{ticker}x", "side": side, "size_usd": size,
                "fill_price": round(price, 6), "k_mult": 1,
            })
    return rows


def collect(now: datetime | None = None, session: requests.Session | None = None) -> tuple[list[dict], list[dict]]:
    now = now or datetime.now(timezone.utc)
    session = session or requests.Session()
    rows, errors = [], []
    for ticker in TICKERS:
        try:
            r = session.get(GATE_BOOK, params={"currency_pair": f"{ticker}X_USDT", "limit": DEPTH}, timeout=TIMEOUT_SECONDS)
            r.raise_for_status()
            asks, bids = parse_book(r.json())
            rows.extend(rows_for(ticker, asks, bids, now))
        except Exception as error:  # one bad market must never stop the others
            errors.append({"ts": now.isoformat(), "source": "cex", "venue_id": f"{VENUE}:{ticker}x",
                           "error": f"{type(error).__name__}: {error}"[:500]})
    return rows, errors


def main() -> int:
    rows, errors = collect()
    written = storage.write("snapshots", rows)
    storage.write("collect_errors", errors)
    print(f"cex: wrote {written} rows to {storage.target()}, {len(errors)} markets failed")
    for error in errors:
        print(f"cex: {error['venue_id']}: {error['error']}", file=sys.stderr)
    return 0 if rows else 1


if __name__ == "__main__":
    raise SystemExit(main())
