#!/usr/bin/env bash
set -euo pipefail

CONTRACTS_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(dirname "$CONTRACTS_DIR")"
FOUNDRY_BIN="${FOUNDRY_BIN:-/Users/dima/.foundry/bin}"
FORGE="$FOUNDRY_BIN/forge"
ANVIL="$FOUNDRY_BIN/anvil"
RPC_URL="${LOCAL_RPC_URL:-http://127.0.0.1:8545}"
CONFIG_FILE="$CONTRACTS_DIR/.asset-race.local"
MEME_ASSETS_FILE="$REPO_DIR/config/local-meme-assets.json"

# Public addresses from Anvil's standard local-only development accounts.
# Private keys are deliberately never stored or handled by this script.
DEPLOYER_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
DEFAULT_WALLET_A="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
DEFAULT_WALLET_B="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
DEFAULT_WALLET_C="0x90F79bf6EB2c4f870365E785982E1f101E93b906"

usage() {
  printf '%s\n' \
    'Local Asset Race commands:' \
    '  ./local-demo.sh chain' \
    '  ./local-demo.sh deploy [wallet-a-address] [wallet-b-address] [wallet-c-address]' \
    '  ./local-demo.sh serve' \
    '  ./local-demo.sh fund <wallet-address> [whole-token-amount]' \
    '  ./local-demo.sh community-create [stocks|memes] [title] [duration-seconds]' \
    '  ./local-demo.sh add-a <symbol> [race-id]' \
    '  ./local-demo.sh add-b <symbol> [race-id]' \
    '  ./local-demo.sh add-c <symbol> [race-id]' \
    '  ./local-demo.sh open-betting [race-id]' \
    '  ./local-demo.sh bet-a <symbol> [whole-token-amount] [race-id]' \
    '  ./local-demo.sh bet-b <symbol> [whole-token-amount] [race-id]' \
    '  ./local-demo.sh bet-c <symbol> [whole-token-amount] [race-id]' \
    '  ./local-demo.sh advance <seconds>' \
    '  ./local-demo.sh start [race-id]' \
    '  ./local-demo.sh prices <start|winner|negative|tie>' \
    '  ./local-demo.sh resolve [race-id]' \
    '  ./local-demo.sh claim-a [race-id]' \
    '  ./local-demo.sh claim-b [race-id]' \
    '  ./local-demo.sh refund-a [race-id]' \
    '  ./local-demo.sh refund-b [race-id]' \
    '  ./local-demo.sh create [stocks|memes]' \
    '  ./local-demo.sh cancel-unstarted [race-id]' \
    '  ./local-demo.sh void-expired [race-id]' \
    '  ./local-demo.sh inspect [race-id]'
}

require_tools() {
  if [[ ! -x "$FORGE" || ! -x "$ANVIL" ]]; then
    printf 'Foundry binaries were not found in %s\n' "$FOUNDRY_BIN" >&2
    exit 1
  fi
}

load_meme_symbols() {
  node -e '
    const fs = require("node:fs")
    const assets = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
    if (!Array.isArray(assets) || assets.length !== 20) throw new Error("expected exactly 20 local Meme assets")
    const symbols = assets.map(({ symbol, name }) => {
      if (typeof symbol !== "string" || !symbol || Buffer.byteLength(symbol) > 32 || typeof name !== "string" || !name) {
        throw new Error("invalid local Meme asset")
      }
      return symbol
    })
    if (new Set(symbols).size !== symbols.length) throw new Error("duplicate local Meme symbol")
    process.stdout.write(symbols.join(","))
  ' "$MEME_ASSETS_FILE"
}

require_config() {
  if [[ ! -f "$CONFIG_FILE" ]]; then
    printf 'Local deployment config is missing. Run ./local-demo.sh deploy first.\n' >&2
    exit 1
  fi
  # Contains public local contract/account addresses only; never secrets.
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  LOCAL_MEME_RACE_ID="${LOCAL_MEME_RACE_ID:-}"
}

