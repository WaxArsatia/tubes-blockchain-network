# 🔗 Besu QBFT 5-Node Private Network

Private EVM network dengan 5 validator node menggunakan **Hyperledger Besu** + **QBFT consensus** + **Blockscout Explorer**.

---

## 📋 Prerequisites

| Tools               | Versi Minimum |
| ------------------- | ------------- |
| Docker              | 24.x          |
| Docker Compose      | v2.x          |
| (Opsional) Hardhat  | 2.x           |
| (Opsional) MetaMask | Latest        |

---

## 🚀 Quick Start

### 1. Generate Keys & Genesis

```bash
chmod +x setup.sh
./setup.sh
```

Script ini akan:

- Membersihkan file generated lama: `config/networkFiles`, `config/nodes`, dan `config/static-nodes.json`
- Generate 5 pasang node key (private/public)
- Generate `genesis.json` dengan konfigurasi QBFT
- Generate `config/static-nodes.json` berisi enode URL semua node

`setup.sh` aman dijalankan ulang sebelum network dinaikkan. Jika network sedang berjalan dan ingin reset total, jalankan `docker compose down -v` dulu.

### 2. Jalankan Network

```bash
docker compose up -d
```

### 3. Cek Status

```bash
# Lihat semua container
docker compose ps

# Log semua node
docker compose logs -f node1 node2 node3 node4 node5

# Cek peer count node1
curl -s http://localhost:8545 \
  -X POST \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}'
# Output: {"result":"0x4"} → 4 peers (berarti 5 node terhubung semua)

# Cek validator list
curl -s http://localhost:8545 \
  -X POST \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"qbft_getValidatorsByBlockNumber","params":["latest"],"id":1}'
```

### Cek IPFS Kubo

```bash
curl -s -X POST http://127.0.0.1:5001/api/v0/id
```

Gateway lokal tersedia di:

```text
http://127.0.0.1:8080/ipfs/<cid>
```

### 4. Hentikan Network

```bash
docker compose down          # stop, data tetap ada
docker compose down -v       # stop + hapus semua data (reset total)
```

---

## 🌐 Endpoints

| Service                  | URL                   |
| ------------------------ | --------------------- |
| **Blockscout Explorer**  | http://localhost:3000 |
| **Node 1 RPC (primary)** | http://localhost:8545 |
| **Node 2 RPC**           | http://localhost:8547 |
| **Node 3 RPC**           | http://localhost:8549 |
| **Node 4 RPC**           | http://localhost:8551 |
| **Node 5 RPC**           | http://localhost:8553 |
| **Node 1 WS**            | ws://localhost:8546   |
| **IPFS Kubo API**        | http://<host-ip>:5001 |
| **IPFS Gateway**         | http://<host-ip>:8080 |

---

## 🌍 Distributed Validators via WireGuard

Mode ini untuk menjalankan validator di beberapa mesin yang sudah saling terhubung lewat WireGuard. Contoh 3 orang:

| Participant | WireGuard IP | Validator yang dijalankan |
| ----------- | ------------ | ------------------------- |
| Person A    | `10.8.0.1`   | `node1`, `node2`          |
| Person B    | `10.8.0.2`   | `node3`                   |
| Person C    | `10.8.0.3`   | `node4`, `node5`          |

> Semua participant harus memakai `genesis.json`, validator keys, dan `static-nodes-distributed.json` yang sama. Jangan menjalankan `./setup.sh` sendiri-sendiri di tiap mesin, karena itu akan membuat chain berbeda.

### 1. Generate genesis dan validator keys di satu mesin

```bash
./setup.sh
```

### 2. Buat konfigurasi WireGuard enode

```bash
cp .env.distributed.example .env.distributed
```

Edit `.env.distributed` dan isi `NODE*_HOST` dengan IP WireGuard pemilik node. Contoh:

```env
NODE1_HOST=10.8.0.1
NODE2_HOST=10.8.0.1
NODE3_HOST=10.8.0.2
NODE4_HOST=10.8.0.3
NODE5_HOST=10.8.0.3
```

Lalu generate static nodes distributed:

```bash
./setup-distributed.sh
```

File yang harus sama di semua mesin:

```text
config/networkFiles/
config/nodes/
config/static-nodes-distributed.json
.env.distributed
docker-compose.distributed.yml
```

### 3. Buka firewall WireGuard

Buka port P2P sesuai validator yang dijalankan oleh mesin tersebut. Dengan contoh default:

| Node    | Host       | P2P Port |
| ------- | ---------- | -------- |
| `node1` | `10.8.0.1` | `30303`  |
| `node2` | `10.8.0.1` | `30304`  |
| `node3` | `10.8.0.2` | `30305`  |
| `node4` | `10.8.0.3` | `30306`  |
| `node5` | `10.8.0.3` | `30307`  |

RPC dan WebSocket hanya bind ke `127.0.0.1` di masing-masing mesin, jadi tidak terbuka ke WireGuard secara default.

### 4. Jalankan validator sesuai ownership

Person A, pemilik `node1`, juga otomatis menjalankan PostgreSQL, Blockscout, dan IPFS Kubo:

```bash
docker compose --env-file .env.distributed \
  -f docker-compose.distributed.yml \
  --profile node1 --profile node2 up -d
```

