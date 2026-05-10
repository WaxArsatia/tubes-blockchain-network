# Node1 IPFS Deployment Design

## Context

The BPJS blockchain plan requires IPFS Kubo for encrypted medical payload storage. The current deployment already provides Besu QBFT validators and Blockscout, but it does not run IPFS. The chosen topology is node1-only IPFS: the participant who runs `node1` also runs Kubo.

## Goals

- Add Kubo to the local Docker Compose deployment.
- Add Kubo to the distributed Docker Compose deployment only under the `node1` profile.
- Persist IPFS repository data across container restarts.
- Expose Kubo API and gateway for local frontend usage.
- Document the node1-only IPFS topology clearly in the README and plan document.

## Non-Goals

- No multi-node IPFS mesh across all validators.
- No private IPFS swarm key.
- No frontend implementation changes.
- No smart contract changes.
- No backend service.

## Architecture

Local mode runs a single `ipfs` container alongside the five Besu validators and Blockscout. Distributed mode runs the same `ipfs` container only when the `node1` profile is started. This keeps IPFS operational ownership aligned with the node1 host, which already owns Blockscout and the public demo services.

Kubo uses the official `ipfs/kubo` image and a named `ipfs-data` volume mounted at `/data/ipfs`. The API and gateway are published to localhost by default:

- API: `http://127.0.0.1:5001`
- Gateway: `http://127.0.0.1:8080`

The swarm port remains available for future connectivity, but the implementation is not required to configure peer discovery across other participant laptops.

## Configuration

The distributed env example should expose these variables:

- `IPFS_API_PORT=5001`
- `IPFS_GATEWAY_PORT=8080`
- `IPFS_SWARM_PORT=4001`
- `IPFS_API_ORIGIN=http://localhost:5173`

Kubo CORS must allow the frontend development origin so a React + Vite app can upload encrypted payloads directly to the Kubo API.

## Data Flow

1. Frontend encrypts the medical payload in the browser.
2. Frontend uploads ciphertext to node1 Kubo through the configured API URL.
3. Kubo returns a CID.
4. Frontend stores the CID and ciphertext hash in the smart contract.
5. Later reads fetch ciphertext through the node1 gateway/API and decrypt locally in the frontend after access approval.

## Error Handling

- If the IPFS API is unavailable, frontend upload fails before any blockchain transaction is sent.
- If the gateway is unavailable, users cannot retrieve ciphertext even though the CID remains on-chain.
- If the IPFS volume is deleted, previously unpinned local data may be unavailable; the demo should keep `ipfs-data` unless a full reset is intentional.

## Testing

Deployment validation should include:

- Docker Compose config renders successfully for local and distributed files.
- `ipfs` starts with local Compose.
- `ipfs` appears only when the distributed `node1` profile is selected.
- Kubo API responds to `POST /api/v0/id`.
- Gateway responds on the configured gateway port.

## Documentation Updates

README should list IPFS endpoints, explain that only the node1 owner runs IPFS in distributed mode, and include minimal verification commands. The technical plan should replace the undecided IPFS deployment options with the approved node1-only Kubo topology for this repository.
