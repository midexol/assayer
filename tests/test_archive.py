import json

from assayer.archive import archive


def test_rows_are_filed_by_day_and_local_files_emptied(tmp_path):
    local, store = tmp_path / "local", tmp_path / "store"
    local.mkdir()
    rows = [
        {"ts": "2026-11-03T23:59:00+00:00", "ticker": "NVDA"},
        {"ts": "2026-11-04T00:01:00+00:00", "ticker": "NVDA"},
    ]
    (local / "reference_prices.jsonl").write_text(
        "\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")

    assert archive(local, store) == 2
    assert (store / "raw/2026-11-03/reference_prices.jsonl").exists()
    assert (store / "raw/2026-11-04/reference_prices.jsonl").exists()
    assert (local / "reference_prices.jsonl").read_text() == ""


def test_archiving_twice_does_not_duplicate(tmp_path):
    local, store = tmp_path / "local", tmp_path / "store"
    local.mkdir()
    (local / "snapshots.jsonl").write_text(
        json.dumps({"ts": "2026-11-03T10:00:00+00:00"}) + "\n", encoding="utf-8")
    archive(local, store)
    archive(local, store)
    lines = (store / "raw/2026-11-03/snapshots.jsonl").read_text().splitlines()
    assert len(lines) == 1