Blockscout tersedia di mesin Person A. Default frontend diset untuk domain testing `blockscout.denis.my.id`:

```text
http://blockscout.denis.my.id
```

IPFS Kubo juga tersedia di mesin Person A saja:

```text
Kubo API:     http://<ip-host-node1>:5001
Kubo Gateway: http://<ip-host-node1>:8080
```

Jika dibuka dari perangkat lain lewat IP LAN atau WireGuard dengan IP berbeda, set host publik frontend sebelum menjalankan Compose:

```bash
BLOCKSCOUT_FRONTEND_PUBLIC_PROTOCOL=http \
BLOCKSCOUT_FRONTEND_PUBLIC_HOST=<ip-host-node1> \
BLOCKSCOUT_FRONTEND_PUBLIC_PORT=3000 \
BLOCKSCOUT_FRONTEND_PUBLIC_WS_PROTOCOL=ws \
docker compose --env-file .env.distributed \
  -f docker-compose.distributed.yml \
  --profile node1 --profile node2 up -d
```

Untuk mode distributed, isi `BLOCKSCOUT_FRONTEND_PUBLIC_HOST` di `.env.distributed` pada mesin yang menjalankan `node1` jika domain bukan `blockscout.denis.my.id`.

Jika browser console masih menunjukkan request ke host lama atau path ganda seperti `/api/api/v2/...`, recreate container frontend dan proxy setelah mengubah env:

```bash
docker compose --env-file .env.distributed \
  -f docker-compose.distributed.yml \
  --profile node1 up -d --force-recreate blockscout-frontend blockscout-proxy
```

Person B:

```bash
docker compose --env-file .env.distributed \
  -f docker-compose.distributed.yml \
  --profile node3 up -d
```

Person C:

```bash
docker compose --env-file .env.distributed \
  -f docker-compose.distributed.yml \
  --profile node4 --profile node5 up -d
```

### 5. Cek koneksi peer

Di mesin yang menjalankan `node1`:

```bash
curl -s http://127.0.0.1:8545 \
  -X POST \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}'
```

Target untuk 5 validator aktif adalah `0x4` peer.

Jika peer belum tersambung:

- Pastikan semua participant bisa ping IP WireGuard satu sama lain.
- Pastikan port P2P setiap validator terbuka lewat WireGuard.
- Pastikan semua participant memakai `config/static-nodes-distributed.json` yang sama.
- Pastikan `NODE*_HOST` berisi IP WireGuard host, bukan IP Docker bridge.

### Menambah participant atau validator

Dengan genesis saat ini, jumlah validator adalah 5. Participant boleh lebih dari 3 selama lima validator ini dibagi ke mesin yang berbeda. Untuk menambah jumlah validator sungguhan, ubah `count` di `config/qbftConfigFile.json`, regenerate dengan `./setup.sh`, generate ulang `./setup-distributed.sh`, lalu mulai chain baru dari data kosong.

---

## 🦊 Koneksi MetaMask

1. Buka MetaMask → **Add Network manually**
2. Isi form:
   - **Network Name**: Besu Local
   - **RPC URL**: `http://localhost:8545`
   - **Chain ID**: `1337`
   - **Currency Symbol**: `ETH`
3. Import test account:
   - **Private Key**: `8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63`
   - Address: `0xfe3b557e8fb62b89f4916b721be55ceb828dbd73`
   - Balance: 200 ETH (pre-funded di genesis)

---

## 🛠️ Deploy Contract dengan Hardhat

### Inisialisasi project Hardhat

```bash
mkdir my-contracts && cd my-contracts
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init
```

### Konfigurasi `hardhat.config.js`

```javascript
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.24",
  networks: {
    besuLocal: {
      url: "http://localhost:8545",
      chainId: 1337,
      accounts: [
        "8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63",
      ],
    },
  },
};
```

### Deploy Contract

```bash
npx hardhat run scripts/deploy.js --network besuLocal
```

---

## 🏗️ Struktur Direktori

```
besu-network/
├── docker-compose.yml          # Definisi semua services
├── setup.sh                    # Script setup awal / regenerate file network
├── README.md                   # Dokumentasi ini
└── config/
    ├── qbftConfigFile.json     # Template genesis & QBFT config
    ├── static-nodes.json       # (generated) Daftar enode semua node
    ├── networkFiles/
    │   ├── genesis.json        # (generated) Genesis block
    │   └── keys/               # (generated) Raw keys per address
    └── nodes/
        ├── node1/key           # (generated) Private key node 1
        ├── node2/key           # (generated) Private key node 2
        ├── node3/key           # (generated) Private key node 3
        ├── node4/key           # (generated) Private key node 4
        └── node5/key           # (generated) Private key node 5
```

---

## ⚙️ Konfigurasi Network

| Parameter           | Nilai                      |
| ------------------- | -------------------------- |
| **Chain ID**        | 1337                       |
| **Consensus**       | QBFT                       |
| **Hardfork**        | Prague                     |
| **Block Period**    | 2 detik                    |
| **Gas Limit**       | 30,000,000 gas per block   |
| **Min Gas Price**   | 0 wei                      |
| **Fault Tolerance** | 1 node boleh down (dari 5) |

---

**Reset total (hapus semua data)**

```bash
docker compose down -v
rm -rf config/networkFiles config/nodes config/static-nodes.json
./setup.sh
docker compose up -d
```
