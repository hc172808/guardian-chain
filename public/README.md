# GYDSchain Complete Ecosystem

> A custom blockchain built in Go with PoS consensus, dual native coins, and a full deployment ecosystem.

**Domain:** [netlifegy.com](https://netlifegy.com) · **Chain ID:** 13370 · **Block Time:** 5s · **Node Binary:** `gydsd`

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Repository Structure](#2-repository-structure)
3. [Docker Deployment](#3-docker-deployment)
4. [Automated Scripts](#4-automated-scripts)
5. [Wallet & Light Client](#5-wallet--light-client)
6. [Explorer & Indexer](#6-explorer--indexer)
7. [Staking Dashboard](#7-staking-dashboard)
8. [Testnet, Faucet & Developer Tools](#8-testnet-faucet--developer-tools)
9. [Security](#9-security)
10. [Deployment Guide](#10-deployment-guide)

---

## 1. Architecture

### Core Specifications

| Parameter          | Value                              |
| ------------------ | ---------------------------------- |
| Node Software      | `gydsd` (Go / Golang)             |
| Consensus          | Proof-of-Stake (PoS)              |
| Block Time         | 5 seconds                         |
| Hashing            | SHA-256                            |
| Signatures         | secp256k1                          |
| Address Format     | `0x` + 40 hex characters           |
| Database           | LevelDB (embedded)                |
| P2P Networking     | WireGuard VPN overlay              |
| Chain ID           | 13370                              |

### Dual Native Coins

| Coin | Symbol | Decimals | Purpose                                    |
| ---- | ------ | -------- | ------------------------------------------ |
| GYDSchain | GYDS | 18 | Gas, staking, network fees, token liquidity |
| GYDchain  | GYD  | 6  | User-facing stablecoin (pegged to USD)      |

**Key Rule:** Regular users never touch GYDS for gas — fees are sponsored by authorized banks/sponsors.

### Transaction Structure

```
{
  sender:    "0x...",      // secp256k1 address
  recipient: "0x...",
  amount:    uint256,
  fee:       uint256,
  nonce:     uint64,
  timestamp: int64,
  signature: bytes         // secp256k1 ECDSA
}
```

### Node Types

- **Validator** — Participates in PoS consensus, produces blocks
- **Full Node** — Stores complete blockchain, serves RPC
- **RPC Node** — Read-only API endpoint for wallets and explorers
- **Lite Node** — SPV client, connects to full nodes via WireGuard

---

## 2. Repository Structure

```
gydschain-complete/
├── core/                    # Blockchain node (gydsd)
│   ├── cmd/                 # Entry points
│   │   ├── gydsd/           # Main node binary
│   │   └── gydsctl/         # CLI tool
│   ├── internal/
│   │   ├── blockchain/      # Chain state, block processing
│   │   ├── consensus/       # PoS validator logic
│   │   ├── mining/          # PoW reward distribution
│   │   ├── network/         # P2P + WireGuard
│   │   ├── rpc/             # JSON-RPC server
│   │   ├── storage/         # LevelDB persistence
│   │   ├── token/           # Dual-coin + token factory
│   │   └── wallet/          # Key management
│   └── go.mod
├── validators/              # Validator configs and scripts
├── fullnodes/               # Full node configs and scripts
├── rpc/                     # RPC node scripts
├── light-client/            # Light client module for wallets
├── ecosystem/               # User-facing applications
│   ├── wallet-web/          # Web wallet (React/Vite)
│   ├── wallet-mobile/       # Mobile wallet (React Native)
│   ├── explorer/            # Block explorer
│   ├── indexer/             # PostgreSQL indexer service
│   └── staking-dashboard/   # Validator dashboard
├── devtools/                # Developer tooling
│   ├── testnet/             # Testnet configuration
│   ├── faucet/              # Token faucet service
│   ├── sdk-js/              # JavaScript/TypeScript SDK
│   ├── sdk-python/          # Python SDK
│   ├── sdk-go/              # Go SDK
│   └── cli/                 # gydsctl CLI tool
├── docker/                  # Dockerfiles + docker-compose
│   ├── Dockerfile.node
│   ├── Dockerfile.explorer
│   ├── docker-compose.yml
│   └── nginx.conf
├── scripts/                 # Deployment scripts
│   ├── install-node.sh
│   ├── init-validator.sh
│   ├── deploy-ecosystem.sh
│   ├── deploy-devtools.sh
│   ├── deploy-remote-fullnode.sh
│   ├── ssl-setup.sh
│   └── wireguard-config.template
├── docs/                    # Documentation
│   ├── TOKEN_ARCHITECTURE.md
│   ├── DNS_SERVER_SETUP.md
│   └── CLI_REFERENCE.md
└── README.md
```

---

## 3. Docker Deployment

### Services in `docker-compose.yml`

| Service              | Container          | Port  |
| -------------------- | ------------------ | ----- |
| Validator Node       | `gydsd-validator`  | 30303 |
| Full Node            | `gydsd-fullnode`   | 30303 |
| RPC Node             | `gydsd-rpc`        | 8545  |
| WebSocket            | `gydsd-ws`         | 8546  |
| Explorer             | `gyds-explorer`    | 3000  |
| Indexer              | `gyds-indexer`     | 5432  |
| Staking Dashboard    | `gyds-staking`     | 3001  |
| Wallet Backend       | `gyds-wallet`      | 3002  |
| Testnet Node         | `gydsd-testnet`    | 18545 |
| Faucet               | `gyds-faucet`      | 8080  |

### Quick Start

```bash
# Clone the repository
git clone https://github.com/gydschain/gydschain-complete.git
cd gydschain-complete

# Deploy everything
docker-compose up -d

# Deploy specific services
docker-compose up -d gydsd-validator gyds-explorer
```

---

## 4. Automated Scripts

### Node Installation

```bash
# Deploy a validator node
bash scripts/install-node.sh validator

# Deploy a full node
bash scripts/install-node.sh fullnode

# Deploy an RPC-only node
bash scripts/install-node.sh rpc
```

### Validator Initialization

```bash
# Generate validator keys and register in genesis
bash scripts/init-validator.sh
```

### Ecosystem Deployment

```bash
# Deploy wallet, explorer, staking dashboard
bash scripts/deploy-ecosystem.sh

# Deploy testnet, faucet, SDKs, CLI
bash scripts/deploy-devtools.sh
```

### Remote Deployment

```bash
# Deploy to a remote server (interactive)
bash scripts/deploy-remote-fullnode.sh
```

### Requirements

- **OS:** Ubuntu 22.04 LTS
- **RAM:** 4GB minimum (8GB recommended for validators)
- **Storage:** 100GB SSD (full node), 10GB (lite node)
- **Network:** Static IP, ports 30303, 8545, 8546, 51820 (WireGuard)

---

## 5. Wallet & Light Client

### Web Wallet

- **Stack:** React + Vite + TypeScript
- **Features:** Create/import wallets, backup seed phrases, send/receive, transaction history
- **Security:** AES-256-GCM encrypted seeds, PBKDF2 key derivation, PIN protection
- **Integration:** EIP-3085 auto-detection (MetaMask, Trust Wallet)

### Mobile Wallet

- **Stack:** React Native
- **Features:** Same as web wallet, biometric authentication
- **Security:** Private keys never leave the device, encrypted local storage

### Light Client

- Connects to RPC nodes for balance and transaction verification
- SPV (Simplified Payment Verification) mode
- Configurable cache storage (1–100 GB)
- WireGuard VPN connection for P2P participation

---

## 6. Explorer & Indexer

### Block Explorer

- **URL:** [explorer.netlifegy.com](https://explorer.netlifegy.com)
- Search blocks, transactions, addresses, balances
- Real-time updates via WebSocket block notifications
- Token tracking and contract inspection

### Indexer

- PostgreSQL database mirroring blockchain state
- **Golden Rule:** The blockchain is the sole source of truth; the indexer only mirrors state
- Indexer failure does not impact block production or consensus
- Automatic schema migrations via `init-indexer.sql`

---

## 7. Staking Dashboard

- View all validators: uptime, voting power, total stake
- Delegate and undelegate GYDS tokens
- Track rewards and slashing events
- Connected to RPC nodes and indexer for real-time data
- Minimum stake requirements and lock periods displayed

---

## 8. Testnet, Faucet & Developer Tools

### Testnet

- Separate chain ID for isolated testing
- Pre-funded test accounts
- Fast block times for development
- Docker deployment: `docker-compose up -d gydsd-testnet`

### Faucet

- Web interface and REST API
- Rate-limited: max 100 GYDS per request, 1 request per hour per IP
- Endpoints:
  - `GET /faucet` — Web UI
  - `POST /api/faucet` — `{ "address": "0x..." }`

### Developer SDKs

| Language       | Package             | Features                          |
| -------------- | ------------------- | --------------------------------- |
| JavaScript/TS  | `@gydschain/sdk`    | Wallet, transactions, RPC client  |
| Python         | `gydschain-sdk`     | Wallet, transactions, RPC client  |
| Go             | `gydschain/sdk-go`  | Native integration, signing       |

### CLI Tool — `gydsctl`

```bash
# Wallet management
gydsctl wallet create
gydsctl wallet import --seed "word1 word2 ..."
gydsctl wallet list
gydsctl wallet balance <address>
gydsctl wallet export --address <addr> --format keystore

# Transactions
gydsctl tx send --from <addr> --to <addr> --amount 100 --coin GYD
gydsctl tx status <tx_hash>
gydsctl tx list --address <addr>

# Staking
gydsctl stake delegate --validator <addr> --amount 1000
gydsctl stake undelegate --validator <addr> --amount 500
gydsctl stake rewards --address <addr>

# Node operations
gydsctl node status
gydsctl node peers
gydsctl node sync-status
```

---

## 9. Security

### Network Security

- All public RPC endpoints use HTTPS (Let's Encrypt)
- P2P communication encrypted via WireGuard VPN
- UFW firewall configuration with allowlisted ports
- Rate limiting on all public endpoints

### Key Security

- Validator private keys encrypted at rest
- Wallet seeds encrypted with AES-256-GCM
- PBKDF2 key derivation (600,000 iterations)
- Keys never transmitted over network
- PIN-based access with brute-force protection

### Faucet Security

- IP-based rate limiting
- CAPTCHA verification on web interface
- Maximum disbursement limits per request
- Cooldown period between requests

### Infrastructure

- Nginx reverse proxy with TLS termination
- Automated SSL certificate renewal
- DNS A records for all subdomains
- Separate testnet and mainnet environments

---

## 10. Deployment Guide

### Single-Server Deployment

```bash
# 1. Clone repository
git clone https://github.com/gydschain/gydschain-complete.git
cd gydschain-complete

# 2. Deploy node
bash scripts/install-node.sh validator

# 3. Initialize validator
bash scripts/init-validator.sh

# 4. Deploy ecosystem
bash scripts/deploy-ecosystem.sh

# 5. Setup SSL
bash scripts/ssl-setup.sh
```

### Multi-Server Architecture

| Server | Role                          | Script                        |
| ------ | ----------------------------- | ----------------------------- |
| Server 1 | Validator + Full Node      | `install-node.sh validator`   |
| Server 2 | RPC Node + Explorer        | `install-node.sh rpc && deploy-ecosystem.sh` |
| Server 3 | Testnet + Faucet + DevTools| `deploy-devtools.sh`          |

### RPC Endpoints

| Endpoint                        | Type      | Access  |
| ------------------------------- | --------- | ------- |
| `https://rpc.netlifegy.com`     | Primary   | Public  |
| `https://rpc2.netlifegy.com`    | Backup    | Public  |
| `https://rpc3.netlifegy.com`    | Backup    | Public  |
| `wss://ws.netlifegy.com`        | WebSocket | Public  |
| `http://localhost:8546`         | Local     | Private |
| `http://192.168.18.106:8546`    | LAN       | Private |

### DNS Configuration

```
A  rpc.netlifegy.com      → <server-ip>
A  rpc2.netlifegy.com     → <server-ip>
A  rpc3.netlifegy.com     → <server-ip>
A  ws.netlifegy.com       → <server-ip>
A  explorer.netlifegy.com → <server-ip>
A  vpn.netlifegy.com      → <server-ip>
```

---

## License

Proprietary — All rights reserved.

## Contact

- **Website:** [netlifegy.com](https://netlifegy.com)
- **Email:** netlifegy@gmail.com
