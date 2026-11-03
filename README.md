# Assayer collected data

Raw prices collected by the `Collect prices` workflow on the `main` branch, every 5 minutes, starting November 2026. One commit per collection round.

## Layout

```
raw/<YYYY-MM-DD>/reference_prices.jsonl   Nasdaq reference price per ticker (Finnhub)
raw/<YYYY-MM-DD>/snapshots.jsonl          executable on-chain quotes per venue
```

Dates are UTC. Each line is one JSON object.

## Fields

`reference_prices`: `ts` (collection time), `ticker`, `price`, `quote_ts` (exchange timestamp), `market_open`, `source`.

`snapshots`: `ts`, `ticker`, `venue` (jupiter or kyberswap), `chain`, `symbol`, `side` (buy or sell), `size_usd` (1000 or 10000), `fill_price` (stablecoin per token at that size), `k_mult` (stored as 1; the dividend multiplier is applied during analysis).

## Load it

```python
import pandas as pd
quotes = pd.read_json("raw/2026-11-04/snapshots.jsonl", lines=True)
```
