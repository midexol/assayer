"""Nasdaq reference prices from Finnhub: the 'one fair price' every venue is measured against.

Run:  python -m oneprice.collect.reference
Needs FINNHUB_KEY. Writes to Postgres when DATABASE_URL is set, otherwise to
data/local/reference_prices.jsonl.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone

import requests

from oneprice import registry, storage

FINNHUB_BASE = "https://finnhub.io/api/v1"
TIMEOUT_SECONDS = 15


@dataclass(frozen=True)
class ReferencePrice:
    ts: datetime
    ticker: str
    price: float
    quote_ts: datetime
    market_open: bool
    source: str = "finnhub"

    def as_row(self) -> dict:
        return {
            "ts": self.ts.isoformat(),
            "ticker": self.ticker,
            "price": self.price,
            "quote_ts": self.quote_ts.isoformat(),
            "market_open": self.market_open,
            "source": self.source,
        }


class QuoteError(RuntimeError):
    pass


def parse_quote(ticker: str, body: dict, market_open: bool, now: datetime) -> ReferencePrice:
    """Turn a Finnhub /quote response into a ReferencePrice.

    Finnhub answers an unknown symbol with c=0 and t=0 instead of an error,
    so a zero price is treated as a failure rather than stored.
    """
    price = body.get("c")
    quote_unix = body.get("t")
    if not price or price <= 0 or not quote_unix:
        raise QuoteError(f"{ticker}: Finnhub returned no usable price: {body!r}")
    return ReferencePrice(
        ts=now,
        ticker=ticker,
        price=float(price),
        quote_ts=datetime.fromtimestamp(int(quote_unix), tz=timezone.utc),
        market_open=market_open,
    )


def _get(session: requests.Session, path: str, params: dict, key: str) -> dict:
    response = session.get(
        f"{FINNHUB_BASE}{path}",
        params={**params, "token": key},
        timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def fetch_all(key: str, now: datetime | None = None) -> tuple[list[ReferencePrice], list[str]]:
    now = now or datetime.now(timezone.utc)
    tokens, _ = registry.load()
    prices: list[ReferencePrice] = []
    errors: list[str] = []
    with requests.Session() as session:
        status = _get(session, "/stock/market-status", {"exchange": "US"}, key)
        market_open = bool(status.get("isOpen"))
        for ticker in registry.tickers(tokens):
            try:
                body = _get(session, "/quote", {"symbol": ticker}, key)
                prices.append(parse_quote(ticker, body, market_open, now))
            except (requests.RequestException, QuoteError) as error:
                errors.append(str(error))
    return prices, errors


def main() -> int:
    key = os.environ.get("FINNHUB_KEY")
    if not key:
        print("FINNHUB_KEY is not set", file=sys.stderr)
        return 2
    prices, errors = fetch_all(key)
    written = storage.write("reference_prices", [p.as_row() for p in prices])
    print(f"reference: wrote {written} prices to {storage.target()}")
    for error in errors:
        print(f"reference: {error}", file=sys.stderr)
    # Fail the run only if nothing was collected, so one bad ticker
    # does not stop the other four.
    return 0 if prices else 1


if __name__ == "__main__":
    raise SystemExit(main())