write_config() {
  printf '%s\n' \
    "VITE_ASSET_RACE_NETWORK=local" \
    "VITE_ASSET_RACE_ADDRESS=$LOCAL_ASSET_RACE_ADDRESS" \
    "VITE_LOCAL_RPC_URL=$RPC_URL" \
    "LOCAL_TOKEN_ADDRESS=$LOCAL_TOKEN_ADDRESS" \
    "LOCAL_ORACLE_ADDRESS=$LOCAL_ORACLE_ADDRESS" \
    "LOCAL_ASSET_RACE_ADDRESS=$LOCAL_ASSET_RACE_ADDRESS" \
    "LOCAL_RACE_ID=$LOCAL_RACE_ID" \
    "LOCAL_MEME_RACE_ID=$LOCAL_MEME_RACE_ID" \
    "LOCAL_WALLET_A=$LOCAL_WALLET_A" \
    "LOCAL_WALLET_B=$LOCAL_WALLET_B" \
    "LOCAL_WALLET_C=$LOCAL_WALLET_C" > "$CONFIG_FILE"
}

run_broadcast_script() {
  local contract_name="$1"
  local sender="$2"
  LOCAL_MEME_SYMBOLS="$LOCAL_MEME_SYMBOLS" "$FORGE" script "script/LocalAssetRace.s.sol:$contract_name" \
    --rpc-url "$RPC_URL" \
    --broadcast \
    --unlocked \
    --sender "$sender"
}

require_tools
LOCAL_MEME_SYMBOLS="$(load_meme_symbols)"
command_name="${1:-}"

