#!/bin/bash
# Builds the site for hastefun.xyz on the VPS and swaps it in.
# Source: the /opt/prophet-solana checkout of main (pulled first). The site
# and the APIs share the origin, so every service path is relative.
#
# Usage (on the VPS, as root): bash /opt/prophet-solana/scripts/solana/build-site.sh
set -euo pipefail
export PATH=/opt/node24/bin:$PATH
REPO=/opt/prophet-solana
TARGET=/var/www/hastefun
DOMAIN=${SITE_DOMAIN:-hastefun.xyz}

cd "$REPO"
git pull -q origin main
# Dependencies only when the lockfile changed since the last build.
LOCK_SUM=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ "$(cat .site-lock-sum 2>/dev/null)" != "$LOCK_SUM" ]; then
  npm install --no-audit --no-fund
  echo "$LOCK_SUM" > .site-lock-sum
fi

rm -rf "$TARGET.new"
VITE_BASE_PATH=/ \
VITE_SOLANA_CLUSTER=mainnet-beta \
VITE_SOLANA_RPC_URL=/api/solana/rpc \
VITE_SOLANA_WS_URL="wss://$DOMAIN/api/solana/ws" \
VITE_PRICE_SERVICE_URL=/api/solana/price-service \
VITE_GAME_SERVER_URL=/api/solana/game-server \
VITE_LAST_DATA_URL=/api/solana/last \
VITE_LAUNCH_RPC_URL="https://$DOMAIN/api/solana/rpc" \
VITE_LAUNCH_WS_URL="wss://$DOMAIN/api/solana/ws" \
VITE_LAUNCH_IPFS_URL="https://$DOMAIN/api/solana/ipfs" \
  npx vite build --outDir "$TARGET.new" --emptyOutDir

# Swap in one step so visitors never see a half-written site.
rm -rf "$TARGET.old"
[ -d "$TARGET" ] && mv "$TARGET" "$TARGET.old"
mv "$TARGET.new" "$TARGET"
echo "site built from $(git log --oneline -1) into $TARGET"
