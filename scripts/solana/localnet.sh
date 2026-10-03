#!/bin/bash
# Starts a local Solana validator (WSL) with the three Prophet programs
# deployed as upgradeable, the local keypair as upgrade authority, so
# `initialize` passes its upgrade-authority check. Ledger is reset each run.
#
# Usage (inside WSL): bash scripts/solana/localnet.sh [--background]
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
TARGET="${CARGO_TARGET_DIR:-$HOME/prophet-target}/deploy"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LEDGER="$HOME/prophet-ledger"
AUTHORITY="$(solana address)"
id_of() { grep -oE "^$1 = \"[^\"]+\"" "$ROOT/solana/Anchor.toml" | head -1 | cut -d'"' -f2; }

ARGS=(--reset --quiet --ledger "$LEDGER")
for program in asset_race price_arena nickname_registry; do
  ARGS+=(--upgradeable-program "$(id_of "$program")" "$TARGET/$program.so" "$AUTHORITY")
done

if [ "${1:-}" = "--background" ]; then
  nohup solana-test-validator "${ARGS[@]}" > "$HOME/prophet-validator.log" 2>&1 &
  for _ in $(seq 1 60); do
    solana cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1 && { echo "validator up (authority $AUTHORITY)"; exit 0; }
    sleep 1
  done
  echo "validator did not start; see ~/prophet-validator.log" >&2
  exit 1
fi
exec solana-test-validator "${ARGS[@]}"
