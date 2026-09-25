#!/usr/bin/env bash
# Replaces the manual "purge, sleep, curl, grep, repeat" loop done by hand
# throughout a long debugging session. Purges jsDelivr's @main cache for both
# deployed files, waits for propagation, then diffs what jsDelivr actually
# serves against the exact commit that was pushed - so "is this even the
# CDN's fault" stops being a guessing game.
#
# Usage: scripts/verify-cdn.sh <commit-sha>
#   scripts/verify-cdn.sh $(git rev-parse HEAD)

set -euo pipefail

REPO="graciax452/ss-daily-lesson-app"
SHA="${1:-}"

if [ -z "$SHA" ]; then
  echo "Usage: $0 <commit-sha>" >&2
  exit 1
fi

FILES=("app.js" "style.css" "dashboard.js" "dashboard.css")
FAILED=0

for FILE in "${FILES[@]}"; do
  echo "Purging jsDelivr cache for $FILE..."
  curl -s "https://purge.jsdelivr.net/gh/${REPO}@main/${FILE}" > /dev/null
done

echo "Waiting for propagation..."
sleep 5

for FILE in "${FILES[@]}"; do
  EXPECTED=$(git show "${SHA}:${FILE}")
  ACTUAL=$(curl -s "https://cdn.jsdelivr.net/gh/${REPO}@main/${FILE}")

  if [ "$EXPECTED" = "$ACTUAL" ]; then
    echo "OK   $FILE matches commit ${SHA:0:7} on @main"
  else
    echo "FAIL $FILE on @main does NOT match commit ${SHA:0:7} - jsDelivr cache is still stale (throttled or slow to propagate)"
    echo "     Test with the pinned commit URL instead in the meantime:"
    echo "     https://cdn.jsdelivr.net/gh/${REPO}@${SHA}/${FILE}"
    FAILED=1
  fi
done

exit $FAILED
