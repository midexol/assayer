"""Where collected rows go.

Every row is always appended to local JSONL files (data/local/), which the
collection workflow then archives to the repo's `data` branch. When
DATABASE_URL is set, rows are also inserted into Postgres for the live site.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

LOCAL_DIR = Path(__file__).resolve().parent.parent / "data" / "local"

# Only tables in this allowlist can be written, so a table name never
# comes from untrusted input into SQL.
TABLES = {
    "reference_prices": ["ts", "ticker", "price", "quote_ts", "market_open", "source"],
    "snapshots": ["ts", "ticker", "venue", "chain", "symbol", "side", "size_usd",
                  "fill_price", "k_mult"],
    # Archived to the data branch only; not a Postgres table.
    "collect_errors": ["ts", "source", "venue_id", "error"],
}
LOCAL_ONLY = {"collect_errors"}


def target() -> str:
    return f"{LOCAL_DIR} and postgres" if os.environ.get("DATABASE_URL") else str(LOCAL_DIR)


def write(table: str, rows: list[dict], directory: Path = LOCAL_DIR) -> int:
    if table not in TABLES:
        raise ValueError(f"unknown table {table!r}")
    if not rows:
        return 0
    written = _write_local(table, rows, directory)
    url = os.environ.get("DATABASE_URL")
    if url and table not in LOCAL_ONLY:
        _write_postgres(url, table, rows)
    return written


def _write_local(table: str, rows: list[dict], directory: Path = LOCAL_DIR) -> int:
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / f"{table}.jsonl").open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")
    return len(rows)


def _write_postgres(url: str, table: str, rows: list[dict]) -> int:
    import psycopg  # optional dependency: pip install ".[db]"

    columns = TABLES[table]
    placeholders = ", ".join(["%s"] * len(columns))
    sql = (
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders}) "
        "ON CONFLICT DO NOTHING"
    )
    with psycopg.connect(url) as connection:
        with connection.cursor() as cursor:
            cursor.executemany(sql, [[row[c] for c in columns] for row in rows])
    return len(rows)
