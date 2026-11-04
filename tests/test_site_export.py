import json

import pytest

from assayer.site_export import build, export


def ref(ts, ticker, price, open_=True):
    return {"ts": ts, "ticker": ticker, "price": price, "quote_ts": ts, "market_open": open_, "source": "finnhub"}


def snap(ts, price, size=1000, side="buy", symbol="NVDAx", chain="solana"):
    return {"ts": ts, "ticker": "NVDA", "venue": "jupiter", "chain": chain, "symbol": symbol,
            "side": side, "size_usd": size, "fill_price": price, "k_mult": 1}


def test_premium_uses_latest_reference_at_or_before_the_quote():
    refs = [ref("2026-11-04T10:00:05+00:00", "NVDA", 200.0), ref("2026-11-04T10:05:05+00:00", "NVDA", 210.0)]
    snaps = [snap("2026-11-04T10:00:30+00:00", 202.0), snap("2026-11-04T10:05:30+00:00", 210.0)]
    out = build(snaps, refs)
    venue = out["stocks"]["NVDA"]["venues"][0]
    assert out["rounds"] == ["10:00", "10:05"]
    assert venue["a"] == [pytest.approx(1.0), pytest.approx(0.0)]
    assert venue["ap"] == 210.0
    assert venue["issuer"] == "xStocks"


def test_sells_and_missing_rounds_are_handled():
    refs = [ref("2026-11-04T10:00:00+00:00", "NVDA", 200.0)]
    snaps = [snap("2026-11-04T10:00:30+00:00", 204.0, size=10000),
             snap("2026-11-04T10:00:30+00:00", 199.0, side="sell")]
    venue = build(snaps, refs)["stocks"]["NVDA"]["venues"][0]
    assert venue["a"] == [None]
    assert venue["b"] == [pytest.approx(2.0)]


def test_export_writes_compact_json(tmp_path):
    day = tmp_path / "raw" / "2026-11-04"
    day.mkdir(parents=True)
    (day / "reference_prices.jsonl").write_text(json.dumps(ref("2026-11-04T10:00:00+00:00", "NVDA", 200.0)) + "\n")
    (day / "snapshots.jsonl").write_text(json.dumps(snap("2026-11-04T10:00:30+00:00", 201.0)) + "\n")
    from datetime import datetime, timezone
    path = export(tmp_path, now=datetime(2026, 11, 4, 12, tzinfo=timezone.utc))
    data = json.loads(path.read_text())
    assert data["market_open"] is True
    assert data["stocks"]["NVDA"]["ref"] == 200.0
