import pytest

from assayer.thesis import GAP_POINTS, build, stock_thesis


def ref(ts, price=100.0, open_=True, ticker="NVDA"):
    return {"ts": ts, "ticker": ticker, "price": price, "quote_ts": ts, "market_open": open_, "source": "finnhub"}


def snap(ts, venue, price, side="buy", size=1000, ticker="NVDA"):
    chain, symbol = venue.split(":")
    return {"ts": ts, "ticker": ticker, "venue": "x", "chain": chain, "symbol": symbol,
            "side": side, "size_usd": size, "fill_price": price, "k_mult": 1}


def test_stock_thesis_on_hand_built_rounds():
    # Three rounds, three venues. "b" is a thin pool (+50%).
    buys = {
        "r1": {"s:x": 0.1, "e:on": 0.6, "b:on": 50.0},
        "r2": {"s:x": 0.2, "e:on": 0.1, "b:on": 51.0},
        "r3": {"s:x": 0.1, "e:on": 0.9, "b:on": 49.0},
    }
    sells = {r: {v: p - 0.2 for v, p in vs.items()} for r, vs in buys.items()}
    t = stock_thesis(buys, sells, ["r1", "r2", "r3"])

    venues = {v["id"]: v for v in t["venues"]}
    assert venues["b:on"]["thin"] and not venues["s:x"]["thin"]
    assert venues["s:x"]["round_trip_median"] == pytest.approx(0.2, abs=1e-3)

    u = t["usable_venues"]
    assert u["best_static_venue"] == "s:x"  # median 0.1 beats e:on's 0.6
    assert u["spread_median"] == pytest.approx(0.5)  # spreads 0.5, 0.1, 0.8
    assert u["tax_mean"] == pytest.approx((0.25 + 0.05 + 0.4) / 3, abs=1e-3)
    # Only r2 has a cheaper venue than s:x, by 0.1.
    assert u["router_savings_mean"] == pytest.approx(0.1 / 3, abs=1e-3)
    assert u["router_beats_static_share"] == pytest.approx(1 / 3, abs=1e-3)
    # Spread above GAP_POINTS in r1 and r3, separately.
    assert GAP_POINTS == 0.5
    assert u["gaps"] == 1 and u["gap_minutes_median"] == 5

    assert t["all_venues"]["tax_mean"] > 10  # the thin pool swamps the average


def test_build_uses_only_open_market_rounds():
    refs = [ref("2026-11-03T20:00:00+00:00"), ref("2026-11-03T21:05:00+00:00", open_=False)]
    snaps = [
        snap("2026-11-03T20:00:30+00:00", "solana:NVDAx", 100.1),
        snap("2026-11-03T20:00:30+00:00", "ethereum:NVDAon", 100.5),
        snap("2026-11-03T21:05:30+00:00", "solana:NVDAx", 130.0),
        snap("2026-11-03T21:05:30+00:00", "ethereum:NVDAon", 100.0),
    ]
    out = build(snaps, refs)
    assert out["rounds_total"] == 2 and out["rounds_used"] == 1 and out["market_open_only"]
    u = out["stocks"]["NVDA"]["1000"]["usable_venues"]
    assert u["spread_median"] == pytest.approx(0.4, abs=1e-3)
    assert out["headline"]["1000"]["tax_mean"] == pytest.approx(0.2, abs=1e-3)


def test_build_falls_back_to_all_rounds_when_market_never_open():
    refs = [ref("2026-11-03T22:00:00+00:00", open_=False)]
    snaps = [snap("2026-11-03T22:00:30+00:00", "solana:NVDAx", 100.0)]
    out = build(snaps, refs)
    assert out["rounds_used"] == 1 and out["market_open_only"] is False
