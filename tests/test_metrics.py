import pytest

from oneprice.metrics import PriceError, VenueQuote, per_share, premium, spread


def test_premium_is_zero_at_reference():
    assert premium(200.0, 200.0) == pytest.approx(0.0)


def test_premium_positive_and_negative():
    assert premium(202.0, 200.0) == pytest.approx(0.01)
    assert premium(198.0, 200.0) == pytest.approx(-0.01)


def test_dividend_multiplier_removes_fake_premium():
    # A token worth 1.02 shares trading at 204 is exactly at fair value.
    assert premium(204.0, 200.0, k=1.02) == pytest.approx(0.0)


def test_per_share_divides_by_multiplier():
    assert per_share(102.0, k=1.02) == pytest.approx(100.0)


@pytest.mark.parametrize("bad", [0, -1, None])
def test_rejects_non_positive_inputs(bad):
    with pytest.raises(PriceError):
        premium(bad, 200.0)
    with pytest.raises(PriceError):
        premium(200.0, bad)
    with pytest.raises(PriceError):
        per_share(200.0, k=bad)


def test_spread_finds_cheapest_and_priciest():
    quotes = [
        VenueQuote("solana:NVDAx", 201.0),
        VenueQuote("bsc:NVDAon", 197.0),
        VenueQuote("ethereum:NVDAon", 199.0),
    ]
    result = spread(quotes, reference_price=200.0)
    assert result.cheapest == "bsc:NVDAon"
    assert result.priciest == "solana:NVDAx"
    assert result.absolute == pytest.approx(4.0)
    assert result.relative == pytest.approx(0.02)


def test_spread_normalizes_multipliers_before_comparing():
    # 204 at k=1.02 equals 200 per share, so both venues are the same price.
    quotes = [VenueQuote("a", 204.0, k=1.02), VenueQuote("b", 200.0)]
    assert spread(quotes, 200.0).absolute == pytest.approx(0.0)


def test_spread_needs_two_venues():
    with pytest.raises(PriceError):
        spread([VenueQuote("only", 200.0)], 200.0)
