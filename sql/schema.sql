-- Assayer schema (Postgres: Supabase or Neon).
-- Apply once: paste into the provider's SQL editor, or run
--   psql "$DATABASE_URL" -f sql/schema.sql
-- Safe to re-run: every statement is IF NOT EXISTS.

-- Nasdaq reference price for each ticker, every collector run.
CREATE TABLE IF NOT EXISTS reference_prices (
  ts            timestamptz   NOT NULL,          -- when we collected it
  ticker        text          NOT NULL,          -- NVDA, TSLA, AAPL, SPY, QQQ
  price         numeric(14,4) NOT NULL,
  quote_ts      timestamptz   NOT NULL,          -- the exchange's own timestamp
  market_open   boolean       NOT NULL,          -- false on nights and weekends
  source        text          NOT NULL DEFAULT 'finnhub',
  PRIMARY KEY (ticker, ts)
);

-- Executable quote at one venue: what a $1K or $10K buy/sell would actually fill at.
CREATE TABLE IF NOT EXISTS snapshots (
  ts            timestamptz   NOT NULL,
  ticker        text          NOT NULL,
  venue         text          NOT NULL,          -- e.g. jupiter, 0x, gate
  chain         text          NOT NULL,          -- solana, ethereum, bsc, cex
  symbol        text          NOT NULL,          -- NVDAon, NVDAx, ...
  side          text          NOT NULL CHECK (side IN ('buy', 'sell')),
  size_usd      integer       NOT NULL,
  fill_price    numeric(14,4) NOT NULL,          -- price per token at that size
  k_mult        numeric(10,6) NOT NULL DEFAULT 1, -- shares per token
  PRIMARY KEY (ticker, venue, chain, symbol, side, size_usd, ts)
);

-- Historical DEX trades, backfilled from Dune.
CREATE TABLE IF NOT EXISTS trades (
  ts            timestamptz   NOT NULL,
  ticker        text          NOT NULL,
  venue         text          NOT NULL,
  chain         text          NOT NULL,
  symbol        text          NOT NULL,
  price         numeric(14,4) NOT NULL,
  qty           numeric(24,8) NOT NULL,
  tx_hash       text          NOT NULL,
  PRIMARY KEY (chain, tx_hash, symbol)
);

-- Derived per-minute metrics (written by the hourly metrics job).
CREATE TABLE IF NOT EXISTS metrics_minute (
  ts            timestamptz   NOT NULL,
  ticker        text          NOT NULL,
  venue_id      text          NOT NULL,          -- chain:symbol
  premium       double precision,
  exec_cost_1k  double precision,
  exec_cost_10k double precision,
  PRIMARY KEY (ticker, venue_id, ts)
);

-- One row per mispricing episode: |premium| above threshold until it closes.
CREATE TABLE IF NOT EXISTS gaps (
  id            bigserial     PRIMARY KEY,
  ticker        text          NOT NULL,
  venue_id      text          NOT NULL,
  opened_at     timestamptz   NOT NULL,
  closed_at     timestamptz,                     -- null while still open
  peak_premium  double precision NOT NULL
);

-- Paid agent requests settled through NEAR Intents 1Click.
CREATE TABLE IF NOT EXISTS orders (
  id              uuid          PRIMARY KEY,
  endpoint        text          NOT NULL,
  deposit_address text          NOT NULL,
  amount_usdc     numeric(12,6) NOT NULL,
  status          text          NOT NULL DEFAULT 'pending',
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS snapshots_ts_idx ON snapshots (ts);
CREATE INDEX IF NOT EXISTS reference_prices_ts_idx ON reference_prices (ts);
CREATE INDEX IF NOT EXISTS gaps_open_idx ON gaps (ticker) WHERE closed_at IS NULL;
