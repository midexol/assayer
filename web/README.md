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
- `POST /api/v1/best-venue` with `{"ticker":"NVDA","side":"buy","size_usd":10000}`: answers `402` with the price (0.25 USDC through NEAR Intents). Add `"preview": true` for the free answer while Intents settlement is being connected.

## Deploy

On Vercel, import the repo and set **Root Directory** to `web`. No environment variables are needed. `NEXT_PUBLIC_ASSAYER_DATA_URL` overrides where the data comes from.
