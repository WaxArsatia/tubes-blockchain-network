#!/usr/bin/env bash
set -Eeuo pipefail

# Stop and remove the local docker-compose.yml stack, including Besu chain data,
# Blockscout database data, IPFS data, project network, and generated local
# validator config. This script intentionally does not use
# docker-compose.distributed.yml.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-besu-qbft-local}"

YES=0
START=0
PULL=0
CLEAN_FRONTEND_ENV=0
PURGE_HARDHAT=0

usage() {
  cat <<EOF
Usage:
  scripts/fresh-clean-local.sh [options]

Options:
  -y, --yes              Run without confirmation prompt.
  --start                After cleaning, run ./setup.sh and docker compose up -d.
  --pull                 Pull compose images before --start.
  --clean-frontend-env   Backup and remove tubes-blockchain-fe/.env.local.
  --purge-hardhat        Remove Hardhat artifacts/ and cache/.
  -h, --help             Show this help.

Environment:
  COMPOSE_FILE           Compose file to use. Default: docker-compose.yml
  COMPOSE_PROJECT_NAME   Compose project name. Default: besu-qbft-local

Examples:
  scripts/fresh-clean-local.sh
  scripts/fresh-clean-local.sh --yes --start
  scripts/fresh-clean-local.sh --yes --start --pull --clean-frontend-env
EOF
}

log() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
die() { printf '[ERROR] %s\n' "$*" >&2; exit 1; }

while (($#)); do
  case "$1" in
    -y|--yes)
      YES=1
      ;;
    --start)
      START=1
      ;;
    --pull)
      PULL=1
      ;;
    --clean-frontend-env)
      CLEAN_FRONTEND_ENV=1
      ;;
    --purge-hardhat)
      PURGE_HARDHAT=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
  shift
done

cd "$ROOT_DIR"

command -v docker >/dev/null 2>&1 || die "Docker is not installed or not in PATH."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is not available."
[ -f "$COMPOSE_FILE" ] || die "Missing compose file: $COMPOSE_FILE"
[ "$COMPOSE_FILE" = "docker-compose.yml" ] || warn "COMPOSE_FILE is '$COMPOSE_FILE'. This script is intended for docker-compose.yml."

cat <<EOF
This will clean the local BPJS/Besu stack:
  - docker compose project: $COMPOSE_PROJECT_NAME
  - compose file: $COMPOSE_FILE
  - containers/services from docker-compose.yml
  - compose volumes: Besu node data, IPFS data, PostgreSQL data
  - compose network
  - generated local validator files:
      config/networkFiles
      config/nodes
      config/static-nodes.json
EOF

if [ "$CLEAN_FRONTEND_ENV" -eq 1 ]; then
  cat <<EOF
  - tubes-blockchain-fe/.env.local (backed up first)
EOF
fi

if [ "$PURGE_HARDHAT" -eq 1 ]; then
  cat <<EOF
  - Hardhat artifacts/ and cache/
EOF
fi

if [ "$YES" -ne 1 ]; then
  printf 'Continue? Type "RESET" to proceed: '
  read -r answer
  [ "$answer" = "RESET" ] || die "Aborted."
fi

log "Stopping and removing compose stack, volumes, and orphan containers..."
docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT_NAME" down --volumes --remove-orphans --timeout 60 || true

log "Removing known local containers if they still exist..."
containers=(
  besu-node1
  besu-node2
  besu-node3
  besu-node4
  besu-node5
  ipfs-kubo
  blockscout-postgres
  blockscout
  blockscout-frontend
  blockscout-proxy
)
for container in "${containers[@]}"; do
  if docker container inspect "$container" >/dev/null 2>&1; then
    docker rm -f "$container" >/dev/null
    log "Removed container: $container"
  fi
done

log "Removing known local named volumes if they still exist..."
volumes=(
  "${COMPOSE_PROJECT_NAME}_node1-data"
  "${COMPOSE_PROJECT_NAME}_node2-data"
  "${COMPOSE_PROJECT_NAME}_node3-data"
  "${COMPOSE_PROJECT_NAME}_node4-data"
  "${COMPOSE_PROJECT_NAME}_node5-data"
  "${COMPOSE_PROJECT_NAME}_ipfs-data"
  "${COMPOSE_PROJECT_NAME}_postgres-data"
)
for volume in "${volumes[@]}"; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    docker volume rm "$volume" >/dev/null
    log "Removed volume: $volume"
  fi
done

network="${COMPOSE_PROJECT_NAME}_besu-net"
if docker network inspect "$network" >/dev/null 2>&1; then
  log "Removing compose network: $network"
  docker network rm "$network" >/dev/null || true
fi

log "Removing generated local validator config..."
rm -rf config/networkFiles config/nodes config/static-nodes.json

if [ "$CLEAN_FRONTEND_ENV" -eq 1 ] && [ -f "tubes-blockchain-fe/.env.local" ]; then
  backup="tubes-blockchain-fe/.env.local.bak.$(date +%Y%m%d%H%M%S)"
  mv tubes-blockchain-fe/.env.local "$backup"
  log "Backed up frontend env to: $backup"
fi

if [ "$PURGE_HARDHAT" -eq 1 ]; then
  log "Removing Hardhat artifacts and cache..."
  rm -rf artifacts cache
fi

log "Local clean complete."

if [ "$START" -eq 1 ]; then
  log "Regenerating local Besu genesis and validator keys with ./setup.sh..."
  ./setup.sh

  if [ "$PULL" -eq 1 ]; then
    log "Pulling compose images..."
    docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT_NAME" pull
  fi

  log "Starting local compose stack..."
  docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT_NAME" up -d
  docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT_NAME" ps
else
  cat <<EOF

Next steps for a fresh run:
  ./setup.sh
  docker compose up -d

After the chain is fresh, redeploy contracts and update frontend env before demo:
  DEPLOYER_PRIVATE_KEY=0x... npm run redeploy
EOF
fi
