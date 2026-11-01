# Guide for coding agents

## Layout

- `oneprice/metrics.py`: pure pricing math. No I/O. Every formula in the README's Method section is here.
- `oneprice/registry.py`: loads `data/tokens.csv`; only `verified` and `single-source` rows are usable.
- `oneprice/storage.py`: writes rows to Postgres if `DATABASE_URL` is set, else to `data/local/*.jsonl`.
- `oneprice/collect/`: one module per price source, each runnable with `python -m`.
- `oneprice/demo.py`: offline entry point behind `make demo`.

## Verify the README's claims

```sh
make install
make test   # every built row in the README Status table has tests here
make demo   # offline; needs no keys
```

- Premium and spread formulas: compare README Method with `oneprice/metrics.py` and `tests/test_metrics.py`.
- Registry safety (lookalike tokens skipped): `tests/test_registry.py`.
- Collector parsing without network: `tests/test_reference.py`.

## Conventions

- Network code lives only in `oneprice/collect/`; anything else stays pure so it can be tested offline.
- Secrets come from environment variables. `.env` is gitignored; see `.env.example`.
- The README Status table lists only what is built.
