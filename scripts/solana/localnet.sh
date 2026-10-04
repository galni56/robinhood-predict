#!/bin/bash
# Starts a plain local Solana validator (WSL) for the game server: no
# programs of our own, stakes are memo transfers. Ledger is reset each run.
#
# Usage (inside WSL): bash scripts/solana/localnet.sh [--background]
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
LEDGER="$HOME/prophet-ledger"
ARGS=(--reset --quiet --ledger "$LEDGER")

if [ "${1:-}" = "--background" ]; then
  nohup solana-test-validator "${ARGS[@]}" > "$HOME/prophet-validator.log" 2>&1 &
  for _ in $(seq 1 60); do
    solana cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1 && { echo "validator up"; exit 0; }
    sleep 1
  done
  echo "validator did not start; see ~/prophet-validator.log" >&2
  exit 1
fi
exec solana-test-validator "${ARGS[@]}"
