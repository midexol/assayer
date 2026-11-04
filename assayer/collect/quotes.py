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
PAUSE_SECONDS = 1.0  # about 60 requests a minute: inside Jupiter lite-api's free limit
RETRIES = 3          # on rate limits, 5xx and dropped connections, with growing waits
RATE_LIMIT_WAIT = 4  # extra seconds per attempt after an HTTP 429

JUPITER_QUOTE = "https://lite-api.jup.ag/swap/v1/quote"
SOLANA_RPC = "https://api.mainnet-beta.solana.com"
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


def parse_spl_decimals(body: dict) -> int:
    value = ((body.get("result") or {}).get("value") or {}).get("decimals")
    if value is None:
        raise QuoteError(f"getTokenSupply failed: {body.get('error') or body}")
    return int(value)


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

    def _request(self, method: str, url: str, **kwargs) -> dict:
        """Send a request, retrying rate limits, server errors and dropped connections.

        KyberSwap's aggregator returns the odd 5xx or times out under load; one or two
        retries a few seconds apart recover almost all of them.
        """
        last: Exception | None = None
        limited = 0
        for attempt in range(RETRIES + 1):
            time.sleep(PAUSE_SECONDS * (1 + 3 * attempt) + RATE_LIMIT_WAIT * limited)
            try:
                response = self.session.request(method, url, timeout=TIMEOUT_SECONDS, **kwargs)
            except (requests.Timeout, requests.ConnectionError) as exc:
                last = exc
                continue
            if response.status_code == 429:
                limited += 1
            if response.status_code == 429 or response.status_code >= 500:
                last = requests.HTTPError(f"{response.status_code} from {url}", response=response)
                continue
            body = response.json()
            if not isinstance(body, dict):
                raise QuoteError(f"unexpected response from {url}: {str(body)[:200]}")
            return body
        raise QuoteError(f"{url}: failed after {RETRIES} retries: {last}")

    def _get(self, url: str, params: dict, headers: dict | None = None) -> dict:
        return self._request("GET", url, params=params, headers=headers)

    def _rpc(self, url: str, method: str, params: list) -> dict:
        return self._request("POST", url, json={"jsonrpc": "2.0", "id": 1,
                                                "method": method, "params": params})

    def decimals(self, token: Token) -> int:
        if token.address in self._decimals:
            return self._decimals[token.address]
        if token.chain == "solana":
            value = parse_spl_decimals(self._rpc(SOLANA_RPC, "getTokenSupply", [token.address]))
        else:
            value = parse_erc20_decimals(self._rpc(
                EVM_RPC[token.chain], "eth_call",
                [{"to": token.address, "data": "0x313ce567"}, "latest"]))
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


def collect(now: datetime | None = None) -> tuple[list[dict], list[dict]]:
    """Return (snapshot rows, error rows). Errors never stop other venues."""
    now = now or datetime.now(timezone.utc)
    tokens, _ = registry.load()
    rows: list[dict] = []
    errors: list[dict] = []
    with requests.Session() as session:
        quoter = Quoter(session)
        for token in tokens:
            if token.chain not in STABLES:
                continue
            try:
                rows.extend(quote_token(quoter, token, now))
            except Exception as error:  # one bad venue must never stop the others
                errors.append({"ts": now.isoformat(), "source": "quotes",
                               "venue_id": token.venue_id,
                               "error": f"{type(error).__name__}: {error}"[:500]})
    return rows, errors


def main() -> int:
    rows, errors = collect()
    written = storage.write("snapshots", rows)
    storage.write("collect_errors", errors)
    print(f"quotes: wrote {written} rows to {storage.target()}, {len(errors)} venues failed")
    for error in errors:
        print(f"quotes: {error['venue_id']}: {error['error']}", file=sys.stderr)
    return 0 if rows else 1


if __name__ == "__main__":
    raise SystemExit(main())
