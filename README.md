# Assayer

Assayer measures how far tokenized US stocks (Ondo `…on` tokens and xStocks `…x` tokens) drift from the real Nasdaq price across Solana, Ethereum, BNB Chain and centralized exchanges, and what that drift costs traders. Built at NEAR HACKATHON (Nov 1 to 14, 2026).

**Live:** [assayer-gray.vercel.app](https://assayer-gray.vercel.app) (landing page and [dashboard](https://assayer-gray.vercel.app/dashboard)) · **Code:** [github.com/midexol/assayer](https://github.com/midexol/assayer)

**Other project by the same entrant:** [Asylia](https://github.com/midexol/asylia), a quantum-attack rescue for Bitcoin, Ethereum, BNB Chain and NEAR wallets. The two projects are independent and share no code.

## What it is, in one minute

- **The problem.** One share of Nvidia now trades as up to five different tokens:
  - xStocks `NVDAx` on Solana and on Gate.io
  - Ondo `NVDAon` on Ethereum, BNB Chain and Solana

  Each sits in its own pool, at its own price. A trader has no way to see which one is closest to the real Nasdaq price.
- **What Assayer does.**
  - Every 5 minutes it asks each venue what a real $1,000 and $10,000 buy and sell would fill at, and compares the fill with Nasdaq. That covers 25 venues: 20 on-chain plus 5 on Gate.io.
  - It publishes the results as a live dashboard and as raw files anyone can re-run.
  - It sells the answer to trading bots for 0.25 USDC, paid from any chain through NEAR Intents.
- **How NEAR fits.**
  - **Payment:** bots pay per answer through NEAR Intents 1Click, in any token on any chain.
  - **Explanation:** each paid answer comes with a reason written on NEAR AI Cloud.
  - **The thesis below:** fragmentation across chains is the cost that chain-abstracted routing exists to remove.

Tracks: `thesis`, `agents`, `open`.

## Try it

**On the live site:** open [the dashboard](https://assayer-gray.vercel.app/dashboard) to see every venue against Nasdaq, refreshed every 5 minutes. For a free answer from the Agent API:

```sh
curl -X POST https://assayer-gray.vercel.app/api/v1/best-venue -H 'content-type: application/json' \
  -d '{"ticker":"NVDA","side":"buy","size_usd":10000,"preview":true}'
```

You should get the cheapest venue right now, marked unpaid. Without `"preview": true` you get HTTP 402 with the price and how to pay.

**Run the tests and the collectors** (Python 3.11+):

```sh
git clone https://github.com/midexol/assayer && cd assayer
make install
make test    # pricing math, registry, collectors, thesis: offline, no keys
make demo    # offline: registry coverage and the latest snapshot
```

**Run the website** (Node 22):

```sh
cd web && npm install && npm run dev
```

- Open `http://localhost:3000`. You should see the landing page, built from the latest real round on the `data` branch.
- Open `/dashboard`. You should see Overview, Venues, Cost of the split, Alerts and Agent API, all working on real data. The data reloads every 5 minutes.
- Run `curl -X POST localhost:3000/api/v1/best-venue -H 'content-type: application/json' -d '{"ticker":"NVDA","side":"buy","size_usd":10000}'`. You should get HTTP 402 with the price and how to pay.
- Add `"preview": true` to the same request. You should get the cheapest venue right now, free and marked unpaid.

The full paid flow (quote, deposit address, settlement check, answer) is in [`web/README.md`](web/README.md#api).

**Re-run the numbers yourself.** The raw rounds are on the [`data` branch](../../tree/data). Use `python -m assayer.thesis <checkout of the data branch>` to rebuild `site/thesis.json`.

## The thesis

**Claim.** Tokenized equities are fragmenting across chains faster than liquidity follows them. The cost of that split is real and measurable, and most of it is an information problem: knowing *where* to trade. That is the problem chain-abstracted execution, which is what NEAR Intents provides, and paid agent answers exist to solve.

**What the data says so far** (248 market-open rounds, 3 to 9 November 2026; the dashboard's "Cost of the split" view recomputes this every 5 minutes):

- **The thin pools:** 9 of the 25 venues trade far from Nasdaq at $10,000, mostly Ondo pools on Solana and BNB Chain. AAPLon on Solana sat about **+1,795%** over Nasdaq on median for a $1,000 buy, and NVDAon on BNB Chain about **+163%** at $10,000. A buyer who lands there loses most of the trade.
- **The usable venues:** among venues that trade near Nasdaq, buying $10,000 at an average one cost about **1.9 points (about $190) more** than the cheapest one that round. The median cheapest-to-dearest gap was about **1.1 points**. Counting the thin pools, the average extra cost jumps to about **970 points**.
- **What helps most:** re-routing every round saved only about 0.04 points (about $4 on $10,000) over always using the venue that is cheapest on median. That venue was xStocks on Gate.io for Apple, Nvidia, the Nasdaq-100 and S&P 500 ETFs, and xStocks on Solana for Tesla. The fix is knowing the right venue, not chasing it. That is the answer the Agent API sells.

Definitions and code: [`assayer/thesis.py`](assayer/thesis.py). The sample is still small (it grows by about 78 market-open rounds each trading day), so treat these numbers as directional.

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
| Website: landing page and live dashboard (Overview, Venues, Alerts, Agent API) in Next.js | built, tested, [live](https://assayer-gray.vercel.app) | [`web/`](web/), [`assayer/site_export.py`](assayer/site_export.py) |
| Security: per-visitor rate limits, body caps, strict headers, secrets kept server-side | built, tested; checked live | [`web/proxy.ts`](web/proxy.ts), [`web/next.config.ts`](web/next.config.ts) |
| Agent API: pay 0.25 USDC from any chain through NEAR Intents 1Click (402, deposit address, settlement check), answer with a reason from NEAR AI Cloud | built, tested with the network faked; first live payment pending keys | [`web/lib/payment.ts`](web/lib/payment.ts), [`web/lib/reason.ts`](web/lib/reason.ts), [`web/app/api/v1/best-venue`](web/app/api/v1/best-venue), [`web/README.md`](web/README.md#api) |

## Security

- **Rate limits:** every API route has a per-visitor limit, checked in [`web/proxy.ts`](web/proxy.ts) before the route runs: 30 a minute on the paid Agent API (enough to poll for a payment), 60 on the rest, and an 8 KB cap on request bodies. Over the limit, the answer is 429 with `Retry-After`.
- **Headers:** a strict Content-Security-Policy (scripts only from this site, no framing), HSTS, `nosniff` and a locked-down Permissions-Policy. See [`web/next.config.ts`](web/next.config.ts).
- **Secrets:** `PAYMENT_SECRET`, `NEARAI_API_KEY` and `ONECLICK_API_KEY` are read only in modules that import `server-only`, so the build fails if one is ever pulled into the browser. They live in Vercel and GitHub secrets, never in the repo.
- **Payments:** each payment token is signed (HMAC-SHA256, compared in constant time), tied to one deposit address and one question, and expires after 2 hours.

## Method

For a token whose price is `P` and which represents `k` shares (Ondo tokens reinvest dividends, so `k` rises slowly above 1), with Nasdaq reference price `R`:

- **Premium** = `P / (k × R) − 1`. Positive means the venue charges more than Nasdaq.
- **Cross-venue spread** = most expensive per-share price minus cheapest, at the same moment, also reported as a fraction of `R`.
- **Fragmentation Tax**: the average extra paid at a venue compared with the cheapest venue that round.
- **Router savings**: how much picking the cheapest venue every round saves over always using the venue that is cheapest on median.
- **Gap lifespan**: how long the spread stays above 0.5 points.
- **Round-trip cost**: buy then sell straight back at the same venue.

Reference prices carry a `market_open` flag, because nights and weekends have no live Nasdaq price to compare against.

## Data

- Tokens: [`data/tokens.csv`](data/tokens.csv). Lookalike tokens with the same symbols exist, so only rows marked `verified` or `single-source` are used. `TODO` and `CONFLICT` rows are skipped and listed by `make demo`.
- Reference prices: Finnhub `/quote` and `/stock/market-status`.
- Executable quotes: for each venue and size, a buy spends the chain's stablecoin (USDC on Solana and Ethereum, USDT on BNB) and a sell returns exactly the tokens that buy received. `fill_price` is stablecoin per token.
- Exchange quotes: the public Gate.io order book (`NVDAX_USDT` and so on), walked level by level for the same $1,000 and $10,000 trades. USDT is counted at $1.
- Raw collected data lives on the [`data` branch](../../tree/data), one commit per 5-minute round, filed as `raw/<date>/<table>.jsonl`.

## Limitations

- NEAR Intents' public 1Click API does not list tokenized stocks today, so Assayer measures these markets; it does not trade them through Intents.
- GitHub's own scheduler ran the original `*/5` cron only about three times a day on this new repository, and Nov 1 to 3 rows were not archived. Collection therefore runs as a long job that restarts itself, and the dataset starts on the day that change landed. Gaps can still occur while one run hands over to the next.
- Stablecoins are counted as exactly $1.
- **Ondo's dividend multiplier `k` is not yet applied to the stored premiums.** Ondo tokens reinvest dividends, so one token slowly comes to represent a little more than one share. For dividend payers such as SPY and QQQ, part of an Ondo token's premium is therefore accrued dividends, not overpricing. xStocks are unaffected.
- **The thesis sample is small.** It counts only market-open rounds, and collection started on 3 November.

## Built during the hackathon

Everything in this repository was written during NEAR HACKATHON (1 to 14 November 2026). There is no earlier code: the first commit, [`3683bce`](https://github.com/midexol/assayer/commit/3683bce), is from 1 November 2026.

- Full history: [commits on `main`](https://github.com/midexol/assayer/commits/main). The `data` branch holds only collected rounds.
- Everything after the first commit: [diff `3683bce...hackathon-submission`](https://github.com/midexol/assayer/compare/3683bce...hackathon-submission)
- The tag `hackathon-submission` marks the code as submitted.

**Existing products:** none. Assayer is not a port of a product on another chain. It reads prices from Solana, Ethereum, BNB Chain and Gate.io, and takes payment and writes its explanations on NEAR.

## Libraries, services and AI-generated code

**Template:** the website started from `create-next-app` (Next.js, App Router, TypeScript).

**Libraries:** Python: `requests`, optional `psycopg`, and pytest for tests. Website: Next.js, React and `server-only`, with Vitest and ESLint for tests and linting.

**Services:** Finnhub (Nasdaq prices and market status), Jupiter (Solana quotes), KyberSwap (Ethereum and BNB Chain quotes), the Gate.io public order book, NEAR Intents 1Click (payments), NEAR AI Cloud (the written reasons), GitHub Actions (collection) and Google Fonts (type).

**AI-generated code:** much of the code, tests and documentation was written with Claude, Anthropic's AI assistant, working under the entrant's direction. The entrant chose the product, the thesis and every trade-off, and reviewed and tested the result.

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
