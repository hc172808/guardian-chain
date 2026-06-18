# GYDS Node Fixes

Corrected source files for all GYDS node repositories.
Each subdirectory contains only the files that need to change — copy them into the corresponding repo.

## What's Fixed

### rpcnode — `node-fixes/rpcnode/`
**Problem:** `go.mod` declared module `github.com/gydschain/litenode` (wrong). All imports, binary name, and `NewServer` call signature pointed at litenode instead of rpcnode.

**Files to copy into `github.com/hc172808/rpcnode`:**
- `go.mod` — module is now `github.com/gydschain/rpcnode`
- `main.go` — all imports fixed to `rpcnode/...`, binary `gyds-rpcnode`, `NewServer(chain, port, wsPort, host, cors)`

**After copying:**
```bash
cd rpcnode && go mod tidy && go build -o bin/gyds-rpcnode .
```

---

### boostnode — `node-fixes/boostnode/`
**Problem:** Same wrong module as rpcnode. Block time was 5s (should be 1s). NodeMode was "lite".

**Files to copy into `github.com/hc172808/boostnode`:**
- `go.mod` — module is now `github.com/gydschain/boostnode`
- `main.go` — all imports fixed to `boostnode/...`, block time from cfg (default 1s)
- `config/config.go` — NodeMode `"boost"`, BlockTime `1s`, port `8547/30304`

**After copying:**
```bash
cd boostnode && go mod tidy && go build -o bin/gyds-boostnode .
```

**Also fix in boostnode repo:**
- `rpc/server.go`: change `"github.com/gydschain/litenode/core"` → `"github.com/gydschain/boostnode/core"`
- `rpc/server.go`: change `"github.com/gydschain/litenode/p2p"` → `"github.com/gydschain/boostnode/p2p"`
- `consensus/pos.go`: same import fix
- Remove `bin/gyds-litenode` and add `bin/` to `.gitignore`

---

### fullnode — `node-fixes/fullnode/`
**Problem:** `versionCmd` printed `"gyds-litenode v%s"`. `BlockTime` defaulted to 120s (2 min).

**Files to copy into `github.com/hc172808/fullnode`:**
- `main.go` — version string fixed to `gyds-fullnode`, block time uses `cfg.BlockTime`
- `config.go` → place at `config/config.go` — BlockTime default changed from 120s to 5s

**After copying:**
```bash
cd fullnode && go mod tidy && go build -o bin/gyds-fullnode .
```

---

### genesis — `node-fixes/genesis/`
**Problem:** `github.com/hc172808/genesis` repo was empty.

**Files for the new `github.com/hc172808/genesis` repo:**
- `go.mod` — module `github.com/gydschain/genesis`, includes LevelDB
- `main.go` — `gyds-genesis` binary: `start`, `init`, `export-genesis`, `version` commands
- `config/config.go` — genesis config (port 8544, P2P 30300, archive mode, never prune)
- `Dockerfile` — multi-stage Go build
- `docker-compose.yml` — complete stack
- `setup.sh` — copies core/, consensus/, p2p/, rpc/ from fullnode and rewrites imports
- `README.md` — full setup instructions
- `.gitignore`

**Setup:**
```bash
# Clone both repos side by side
git clone https://github.com/hc172808/fullnode.git
git clone https://github.com/hc172808/genesis.git

# Copy these node-fixes/genesis/ files into the genesis repo
cp -r node-fixes/genesis/. ../genesis/

# Run setup (copies shared packages and fixes imports)
cd ../genesis && bash setup.sh
```

---

## Litenode Architecture

A lightweight header-only sync node (no full block storage, no block production).

| File | Purpose |
|---|---|
| `go.mod` | `module github.com/gydschain/litenode` |
| `config/config.go` | Chain ID, RPC/P2P ports, bootstrap peers |
| `header-sync/sync.go` | Header-only sync, ECDSA block header verification, SPV proof generation |
| `main.go` | HTTP API (latest header, SPV, header range), no block production |

**Key differences from fullnode:**
- `storeHeader()` only stores headers (not full blocks/transactions)
- `verifyBlockHeader()` uses ECDSA `r/s/v` recovery + `pubKeyToAddress()` to verify block signer
- `GenerateSPVProof()` creates Merkle proofs for inclusion verification
- `ProduceAndBroadcastBlock()` removed — litenode is a passive verifier

```bash
cd node-fixes/litenode && bash setup.sh
```

---

## Dashboard Script Fixes (already applied)

| Script | Was | Now |
|---|---|---|
| `public/scripts/install-fullnode.sh` | `REPO_URL=...validatornode.git` | `REPO_URL=...fullnode.git` |
| `public/scripts/install-genesis.sh` | `REPO_URL=...fullnode.git` | `REPO_URL=...genesis.git` |
| `public/scripts/install-genesis.sh` | `BINARY="gyds-fullnode"` | `BINARY="gyds-genesis"` |
