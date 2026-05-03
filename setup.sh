#!/bin/bash
set -Eeuo pipefail

# ============================================================
#  Besu QBFT 5-Node Network - Setup Script
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()   { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

BESU_VERSION="${BESU_VERSION:-26.4.0}"
BESU_IMAGE="${BESU_IMAGE:-hyperledger/besu:${BESU_VERSION}}"
EXPECTED_VALIDATORS="${EXPECTED_VALIDATORS:-5}"

echo ""
echo "========================================"
echo "  Besu QBFT 5-Node Network Setup"
echo "========================================"
echo ""

# ── Prerequisites ──────────────────────────────────────────
command -v docker >/dev/null 2>&1 || error "Docker is not installed"
docker compose version >/dev/null 2>&1 || error "Docker Compose v2 is not installed"
ok "Docker and Docker Compose found"

[ -f "config/qbftConfigFile.json" ] || error "Missing config/qbftConfigFile.json. Extract besu-network.zip first or restore the config directory."

CONFIG_VALIDATOR_COUNT=$(sed -n 's/.*"count"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' config/qbftConfigFile.json | tail -n 1)
if [ "$CONFIG_VALIDATOR_COUNT" != "$EXPECTED_VALIDATORS" ]; then
  error "config/qbftConfigFile.json generates ${CONFIG_VALIDATOR_COUNT:-unknown} validators, but this Compose setup expects ${EXPECTED_VALIDATORS}"
fi

# ── Clean previous generated files ─────────────────────────
if [ -d "config/networkFiles" ] || [ -d "config/nodes" ] || [ -f "config/static-nodes.json" ]; then
  warn "Found existing generated files. Cleaning up..."
  rm -rf config/networkFiles config/nodes config/static-nodes.json
fi

# ── Step 1: Generate blockchain config ────────────────────
log "Generating node keys and genesis block with ${BESU_IMAGE}..."

GEN_OUTPUT=$(docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$(pwd)/config":/config \
  "${BESU_IMAGE}" \
  operator generate-blockchain-config \
  --config-file=/config/qbftConfigFile.json \
  --to=/config/networkFiles \
  --private-key-file-name=key 2>&1) || GEN_STATUS=$?

GEN_STATUS=${GEN_STATUS:-0}
KEY_COUNT=0
if [ -d "config/networkFiles/keys" ]; then
  KEY_COUNT=$(find config/networkFiles/keys -mindepth 1 -maxdepth 1 -type d | wc -l)
fi

if [ "$GEN_STATUS" -ne 0 ]; then
  if [ -f "config/networkFiles/genesis.json" ] && [ "$KEY_COUNT" -eq "$EXPECTED_VALIDATORS" ] && [[ "$GEN_OUTPUT" == *"Output directory already exists"* ]]; then
    warn "Besu returned a post-generation output-directory warning; generated files are complete, continuing..."
  else
    echo "$GEN_OUTPUT"
    error "Failed to generate genesis and node keys"
  fi
fi

ok "Genesis and keys generated"

# ── Step 2: Enumerate node key directories ────────────────
mapfile -t NODE_DIRS < <(find config/networkFiles/keys -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | LC_ALL=C sort)

if [ "${#NODE_DIRS[@]}" -ne "$EXPECTED_VALIDATORS" ]; then
  error "Expected ${EXPECTED_VALIDATORS} key directories, found ${#NODE_DIRS[@]}"
fi

# ── Step 3: Copy keys to per-node directories ─────────────
log "Distributing keys to node directories..."

for i in $(seq 1 "$EXPECTED_VALIDATORS"); do
  DIR="${NODE_DIRS[$((i-1))]}"
  mkdir -p "config/nodes/node${i}"
  cp "config/networkFiles/keys/${DIR}/key"     "config/nodes/node${i}/key"
  cp "config/networkFiles/keys/${DIR}/key.pub" "config/nodes/node${i}/key.pub"
  ok "Node $i → address: $DIR"
done

# ── Step 4: Build static-nodes.json ──────────────────────
log "Building static-nodes.json..."

{
  printf '[\n'
  for i in $(seq 1 "$EXPECTED_VALIDATORS"); do
    PUBKEY=$(sed 's/^0x//' "config/nodes/node${i}/key.pub")
    ENTRY="  \"enode://${PUBKEY}@172.20.0.$((10 + i)):30303\""
    if [ "$i" -lt "$EXPECTED_VALIDATORS" ]; then
      printf '%s,\n' "$ENTRY"
    else
      printf '%s\n' "$ENTRY"
    fi
  done
  printf ']\n'
} > config/static-nodes.json
ok "static-nodes.json created with ${EXPECTED_VALIDATORS} enodes"

# ── Done ──────────────────────────────────────────────────
echo ""
echo "========================================"
echo -e "  ${GREEN}Setup complete!${NC}"
echo "========================================"
echo ""
echo "  Next steps:"
echo "    1.  docker compose up -d"
echo "    2.  Open Blockscout → http://localhost:3000"
echo "    3.  Connect MetaMask → http://localhost:8545 (Chain ID: 1337)"
echo ""
echo "  RPC Endpoints:"
echo "    Node 1 → http://localhost:8545"
echo "    Node 2 → http://localhost:8547"
echo "    Node 3 → http://localhost:8549"
echo "    Node 4 → http://localhost:8551"
echo "    Node 5 → http://localhost:8553"
echo ""
echo "  Test account (pre-funded):"
echo "    Address → 0xfe3b557e8fb62b89f4916b721be55ceb828dbd73"
echo "    Key     → 8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63"
echo ""
