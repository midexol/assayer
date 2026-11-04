# Assayer

Assayer measures how far tokenized US stocks (Ondo `…on` tokens and xStocks `…x` tokens) drift from the real Nasdaq price across Solana, Ethereum, BNB Chain and centralized exchanges, and what that drift costs traders. Built at NEAR HACKATHON (Nov 1 to 14, 2026).

**Other project by the same entrant:** [Lifeboat](https://github.com/midexol/lifeboat), a quantum-attack rescue for Bitcoin, Ethereum, BNB Chain and NEAR wallets. The two projects are independent and share no code.

## Try it

```sh
git clone <this repo> && cd assayer
make install
make test    # unit tests for the pricing math, registry and collector parsing
make demo    # runs offline, no keys: registry coverage and the latest snapshot
```

`make demo` reads `data/snapshot/`. Until live collection has produced a snapshot it prints registry coverage only and says that no measured data exists yet.

## Status

This section is updated as work lands. Anything not marked built is not claimed.

| Part | State | Where |
| --- | --- | --- |
| Pricing math (premium, cross-venue spread, dividend multiplier) | built, tested | [`assayer/metrics.py`](assayer/metrics.py), [`tests/test_metrics.py`](tests/test_metrics.py) |
| Token registry (verified contract per chain) | built, tested | [`data/tokens.csv`](data/tokens.csv), [`assayer/registry.py`](assayer/registry.py) |
| Nasdaq reference collector (Finnhub) | built, tested offline | [`assayer/collect/reference.py`](assayer/collect/reference.py) |
| On-chain quote collector ($1K and $10K buy and sell: Jupiter on Solana, KyberSwap on Ethereum and BNB) | built, tested offline | [`assayer/collect/quotes.py`](assayer/collect/quotes.py), [`tests/test_quotes.py`](tests/test_quotes.py) |
| Collection every 5 minutes, archived to the `data` branch | built | [`.github/workflows/collect.yml`](.github/workflows/collect.yml), [`scripts/collect_loop.sh`](scripts/collect_loop.sh), [`assayer/archive.py`](assayer/archive.py) |
| Database schema | built | [`sql/schema.sql`](sql/schema.sql) |
| Exchange collector: walks the Gate.io order book for all five xStocks at $1K and $10K | built, tested | [`assayer/collect/cex.py`](assayer/collect/cex.py), [`tests/test_cex.py`](tests/test_cex.py) |
| Cost of the split: Fragmentation Tax, router savings, gap lifespan, round-trip cost, market-open rounds only | built, tested; recomputed every round | [`assayer/thesis.py`](assayer/thesis.py), [`tests/test_thesis.py`](tests/test_thesis.py) |
| Website: landing page and live dashboard (Overview, Venues, Alerts, Agent API) in Next.js | built, tested | [`web/`](web/), [`assayer/site_export.py`](assayer/site_export.py) |
| Agent API: pay 0.25 USDC from any chain through NEAR Intents 1Click (402, deposit address, settlement check), answer with a reason from NEAR AI Cloud | built, tested with the network faked; first live payment pending keys | [`web/lib/payment.ts`](web/lib/payment.ts), [`web/lib/reason.ts`](web/lib/reason.ts), [`web/app/api/v1/best-venue`](web/app/api/v1/best-venue), [`web/README.md`](web/README.md#api) |

## Method

For a token whose price is `P` and which represents `k` shares (Ondo tokens reinvest dividends, so `k` rises slowly above 1), with Nasdaq reference price `R`:

- **Premium** = `P / (k × R) − 1`. Positive means the venue charges more than Nasdaq.
- **Cross-venue spread** = most expensive per-share price minus cheapest, at the same moment, also reported as a fraction of `R`.

Reference prices carry a `market_open` flag, because nights and weekends have no live Nasdaq price to compare against.

## Data

- Tokens: [`data/tokens.csv`](data/tokens.csv). Lookalike tokens with the same symbols exist, so only rows marked `verified` or `single-source` are used. `TODO` and `CONFLICT` rows are skipped and listed by `make demo`.
- Reference prices: Finnhub `/quote` and `/stock/market-status`.
- Executable quotes: for each venue and size, a buy spends the chain's stablecoin (USDC on Solana and Ethereum, USDT on BNB) and a sell returns exactly the tokens that buy received. `fill_price` is stablecoin per token.
- Raw collected data lives on the [`data` branch](../../tree/data), one commit per 5-minute round, filed as `raw/<date>/<table>.jsonl`.

## Limitations

- NEAR Intents' public 1Click API does not list tokenized stocks today, so Assayer measures these markets; it does not trade them through Intents.
- GitHub's own scheduler ran the original `*/5` cron only about three times a day on this new repository, and Nov 1 to 3 rows were not archived. Collection therefore runs as a long job that restarts itself, and the dataset starts on the day that change landed. Gaps can still occur while one run hands over to the next.
- Stablecoins are counted as exactly $1.

## Repo map

| Path | What |
| --- | --- |
| `assayer/` | Python package: math, registry, storage, collectors |
| `tests/` | pytest suite, runs offline |
| `data/` | token registry; `snapshot/` holds exported real data |
| `sql/` | Postgres schema |
| `scripts/` | the 5-minute collection loop |
| `.github/workflows/` | CI and scheduled collection |
| `docs/` | copy of the hackathon rules from Oct 28, 2026; the live version is https://nearhackathon.com/HACKATHON.md |

## License

MIT
