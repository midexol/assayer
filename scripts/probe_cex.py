"""Which centralized exchanges list our xStocks, and can GitHub's runners reach them?"""

import json

import requests

TICKERS = ["NVDA", "TSLA", "AAPL", "SPY", "QQQ"]
s = requests.Session()


def get(url, **params):
    try:
        r = s.get(url, params=params, timeout=20)
        try:
            return r.status_code, r.json()
        except ValueError:
            return r.status_code, r.text[:300]
    except requests.RequestException as e:
        return None, str(e)[:200]


code, body = get("https://api.kraken.com/0/public/AssetPairs")
print("kraken AssetPairs", code)
if isinstance(body, dict) and body.get("result"):
    hits = {k: v.get("wsname") for k, v in body["result"].items() if any(v.get("wsname", "").upper().startswith(t + "X/") for t in TICKERS)}
    print(json.dumps(hits, indent=1))
    for name in list(hits)[:2]:
        print(name, json.dumps(get("https://api.kraken.com/0/public/Depth", pair=name, count=5))[:600])
else:
    print(str(body)[:300])

for t in TICKERS:
    sym = f"{t}XUSDT"
    code, body = get("https://api.bybit.com/v5/market/orderbook", category="spot", symbol=sym, limit=5)
    print("bybit", sym, code, json.dumps(body)[:300])

for t in TICKERS:
    pair = f"{t}X_USDT"
    code, body = get("https://api.gateio.ws/api/v4/spot/order_book", currency_pair=pair, limit=5)
    print("gate", pair, code, json.dumps(body)[:300])

for t in TICKERS:
    sym = f"{t}XUSDT"
    code, body = get("https://api.bitget.com/api/v2/spot/market/orderbook", symbol=sym, limit=5)
    print("bitget", sym, code, json.dumps(body)[:300])
