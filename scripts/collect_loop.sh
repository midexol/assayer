#!/usr/bin/env bash
# Collect every 5 minutes until LOOP_MINUTES have passed, archiving each round
# to the `data` branch checkout in ./archive.
#
# GitHub's own scheduler runs "*/5" crons only a few times a day on new repos,
# so the workflow keeps one long job alive instead and restarts it at the end.
set -uo pipefail

LOOP_MINUTES="${LOOP_MINUTES:-340}"
INTERVAL=300
deadline=$(( $(date +%s) + LOOP_MINUTES * 60 ))

archive_round() {
  python -m assayer.archive data/local archive || return 1
  python -m assayer.site_export archive || echo "round: site export failed"
  python -m assayer.thesis archive      || echo "round: thesis export failed"
  (
    cd archive
    git add -A
    git diff --cached --quiet && exit 0
    git commit -q -m "Collect $(date -u +%Y-%m-%dT%H:%MZ)"
    git push -q origin data || { git pull -q --rebase origin data && git push -q origin data; }
  )
}

while [ "$(date +%s)" -lt "$deadline" ]; do
  started=$(date +%s)
  python -m assayer.collect.reference || echo "round: reference collector failed"
  python -m assayer.collect.quotes    || echo "round: quote collector failed"
  archive_round                       || echo "round: archive push failed"

  next=$(( (started / INTERVAL + 1) * INTERVAL ))
  wait_for=$(( next - $(date +%s) ))
  [ "$wait_for" -gt 0 ] && sleep "$wait_for"
done
echo "loop: finished after ${LOOP_MINUTES} minutes"
