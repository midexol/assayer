import json
from datetime import datetime, timezone

import pytest

from oneprice import storage
from oneprice.collect.reference import QuoteError, parse_quote

NOW = datetime(2026, 11, 2, 15, 0, tzinfo=timezone.utc)

# Shape of a Finnhub /quote response (values are made up for the test).
SAMPLE = {"c": 210.5, "d": 1.2, "dp": 0.57, "h": 212.0, "l": 208.1,
          "o": 209.0, "pc": 209.3, "t": 1793631600}


def test_parse_quote_reads_price_and_exchange_time():
    price = parse_quote("NVDA", SAMPLE, market_open=True, now=NOW)
    assert price.price == 210.5
    assert price.quote_ts == datetime.fromtimestamp(1793631600, tz=timezone.utc)
    assert price.market_open is True
    assert price.ts == NOW


def test_unknown_symbol_zero_price_is_rejected():
    with pytest.raises(QuoteError):
        parse_quote("NOPE", {"c": 0, "t": 0}, market_open=True, now=NOW)


def test_local_storage_appends_jsonl(tmp_path):
    rows = [parse_quote("NVDA", SAMPLE, True, NOW).as_row()]
    assert storage._write_local("reference_prices", rows, directory=tmp_path) == 1
    line = (tmp_path / "reference_prices.jsonl").read_text().strip()
    assert json.loads(line)["ticker"] == "NVDA"


def test_storage_refuses_unknown_tables():
    with pytest.raises(ValueError):
        storage.write("users; DROP TABLE x", [{"a": 1}])
