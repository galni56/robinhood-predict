#!/bin/bash
# Rebuilds hastefun.xyz when main has a new commit. Run every minute by the
# systemd timer hastefun-site.timer (scripts/solana/systemd/). Only the site
# is rebuilt: the game server and the price service keep running the code
# they started with, since restarting them is a mainnet action done by hand.
set -euo pipefail
REPO=/opt/prophet-solana
STATE=/var/lib/prophet/site-built-commit

exec 9>/run/hastefun-site.lock
flock -n 9 || exit 0

cd "$REPO"
git fetch -q origin main
remote=$(git rev-parse origin/main)
[ "$(cat "$STATE" 2>/dev/null)" = "$remote" ] && exit 0

echo "main is at ${remote:0:7}: rebuilding the site"
bash "$REPO/scripts/solana/build-site.sh"
git rev-parse HEAD > "$STATE"
