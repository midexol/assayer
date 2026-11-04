from datetime import datetime, timezone

import pytest

from assayer.collect import quotes
from assayer.collect.quotes import (QuoteError, fill_price, from_units, parse_erc20_decimals,
                                    parse_jupiter, parse_kyber, quote_token, to_units)
from assayer.registry import Token

NOW = datetime(2026, 11, 3, 15, 0, tzinfo=timezone.utc)


def test_unit_conversion_round_trips():
    assert to_units(1000, 6) == 1_000_000_000
    assert from_units(1_000_000_000, 6) == 1000
    assert to_units(1000, 18) == 10**21


def test_fill_price_is_stable_per_token():
    assert fill_price(1000, 5) == 200
    with pytest.raises(QuoteError):
        fill_price(1000, 0)


def test_parsers_read_output_amounts():
    assert parse_jupiter({"inAmount": "1000000000", "outAmount": "4975000000"}) == 4975000000
    assert parse_kyber({"code": 0, "data": {"routeSummary": {"amountOut": "123"}}}) == 123
    assert parse_erc20_decimals({"result": "0x" + "0" * 62 + "12"}) == 18


@pytest.mark.parametrize("body", [{"error": "No routes found"}, {"outAmount": "0"}])
def test_jupiter_without_route_raises(body):
    with pytest.raises(QuoteError):
        parse_jupiter(body)


def test_kyber_error_code_raises():
    with pytest.raises(QuoteError):
        parse_kyber({"code": 4008, "message": "route not found"})


class FakeQuoter:
    """Buys 5 tokens per $1,000 and sells them back for 990 (a 1% round trip)."""

    def decimals(self, token):
        return 8

    def swap_out(self, chain, token_in, token_out, amount_in):
        stable = quotes.STABLES[chain]
        if token_in == stable.address:  # buying tokens with stablecoin
            usd = from_units(amount_in, stable.decimals)
            return to_units(usd / 200, 8)
        tokens = from_units(amount_in, 8)  # selling tokens for stablecoin
        return to_units(tokens * 198, stable.decimals)


def test_quote_token_builds_buy_and_sell_rows_for_each_size():
    token = Token("NVDA", "xStocks", "NVDAx", "solana",
                  "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", "verified", "test")
    rows = quote_token(FakeQuoter(), token, NOW)
    assert len(rows) == 4
    buys = [r for r in rows if r["side"] == "buy"]
    sells = [r for r in rows if r["side"] == "sell"]
    assert {r["size_usd"] for r in buys} == {1000, 10000}
    assert all(r["fill_price"] == pytest.approx(200) for r in buys)
    assert all(r["fill_price"] == pytest.approx(198) for r in sells)
    assert all(r["venue"] == "jupiter" for r in rows)


def test_spl_decimals_parsed_from_token_supply():
    from assayer.collect.quotes import parse_spl_decimals
    body = {"result": {"value": {"amount": "1", "decimals": 8, "uiAmount": 1e-8}}}
    assert parse_spl_decimals(body) == 8
    with pytest.raises(QuoteError):
        parse_spl_decimals({"error": {"message": "Invalid param"}})


def test_one_failing_venue_does_not_stop_the_rest(monkeypatch):
    class Flaky(FakeQuoter):
        def decimals(self, token):
            if token.symbol == "NVDAx":
                raise AttributeError("'str' object has no attribute 'get'")
            return 8

    monkeypatch.setattr(quotes, "Quoter", lambda session: Flaky())
    rows, errors = quotes.collect(NOW)
    assert [e["venue_id"] for e in errors] == ["solana:NVDAx"]
    assert rows and all(r["symbol"] != "NVDAx" for r in rows)


class _FakeResponse:
    def __init__(self, status, body=None):
        self.status_code = status
        self._body = body

    def json(self):
        return self._body


class _FlakySession:
    """Fails with the given outcomes in order, then succeeds."""

    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    def request(self, *args, **kwargs):
        self.calls += 1
        outcome = self.outcomes.pop(0) if self.outcomes else _FakeResponse(200, {"ok": True})
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def test_request_retries_server_errors_and_dropped_connections(monkeypatch):
    import requests
    from assayer.collect import quotes

    monkeypatch.setattr(quotes.time, "sleep", lambda s: None)
    quoter = quotes.Quoter.__new__(quotes.Quoter)
    quoter.session = _FlakySession([_FakeResponse(522), requests.ConnectionError("reset")])
    assert quoter._request("GET", "https://example") == {"ok": True}
    assert quoter.session.calls == 3


def test_request_gives_up_after_retries(monkeypatch):
    from assayer.collect import quotes

    monkeypatch.setattr(quotes.time, "sleep", lambda s: None)
    quoter = quotes.Quoter.__new__(quotes.Quoter)
    quoter.session = _FlakySession([_FakeResponse(503)] * 10)
    with pytest.raises(quotes.QuoteError, match="failed after 3 retries"):
        quoter._request("GET", "https://example")
    assert quoter.session.calls == 4


def test_rate_limits_wait_longer(monkeypatch):
    from assayer.collect import quotes

    waits = []
    monkeypatch.setattr(quotes.time, "sleep", waits.append)
    quoter = quotes.Quoter.__new__(quotes.Quoter)
    quoter.session = _FlakySession([_FakeResponse(429), _FakeResponse(429)])
    quoter._request("GET", "https://example")
    assert waits[1] >= quotes.RATE_LIMIT_WAIT and waits[2] >= 2 * quotes.RATE_LIMIT_WAIT
