# Guide for coding agents

## Layout

- `assayer/metrics.py`: pure pricing math. No I/O. Every formula in the README's Method section is here.
- `assayer/registry.py`: loads `data/tokens.csv`; only `verified` and `single-source` rows are usable.
- `assayer/storage.py`: always appends rows to `data/local/*.jsonl`; also inserts into Postgres when `DATABASE_URL` is set.
- `assayer/archive.py`: files local rows into the `data` branch checkout as `raw/<date>/<table>.jsonl`.
- `assayer/collect/`: one module per price source, each runnable with `python -m`. `reference.py` is Finnhub; `quotes.py` is Jupiter (Solana) and KyberSwap (Ethereum, BNB).
- `scripts/collect_loop.sh`: the 5-minute loop the collection workflow runs.
- `assayer/demo.py`: offline entry point behind `make demo`.

## Verify the README's claims

```sh
make install
make test   # every built row in the README Status table has tests here
make demo   # offline; needs no keys
```

- Premium and spread formulas: compare README Method with `assayer/metrics.py` and `tests/test_metrics.py`.
- Registry safety (lookalike tokens skipped): `tests/test_registry.py`.
- Collector parsing without network: `tests/test_reference.py`, `tests/test_quotes.py`.
- Archiving without duplicates: `tests/test_archive.py`.
- Raw data: check out the `data` branch.

## Conventions

- Network code lives only in `assayer/collect/`; anything else stays pure so it can be tested offline.
- Secrets come from environment variables. `.env` is gitignored; see `.env.example`.
- The README Status table lists only what is built.
