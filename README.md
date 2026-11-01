# OnePrice

OnePrice measures how far tokenized US stocks (Ondo `…on` tokens and xStocks `…x` tokens) drift from the real Nasdaq price across Solana, Ethereum, BNB Chain and centralized exchanges, and what that drift costs traders. Built at NEAR HACKATHON (Nov 1 to 14, 2026).

## Try it

```sh
git clone <this repo> && cd oneprice
make install
make test    # unit tests for the pricing math, registry and collector parsing
make demo    # runs offline, no keys: registry coverage and the latest snapshot
```

`make demo` reads `data/snapshot/`. Until live collection has produced a snapshot it prints registry coverage only and says that no measured data exists yet.

## Status

This section is updated as work lands. Anything not marked built is not claimed.

| Part | State | Where |
| --- | --- | --- |
| Pricing math (premium, cross-venue spread, dividend multiplier) | built, tested | [`oneprice/metrics.py`](oneprice/metrics.py), [`tests/test_metrics.py`](tests/test_metrics.py) |
| Token registry (verified contract per chain) | built, tested | [`data/tokens.csv`](data/tokens.csv), [`oneprice/registry.py`](oneprice/registry.py) |
| Nasdaq reference collector (Finnhub) | built, tested offline | [`oneprice/collect/reference.py`](oneprice/collect/reference.py) |
| Collection every 5 minutes | built | [`.github/workflows/collect.yml`](.github/workflows/collect.yml) |
| Database schema | built | [`sql/schema.sql`](sql/schema.sql) |
| On-chain and exchange quote collectors | planned | |
| Fragmentation Tax and router-savings simulation | planned | |
| Dashboard and thesis page | planned | |
| OnePrice Agent (paid via NEAR Intents 1Click, answers via NEAR AI Cloud) | planned | |

## Method

For a token whose price is `P` and which represents `k` shares (Ondo tokens reinvest dividends, so `k` rises slowly above 1), with Nasdaq reference price `R`:

- **Premium** = `P / (k × R) − 1`. Positive means the venue charges more than Nasdaq.
- **Cross-venue spread** = most expensive per-share price minus cheapest, at the same moment, also reported as a fraction of `R`.

Reference prices carry a `market_open` flag, because nights and weekends have no live Nasdaq price to compare against.

## Data

- Tokens: [`data/tokens.csv`](data/tokens.csv). Lookalike tokens with the same symbols exist, so only rows marked `verified` or `single-source` are used. `TODO` and `CONFLICT` rows are skipped and listed by `make demo`.
- Reference prices: Finnhub `/quote` and `/stock/market-status`.

## Limitations

- NEAR Intents' public 1Click API does not list tokenized stocks today, so OnePrice measures these markets; it does not trade them through Intents.
- GitHub's scheduler can start runs several minutes late, so collection intervals are approximately, not exactly, 5 minutes.

## Repo map

| Path | What |
| --- | --- |
| `oneprice/` | Python package: math, registry, storage, collectors |
| `tests/` | pytest suite, runs offline |
| `data/` | token registry; `snapshot/` holds exported real data |
| `sql/` | Postgres schema |
| `.github/workflows/` | CI and scheduled collection |
| `docs/` | copy of the hackathon rules from Oct 28, 2026; the live version is https://nearhackathon.com/HACKATHON.md |

## License

MIT
