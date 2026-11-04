from datetime import datetime, timezone

import pytest

from assayer.collect import cex

ASKS = [(100.0, 5.0), (101.0, 10.0), (110.0, 1000.0)]
BIDS = [(99.0, 5.0), (98.0, 10.0), (90.0, 1000.0)]


def test_buy_walks_the_asks():
    assert cex.buy_with(ASKS, 400) == pytest.approx(4.0)
    # $500 takes all 5 at 100, then $505 buys 5 more at 101.
    assert cex.buy_with(ASKS, 1005) == pytest.approx(10.0)


def test_sell_walks_the_bids():
    assert cex.sell(BIDS, 2) == pytest.approx(198.0)
    assert cex.sell(BIDS, 7) == pytest.approx(5 * 99 + 2 * 98)


def test_thin_book_raises():
    with pytest.raises(cex.BookTooThin):
        cex.buy_with([(100.0, 1.0)], 1000)
    with pytest.raises(cex.BookTooThin):
        cex.sell([(100.0, 1.0)], 2)


def test_parse_book_sorts_sides():
    asks, bids = cex.parse_book({"asks": [["101", "1"], ["100", "2"]], "bids": [["98", "1"], ["99", "3"]]})
    assert asks[0] == (100.0, 2.0) and bids[0] == (99.0, 3.0)
    with pytest.raises(ValueError):
        cex.parse_book({"label": "INVALID_CURRENCY_PAIR"})


def test_rows_match_the_onchain_schema():
    now = datetime(2026, 11, 4, 15, tzinfo=timezone.utc)
    rows = cex.rows_for("NVDA", ASKS, BIDS, now)
    assert len(rows) == 4
    buy_1k = next(r for r in rows if r["side"] == "buy" and r["size_usd"] == 1000)
    assert buy_1k["chain"] == "gate" and buy_1k["symbol"] == "NVDAx"
    assert buy_1k["fill_price"] == pytest.approx(1000 / cex.buy_with(ASKS, 1000), rel=1e-6)
    sell_1k = next(r for r in rows if r["side"] == "sell" and r["size_usd"] == 1000)
    assert sell_1k["fill_price"] < buy_1k["fill_price"]


class _Session:
    def __init__(self, bodies):
        self.bodies = bodies

    def get(self, url, params, timeout):
        body = self.bodies[params["currency_pair"]]

        class R:
            def raise_for_status(self):
                pass

            def json(self):
                return body

        return R()


def test_one_bad_market_does_not_stop_the_rest():
    good = {"asks": [[str(p), str(s)] for p, s in ASKS], "bids": [[str(p), str(s)] for p, s in BIDS]}
    bodies = {f"{t}X_USDT": good for t in cex.TICKERS}
    bodies["SPYX_USDT"] = {"label": "INVALID_CURRENCY_PAIR"}
    rows, errors = cex.collect(session=_Session(bodies))
    assert len(rows) == 4 * 4 and len(errors) == 1 and errors[0]["venue_id"] == "gate:SPYx"