case "$command_name" in
  chain)
    exec "$ANVIL" --silent --chain-id 31337 --block-time 1
    ;;
  deploy)
    LOCAL_WALLET_A="${2:-$DEFAULT_WALLET_A}"
    LOCAL_WALLET_B="${3:-$DEFAULT_WALLET_B}"
    LOCAL_WALLET_C="${4:-$DEFAULT_WALLET_C}"
    deploy_output="$({ LOCAL_WALLET_A="$LOCAL_WALLET_A" LOCAL_WALLET_B="$LOCAL_WALLET_B" LOCAL_WALLET_C="$LOCAL_WALLET_C" run_broadcast_script DeployLocalAssetRace "$DEPLOYER_ADDRESS"; })"
    printf '%s\n' "$deploy_output"
    LOCAL_TOKEN_ADDRESS="$(printf '%s\n' "$deploy_output" | awk '$1 == "LOCAL_TOKEN_ADDRESS" { print $2 }' | tail -n 1)"
    LOCAL_ORACLE_ADDRESS="$(printf '%s\n' "$deploy_output" | awk '$1 == "LOCAL_ORACLE_ADDRESS" { print $2 }' | tail -n 1)"
    LOCAL_ASSET_RACE_ADDRESS="$(printf '%s\n' "$deploy_output" | awk '$1 == "LOCAL_ASSET_RACE_ADDRESS" { print $2 }' | tail -n 1)"
    if [[ -z "$LOCAL_TOKEN_ADDRESS" || -z "$LOCAL_ORACLE_ADDRESS" || -z "$LOCAL_ASSET_RACE_ADDRESS" ]]; then
      printf 'Could not parse local deployment addresses.\n' >&2
      exit 1
    fi
    stock_output="$({ LOCAL_ASSET_RACE_ADDRESS="$LOCAL_ASSET_RACE_ADDRESS" LOCAL_RACE_CATEGORY=stock run_broadcast_script CreateLocalAssetRace "$DEPLOYER_ADDRESS"; })"
    meme_output="$({ LOCAL_ASSET_RACE_ADDRESS="$LOCAL_ASSET_RACE_ADDRESS" LOCAL_RACE_CATEGORY=meme run_broadcast_script CreateLocalAssetRace "$DEPLOYER_ADDRESS"; })"
    printf '%s\n%s\n' "$stock_output" "$meme_output"
    LOCAL_RACE_ID="$(printf '%s\n' "$stock_output" | awk '$1 == "LOCAL_RACE_ID" { print $2 }' | tail -n 1)"
    LOCAL_MEME_RACE_ID="$(printf '%s\n' "$meme_output" | awk '$1 == "LOCAL_RACE_ID" { print $2 }' | tail -n 1)"
    if [[ -z "$LOCAL_RACE_ID" || -z "$LOCAL_MEME_RACE_ID" ]]; then
      printf 'Could not create local platform races.\n' >&2
      exit 1
    fi
    write_config
    printf 'Saved public local addresses to %s\n' "$CONFIG_FILE"
    ;;
  serve)
    require_config
    cd "$REPO_DIR"
    VITE_ASSET_RACE_NETWORK=local \
      VITE_ASSET_RACE_ADDRESS="$LOCAL_ASSET_RACE_ADDRESS" \
      VITE_LOCAL_RPC_URL="$RPC_URL" \
      npm run dev -- --host 127.0.0.1
    ;;
  fund)
    require_config
    recipient="${2:?Usage: ./local-demo.sh fund <wallet-address> [amount]}"
    amount="${3:-1000}"
    LOCAL_TOKEN_ADDRESS="$LOCAL_TOKEN_ADDRESS" LOCAL_RECIPIENT="$recipient" LOCAL_AMOUNT_TOKENS="$amount" \
      run_broadcast_script FundLocalAssetRaceWallet "$DEPLOYER_ADDRESS"
    ;;
  community-create)
    require_config
    category='stock'
    argument_offset=2
    if [[ "${2:-}" == 'stocks' || "${2:-}" == 'stock' ]]; then
      argument_offset=3
    elif [[ "${2:-}" == 'memes' || "${2:-}" == 'meme' ]]; then
      category='meme'
      argument_offset=3
    fi
    title="${!argument_offset:-${category^^} COMMUNITY DASH}"
    duration_index=$((argument_offset + 1))
    duration="${!duration_index:-60}"
    create_output="$({ LOCAL_ASSET_RACE_ADDRESS="$LOCAL_ASSET_RACE_ADDRESS" LOCAL_RACE_CATEGORY="$category" LOCAL_RACE_TITLE="$title" LOCAL_RACE_DURATION="$duration" run_broadcast_script CreateLocalCommunityRace "$LOCAL_WALLET_A"; })"
    printf '%s\n' "$create_output"
    LOCAL_RACE_ID="$(printf '%s\n' "$create_output" | awk '$1 == "LOCAL_RACE_ID" { print $2 }' | tail -n 1)"
    write_config
    printf 'Current local community race is now #%s.\n' "$LOCAL_RACE_ID"
    ;;
  add-a|add-b|add-c)
    require_config
    asset="${2:?Usage: ./local-demo.sh $command_name <asset> [race-id]}"
    asset="$(printf '%s' "$asset" | tr '[:lower:]' '[:upper:]')"
    race_id="${3:-$LOCAL_RACE_ID}"
    case "$command_name" in
      add-a) sender="$LOCAL_WALLET_A" ;;
      add-b) sender="$LOCAL_WALLET_B" ;;
      add-c) sender="$LOCAL_WALLET_C" ;;
    esac
    LOCAL_ASSET_RACE_ADDRESS="$LOCAL_ASSET_RACE_ADDRESS" LOCAL_RACE_ID="$race_id" LOCAL_ASSET_SYMBOL="$asset" \
      run_broadcast_script AddLocalRaceAsset "$sender"
    ;;
  bet-a|bet-b|bet-c)
    require_config
    asset="${2:?Usage: ./local-demo.sh $command_name <asset> [amount] [race-id]}"
    amount="${3:-10}"
    race_id="${4:-$LOCAL_RACE_ID}"
    asset="$(printf '%s' "$asset" | tr '[:lower:]' '[:upper:]')"
    case "$command_name" in
      bet-a) sender="$LOCAL_WALLET_A" ;;
      bet-b) sender="$LOCAL_WALLET_B" ;;
      bet-c) sender="$LOCAL_WALLET_C" ;;
    esac
    LOCAL_ASSET_RACE_ADDRESS="$LOCAL_ASSET_RACE_ADDRESS" LOCAL_RACE_ID="$race_id" \
      LOCAL_ASSET_SYMBOL="$asset" LOCAL_AMOUNT_TOKENS="$amount" \
      run_broadcast_script BetLocalAssetRace "$sender"
    ;;
  advance)
    seconds="${2:?Usage: ./local-demo.sh advance <seconds>}"
    curl -fsS -H 'Content-Type: application/json' \
      --data "{\"jsonrpc\":\"2.0\",\"method\":\"evm_increaseTime\",\"params\":[$seconds],\"id\":1}" "$RPC_URL"
    printf '\n'
    curl -fsS -H 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","method":"evm_mine","params":[],"id":2}' "$RPC_URL"
    printf '\n'
    ;;
  prices)
    require_config
    scenario="${2:?Usage: ./local-demo.sh prices <start|winner|negative|tie>}"
    LOCAL_ORACLE_ADDRESS="$LOCAL_ORACLE_ADDRESS" LOCAL_PRICE_SCENARIO="$scenario" \
      run_broadcast_script SetLocalAssetRacePrices "$DEPLOYER_ADDRESS"
    ;;
  create)
    require_config
    category="${2:-stock}"
    [[ "$category" == 'memes' ]] && category='meme'
    [[ "$category" == 'stocks' ]] && category='stock'
    if [[ "$category" != 'stock' && "$category" != 'meme' ]]; then
      printf 'Usage: ./local-demo.sh create [stocks|memes]\n' >&2
      exit 1
    fi
    create_output="$({ LOCAL_ASSET_RACE_ADDRESS="$LOCAL_ASSET_RACE_ADDRESS" LOCAL_ORACLE_ADDRESS="$LOCAL_ORACLE_ADDRESS" LOCAL_RACE_CATEGORY="$category" run_broadcast_script CreateLocalAssetRace "$DEPLOYER_ADDRESS"; })"
    printf '%s\n' "$create_output"
    LOCAL_RACE_ID="$(printf '%s\n' "$create_output" | awk '$1 == "LOCAL_RACE_ID" { print $2 }' | tail -n 1)"
    write_config
    printf 'Current local race is now #%s.\n' "$LOCAL_RACE_ID"
    ;;
  open-betting|start|resolve|cancel-unstarted|void-expired|claim-a|claim-b|refund-a|refund-b)
    require_config
    race_id="${2:-$LOCAL_RACE_ID}"
    action="$command_name"
    sender="$DEPLOYER_ADDRESS"
    case "$command_name" in
      open-betting) sender="$LOCAL_WALLET_C" ;;
      claim-a) action='claim'; sender="$LOCAL_WALLET_A" ;;
      claim-b) action='claim'; sender="$LOCAL_WALLET_B" ;;
      refund-a) action='refund'; sender="$LOCAL_WALLET_A" ;;
      refund-b) action='refund'; sender="$LOCAL_WALLET_B" ;;
    esac
    LOCAL_ASSET_RACE_ADDRESS="$LOCAL_ASSET_RACE_ADDRESS" LOCAL_RACE_ID="$race_id" LOCAL_RACE_ACTION="$action" \
      run_broadcast_script ManageLocalAssetRace "$sender"
    ;;
  inspect)
    require_config
    race_id="${2:-$LOCAL_RACE_ID}"
    LOCAL_ASSET_RACE_ADDRESS="$LOCAL_ASSET_RACE_ADDRESS" LOCAL_RACE_ID="$race_id" \
      "$FORGE" script script/LocalAssetRace.s.sol:InspectLocalAssetRace --rpc-url "$RPC_URL"
    ;;
  *)
    usage
    exit 1
    ;;
esac
