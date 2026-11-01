"""Core pricing math. Pure functions, no I/O, so every number is testable.

Definitions (see README "Method"):

- k is a token's shares-per-token multiplier. Ondo tokens reinvest dividends,
  so one token slowly becomes worth slightly more than one share (k > 1).
  xStocks and fresh tokens have k = 1.
- premium  = venue_price / (k * reference_price) - 1
- spread   = max(per-share price) - min(per-share price) across venues
            at the same moment, also reported relative to the reference.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


class PriceError(ValueError):
    """Raised for prices or multipliers that cannot be used in a calculation."""


def _require_positive(name: str, value: float) -> None:
    if value is None or value <= 0:
        raise PriceError(f"{name} must be a positive number, got {value!r}")


def per_share(venue_price: float, k: float = 1.0) -> float:
    """Convert a token price to the price of one underlying share."""
    _require_positive("venue_price", venue_price)
    _require_positive("k", k)
    return venue_price / k


def premium(venue_price: float, reference_price: float, k: float = 1.0) -> float:
    """Fractional premium (+) or discount (-) of a venue versus the reference.

    0.012 means the venue charges 1.2% more per share than Nasdaq.
    """
    _require_positive("reference_price", reference_price)
    return per_share(venue_price, k) / reference_price - 1.0


@dataclass(frozen=True)
class VenueQuote:
    venue: str
    price: float
    k: float = 1.0


@dataclass(frozen=True)
class Spread:
    cheapest: str
    priciest: str
    absolute: float  # dollars per share
    relative: float  # fraction of the reference price


def spread(quotes: Iterable[VenueQuote], reference_price: float) -> Spread:
    """Gap between the cheapest and most expensive venue at one moment."""
    _require_positive("reference_price", reference_price)
    priced = [(q.venue, per_share(q.price, q.k)) for q in quotes]
    if len(priced) < 2:
        raise PriceError("spread needs quotes from at least two venues")
    cheapest = min(priced, key=lambda item: item[1])
    priciest = max(priced, key=lambda item: item[1])
    absolute = priciest[1] - cheapest[1]
    return Spread(
        cheapest=cheapest[0],
        priciest=priciest[0],
        absolute=absolute,
        relative=absolute / reference_price,
    )
