"""Move collected rows from data/local/ into the archive checkout (the `data` branch).

Rows are filed by the UTC date of their collection time:
    <archive>/raw/<YYYY-MM-DD>/<table>.jsonl

Run:  python -m assayer.archive <local_dir> <archive_dir>
The local files are emptied afterwards, so a row is archived exactly once.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path


def archive(local_dir: Path, archive_dir: Path) -> int:
    moved = 0
    for source in sorted(local_dir.glob("*.jsonl")):
        by_day: dict[str, list[str]] = defaultdict(list)
        for line in source.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            day = json.loads(line)["ts"][:10]  # ISO timestamp -> YYYY-MM-DD
            by_day[day].append(line)
        for day, lines in by_day.items():
            target = archive_dir / "raw" / day / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("a", encoding="utf-8") as handle:
                handle.write("\n".join(lines) + "\n")
            moved += len(lines)
        source.write_text("", encoding="utf-8")
    return moved


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: python -m assayer.archive <local_dir> <archive_dir>", file=sys.stderr)
        return 2
    moved = archive(Path(argv[0]), Path(argv[1]))
    print(f"archive: moved {moved} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
