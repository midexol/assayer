"""Executable on-chain quotes: what a real $1K or $10K trade would fill at, per venue.

For every token in the registry and every size:
  buy  = spend `size_usd` of the chain's stablecoin, see how many tokens come back
  sell = sell exactly those tokens back, see how much stablecoin comes back
fill_price is stablecoin per token (stablecoins are taken as $1).

Solana goes through Jupiter, Ethereum and BNB Chain through KyberSwap.
Neither needs an API key. Run:  python -m assayer.collect.quotes
"""

from __future__ import annotations

import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import requests

from assayer import registry, storage
from assayer.registry import Token

SIZES_USD = (1_000, 10_000)
TIMEOUT_SECONDS = 20
PAUSE_SECONDS = 0.4  # stay well inside free-tier rate limits

JUPITER_QUOTE = "https://lite-api.jup.ag/swap/v1/quote"
JUPITER_TOKENS = "https://lite-api.jup.ag/tokens/v2/search"
KYBER_ROUTES = "https://aggregator-api.kyberswap.com/{chain}/api/v1/routes"
EVM_RPC = {
    "ethereum": "https://ethereum-rpc.publicnode.com",
    "bsc": "https://bsc-rpc.publicnode.com",
}


@dataclass(frozen=True)
class Stable:
    address: str
    decimals: int


# The stablecoin each venue is quoted against.
STABLES = {
    "solana": Stable("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 6),  # USDC
    "ethereum": Stable("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6),  # USDC
    "bsc": Stable("0x55d398326f99059fF775485246999027B3197955", 18),      # USDT
}
VENUES = {"solana": "jupiter", "ethereum": "kyberswap", "bsc": "kyberswap"}


class QuoteError(RuntimeError):
    pass


# ---------- pure helpers (tested offline) ----------

def to_units(amount: float, decimals: int) -> int:
    return int(round(amount * 10**decimals))


def from_units(raw: int | str, decimals: int) -> float:
    return int(raw) / 10**decimals


def fill_price(stable_amount: float, token_amount: float) -> float:
    if stable_amount <= 0 or token_amount <= 0:
        raise QuoteError(f"cannot price a fill of {stable_amount} for {token_amount} tokens")
    return stable_amount / token_amount


def parse_jupiter(body: dict) -> int:
    out = body.get("outAmount")
    if not out or int(out) <= 0:
        raise QuoteError(f"Jupiter returned no route: {body.get('error') or body}")
    return int(out)


def parse_kyber(body: dict) -> int:
    summary = (body.get("data") or {}).get("routeSummary") or {}
    out = summary.get("amountOut")
    if body.get("code") != 0 or not out or int(out) <= 0:
        raise QuoteError(f"KyberSwap returned no route: {body.get('message') or body}")
    return int(out)


def parse_erc20_decimals(body: dict) -> int:
    result = body.get("result")
    if not result or result == "0x":
        raise QuoteError(f"decimals() call failed: {body}")
    return int(result, 16)


# ---------- network ----------

class Quoter:
    def __init__(self, session: requests.Session):
        self.session = session
        self._decimals: dict[str, int] = {}

    def _get(self, url: str, params: dict, headers: dict | None = None) -> dict:
        time.sleep(PAUSE_SECONDS)
        response = self.session.get(url, params=params, headers=headers, timeout=TIMEOUT_SECONDS)
        if response.status_code >= 500:
            response.raise_for_status()
        return response.json()

    def decimals(self, token: Token) -> int:
        if token.address in self._decimals:
            return self._decimals[token.address]
        if token.chain == "solana":
            matches = self._get(JUPITER_TOKENS, {"query": token.address})
            found = [m for m in matches if m.get("id") == token.address]
            if not found:
                raise QuoteError(f"{token.venue_id}: mint not found on Jupiter")
            value = int(found[0]["decimals"])
        else:
            call = {"jsonrpc": "2.0", "id": 1, "method": "eth_call",
                    "params": [{"to": token.address, "data": "0x313ce567"}, "latest"]}
            response = self.session.post(EVM_RPC[token.chain], json=call, timeout=TIMEOUT_SECONDS)
            value = parse_erc20_decimals(response.json())
        self._decimals[token.address] = value
        return value

    def swap_out(self, chain: str, token_in: str, token_out: str, amount_in: int) -> int:
        if chain == "solana":
            body = self._get(JUPITER_QUOTE, {"inputMint": token_in, "outputMint": token_out,
                                             "amount": amount_in, "slippageBps": 50})
            return parse_jupiter(body)
        body = self._get(KYBER_ROUTES.format(chain=chain),
                         {"tokenIn": token_in, "tokenOut": token_out, "amountIn": amount_in},
                         headers={"x-client-id": "assayer"})
        return parse_kyber(body)


def quote_token(quoter: Quoter, token: Token, now: datetime) -> list[dict]:
    stable = STABLES[token.chain]
    token_decimals = quoter.decimals(token)
    rows = []
    for size in SIZES_USD:
        bought_raw = quoter.swap_out(token.chain, stable.address, token.address,
                                     to_units(size, stable.decimals))
        bought = from_units(bought_raw, token_decimals)
        sold_for = from_units(
            quoter.swap_out(token.chain, token.address, stable.address, bought_raw),
            stable.decimals)
        for side, price in (("buy", fill_price(size, bought)),
                            ("sell", fill_price(sold_for, bought))):
            rows.append({
                "ts": now.isoformat(), "ticker": token.ticker, "venue": VENUES[token.chain],
                "chain": token.chain, "symbol": token.symbol, "side": side,
                "size_usd": size, "fill_price": round(price, 6),
                # Dividend multiplier is applied in metrics; raw fills are stored as-is.
                "k_mult": 1,
            })
    return rows


def collect(now: datetime | None = None) -> tuple[list[dict], list[str]]:
    now = now or datetime.now(timezone.utc)
    tokens, _ = registry.load()
    rows: list[dict] = []
    errors: list[str] = []
    with requests.Session() as session:
        quoter = Quoter(session)
        for token in tokens:
            if token.chain not in STABLES:
                continue
            try:
                rows.extend(quote_token(quoter, token, now))
            except (requests.RequestException, QuoteError, ValueError, KeyError) as error:
                errors.append(f"{token.venue_id}: {error}")
    return rows, errors


def main() -> int:
    rows, errors = collect()
    written = storage.write("snapshots", rows)
    print(f"quotes: wrote {written} rows to {storage.target()}")
    for error in errors:
        print(f"quotes: {error}", file=sys.stderr)
    return 0 if rows else 1


if __name__ == "__main__":
    raise SystemExit(main())
