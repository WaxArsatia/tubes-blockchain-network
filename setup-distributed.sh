#!/bin/bash
set -Eeuo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

ENV_FILE="${ENV_FILE:-.env.distributed}"
OUTPUT_FILE="${OUTPUT_FILE:-config/static-nodes-distributed.json}"

load_env_file() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    ok "Loaded $ENV_FILE"
  else
    warn "$ENV_FILE not found; using exported environment variables"
  fi
}

get_config_validator_count() {
  sed -n 's/.*"count"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' config/qbftConfigFile.json | tail -n 1
}

require_var() {
  local name="$1"
  local value="${!name:-}"
  [ -n "$value" ] || error "Missing required variable: $name"
}

require_port() {
  local name="$1"
  local value="${!name:-}"
  require_var "$name"
  [[ "$value" =~ ^[0-9]+$ ]] || error "$name must be numeric"
  [ "$value" -ge 1 ] && [ "$value" -le 65535 ] || error "$name must be between 1 and 65535"
}

echo ""
echo "========================================"
echo "  Besu Distributed Static Nodes Setup"
echo "========================================"
echo ""

[ -f "config/qbftConfigFile.json" ] || error "Missing config/qbftConfigFile.json"
[ -d "config/nodes" ] || error "Missing config/nodes. Run ./setup.sh once, then share the generated config directory with all participants."

load_env_file

CONFIG_NODE_COUNT="$(get_config_validator_count)"
NODE_COUNT="${NODE_COUNT:-$CONFIG_NODE_COUNT}"

[[ "$NODE_COUNT" =~ ^[0-9]+$ ]] || error "NODE_COUNT must be numeric"
[ "$NODE_COUNT" -eq "$CONFIG_NODE_COUNT" ] || error "NODE_COUNT=$NODE_COUNT does not match config/qbftConfigFile.json count=$CONFIG_NODE_COUNT"

log "Writing $OUTPUT_FILE for $NODE_COUNT validators..."

{
  printf '[\n'
  for i in $(seq 1 "$NODE_COUNT"); do
    key_file="config/nodes/node${i}/key.pub"
    [ -f "$key_file" ] || error "Missing $key_file. Run ./setup.sh and distribute the same generated config to every participant."

    host_var="NODE${i}_HOST"
    port_var="NODE${i}_P2P_PORT"
    require_var "$host_var"
    require_port "$port_var"

    pubkey="$(sed 's/^0x//' "$key_file")"
    host="${!host_var}"
    port="${!port_var}"
    entry="  \"enode://${pubkey}@${host}:${port}\""

    if [ "$i" -lt "$NODE_COUNT" ]; then
      printf '%s,\n' "$entry"
    else
      printf '%s\n' "$entry"
    fi
  done
  printf ']\n'
} > "$OUTPUT_FILE"

ok "Created $OUTPUT_FILE"
echo ""
echo "Share this generated file, plus config/networkFiles and config/nodes, with every participant."
echo "Then each participant starts only the profiles for the validators they own."
echo "The participant who starts --profile node1 also starts Blockscout at http://localhost:4000."
