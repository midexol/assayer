from pathlib import Path

import pytest

from oneprice.registry import RegistryError, load, tickers

HEADER = "ticker,issuer,symbol,chain,address,status,source\n"


def write(tmp_path: Path, rows: str) -> Path:
    path = tmp_path / "tokens.csv"
    path.write_text(HEADER + rows, encoding="utf-8")
    return path


def test_real_registry_loads_and_covers_five_tickers():
    tokens, _ = load()
    assert tickers(tokens) == ["AAPL", "NVDA", "QQQ", "SPY", "TSLA"]


def test_unverified_rows_are_skipped_not_used(tmp_path):
    path = write(
        tmp_path,
        "NVDA,Ondo,NVDAon,ethereum,0x2d1f7226bd1f780af6b9a49dcc0ae00e8df4bdee,verified,x\n"
        "AAPL,Ondo,AAPLon,bsc,0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4,CONFLICT,x\n"
        "SPY,Ondo,SPYon,solana,,TODO,\n",
    )
    tokens, skipped = load(path)
    assert [t.symbol for t in tokens] == ["NVDAon"]
    assert len(skipped) == 2


def test_malformed_address_fails_loudly(tmp_path):
    path = write(tmp_path, "NVDA,Ondo,NVDAon,ethereum,0x123,verified,x\n")
    with pytest.raises(RegistryError):
        load(path)


def test_venue_id_combines_chain_and_symbol():
    tokens, _ = load()
    assert "solana:NVDAx" in {t.venue_id for t in tokens}
