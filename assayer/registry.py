"""Token registry: which contract on which chain is the real tokenized stock.

data/tokens.csv is the single source of truth. Lookalike tokens with the same
symbol exist on these chains, so only rows marked verified or single-source
are ever used. Rows marked TODO or CONFLICT are skipped and reported.
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path

REGISTRY_PATH = Path(__file__).resolve().parent.parent / "data" / "tokens.csv"

USABLE_STATUSES = {"verified", "single-source"}
EVM_CHAINS = {"ethereum", "bsc"}

_EVM_ADDRESS = re.compile(r"^0x[0-9a-fA-F]{40}$")
_SOLANA_ADDRESS = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


@dataclass(frozen=True)
class Token:
    ticker: str
    issuer: str
    symbol: str
    chain: str
    address: str
    status: str
    source: str

    @property
    def venue_id(self) -> str:
        return f"{self.chain}:{self.symbol}"


class RegistryError(ValueError):
    pass


def _address_is_valid(chain: str, address: str) -> bool:
    if chain in EVM_CHAINS:
        return bool(_EVM_ADDRESS.match(address))
    if chain == "solana":
        return bool(_SOLANA_ADDRESS.match(address))
    return False


def load(path: Path = REGISTRY_PATH) -> tuple[list[Token], list[str]]:
    """Return (usable tokens, human-readable reasons for skipped rows)."""
    usable: list[Token] = []
    skipped: list[str] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            token = Token(**{key: (value or "").strip() for key, value in row.items()})
            label = f"{token.ticker} {token.symbol} on {token.chain}"
            if token.status not in USABLE_STATUSES:
                skipped.append(f"{label}: status is {token.status}")
                continue
            if not _address_is_valid(token.chain, token.address):
                raise RegistryError(f"{label}: malformed address {token.address!r}")
            usable.append(token)
    return usable, skipped


def tickers(tokens: list[Token]) -> list[str]:
    return sorted({token.ticker for token in tokens})
