# Assayer website

This is the Next.js (App Router) site for Assayer. It has the landing page at `/`, the live dashboard at `/dashboard`, and a small API.

It reads `site/dashboard.json` from the repo's `data` branch, which the collector rewrites every five minutes (`assayer/site_export.py`). If that file can't be reached, it shows the snapshot in `lib/sample.json`.

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # vitest
npm run build
```

## API

- `GET /api/v1/venues`: every stock and venue from the last 24 hours of rounds. Free.
- `POST /api/v1/best-venue`: where a stock is cheapest to buy, paid per answer through NEAR Intents.

A bot pays in three calls. It can pay with any token on any chain that NEAR Intents supports ([asset list](https://1click.chaindefuser.com/v0/tokens)).

```bash
# 1. Ask. The reply is 402 with the price and how to pay.
curl -X POST $SITE/api/v1/best-venue -H 'content-type: application/json' -d '{"ticker":"NVDA","side":"buy","size_usd":10000}'

# 2. Say what you pay with. The reply is 402 with a NEAR Intents deposit address, the exact amount and a payment_token.
curl -X POST $SITE/api/v1/best-venue -H 'content-type: application/json' -d '{"ticker":"NVDA","side":"buy","size_usd":10000,
  "pay_with":{"asset":"nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near","refund_to":"0xYourArbitrumAddress"}}'

# 3. Send amount_in to deposit_address, then ask again with the token.
#    The reply is 200 with the venue, price, premium and a one-line reason from NEAR AI Cloud.
curl -X POST $SITE/api/v1/best-venue -H 'content-type: application/json' -d '{"ticker":"NVDA","side":"buy","size_usd":10000,"payment_token":"..."}'
```

How it settles:

- The quote is `EXACT_OUTPUT`: 0.25 USDC lands on NEAR in Assayer's account, whatever the bot pays with.
- Before answering, the server checks `/v0/status` on 1Click. The payment must be `SUCCESS`, paid to Assayer's account, and at least 0.25 USDC.
- The payment token is HMAC-signed. It ties one deposit to one question for two hours, so no database is needed.
- `"preview": true` returns the same answer free, marked unpaid, with a plain reason instead of the AI one.

## Deploy

On Vercel, import the repo and set **Root Directory** to `web`. The dashboard needs no environment variables. For paid answers, set `ASSAYER_NEAR_ACCOUNT`, `PAYMENT_SECRET` and `NEARAI_API_KEY`; `ONECLICK_API_KEY` and `NEARAI_MODEL` are optional (see `../.env.example`). `NEXT_PUBLIC_ASSAYER_DATA_URL` overrides where the data comes from.
