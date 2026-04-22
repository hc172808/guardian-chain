# GYDSchain — Build & Setup Changelog

This file tracks every fix, addition, and configuration change made to get the
GYDSchain Go blockchain (`public/blockchain-go/`) building and running, and to
make the install scripts production-ready.

Use this as a checklist: ✅ = done, ⏳ = in progress, ❌ = not yet started.

---

## ✅ COMPLETED — Build fixes

### Block storage layer (`internal/blockchain/storage.go`) — NEW FILE
- Implemented `SaveBlock`, `LoadBlockByHeight`, `LoadBlockByHash`, `LoadHeadBlock`.
- Atomic batch writes: block body (by hash), height→hash pointer, hash→height
  reverse lookup, head pointer.
- `GetTransactionByHash` index (`tx:<hash>` → `{block_hash, index}`).
- `SaveChainConfig` for chain ID / name / block time persistence.
- JSON serialization for blocks (header + transactions + validator votes +
  mining shares) with hex helpers for fixed-size byte arrays and big.Int
  string round-trips.
- Wired the previously-stubbed `loadCurrentBlock` / `loadBlockByHeight` /
  `saveBlock` in `blockchain.go` to the new implementations.

### Go module (`go.mod` / `go.sum`)
- Ran `go mod download github.com/syndtr/goleveldb` then `go mod tidy` to
  populate the missing `go.sum` entries.

### Import cycle: `mining ↔ liteclient`
- `internal/liteclient/api.go` imports `mining`; `mining/liteminer.go`
  imported `liteclient` → cycle.
- **Fix:** added a `LiteClientAPI` interface inside `mining` with just
  `GetMiningWork` and `SubmitMiningShare`. Changed
  `LiteMiner.client` field from `*liteclient.Client` to `LiteClientAPI` and
  removed the `chaincore/internal/liteclient` import.

### `StateDB` missing methods (`internal/blockchain/state.go`)
- `blockchain.go` called `SetBalance / AddBalance / SubBalance / AddStake /
  SubStake`, but state.go only had per-coin variants.
- **Fix:** added thin dispatcher wrappers that switch on `CoinType` and
  forward to `SetBalanceGYDS`/`SetBalanceGYD`/etc.

### Duplicate `uint64ToBytes`
- Declared in both `blockchain.go` and `state.go`.
- **Fix:** removed the copy in `state.go` (kept the canonical one in
  `blockchain.go`).

### `stateDB.Commit()` return mismatch
- `blockchain.go` did `stateRoot := bc.stateDB.Commit()` and assigned to
  `[32]byte`, but `Commit()` returns `error`.
- **Fix:** call `Commit()` for its side effect and assign
  `header.StateRoot = [32]byte{}` as a placeholder until the state-trie root
  is wired in.

### `account.Stake` → `account.StakedGYDS`
- Wrong field name in `Blockchain.GetStake`.
- **Fix:** renamed.

### `internal/network/p2p.go` syntax error
- Stray `import "fmt"` after declarations on line 383
  (*"imports must appear before other declarations"*).
- **Fix:** moved `"fmt"` into the top import block, removed the trailing
  stray import.

### RPC package fixes (`internal/rpc/`)
- Duplicate `Server.handleWebSocket` (stub in `server.go`, real impl in
  `websocket.go`) — **removed the stub**.
- `Server` struct missing `wsHub *WebSocketHub` field — **added**.
- `block.Header.ParentHash` → `block.Header.PrevHash` (in `eth_handlers.go`).
- `block.Header.ProposerAddress` → `block.Header.ProposerAddr`.
- `formatTransaction(tx, …)` was passed a value but expects `*Transaction`
  — **fix:** `txCopy := tx; …(&txCopy, …)`.
- `tx.HashHex()` undefined on `Transaction` — **added** the method in
  `blockchain.go`.

### `mining/pool.go` wrong field
- `currentBlock.Header.BlockHash` doesn't exist.
- **Fix:** changed to `currentBlock.Header.PrevHash`.

### `cmd/fullnode/main.go` — typed big.Int literals
- Four fields (`ValidatorMinStake`, `RewardPerBlock`, `SessionRewardCap`,
  `DailyAddressCap`) had bare `123…` int literals where `*big.Int` is
  required.
- **Fix:** added `bigIntFromString` helper, imported `math/big`, used it for
  all four assignments.

### Runtime: nil-pointer panic on first start
- Genesis block init crashed because `chainConfig.GenesisGYDS` was never set
  → `SetBalance` deref'd a nil `*big.Int`.
- **Fix:** set `GenesisGYDS = 100M GYDS` (`100000000000000000000000000` wei)
  and `GenesisGYD = big.NewInt(0)` (per the spec — GYD must be admin-minted).

---

## ✅ COMPLETED — Install scripts

### `install-fullnode.sh` — REWRITTEN ✅
- Old script silently fell back to a `while true; sleep 1` placeholder.
- Now: requires `SRC_DIR` (auto-detected from script location), copies the
  source to a temp dir, builds the real `gyds-fullnode` binary as the
  `gydschain` user, installs to `/usr/local/bin`, configures ufw + fail2ban,
  installs systemd unit with `NoNewPrivileges`, `ProtectSystem=strict`,
  `PrivateTmp`, `ReadWritePaths`.
- Configurable env vars: `RPC_PORT`, `P2P_PORT`, `STORAGE_SIZE`,
  `BLOCK_TIME` (default 120), `ENABLE_MINING`, `CHAIN_ID`.

### `install-litenode.sh` — REWRITTEN ✅
- Was the same placeholder pattern. Now builds real `gyds-litenode` from
  source, installs into `~/.gydschain/bin/`, generates wallet, writes
  `node.toml`, installs a `--user` systemd unit, supports macOS via
  `brew install go`.

### `install-termux.sh` — REWRITTEN ✅
- Old version skipped install of Go entirely and assumed a binary existed.
- Now: `pkg install golang`, auto-clones source if `SRC_DIR` not provided
  (`REPO_URL` defaults to the GitHub repo), builds `gyds-litenode` directly
  on Android, installs Termux:Boot autostart hook and start/stop wrappers.

### `install-node.sh` — REWRITTEN ✅
- Universal installer: `validator|fullnode|rpc|litenode|bootnode`.
- Builds the appropriate binary (`gydsd`/`litenode`/`bootnode`) from
  `SRC_DIR`, installs systemd unit with security hardening, sets up
  logrotate.

### `install-bootnode.sh` — NEW
- Creates `gydschain` user, data/keys/logs dirs at `/var/lib/gydschain`.
- Builds `gyds-bootnode` from `cmd/bootnode/`.
- Generates node key (`openssl rand -hex 32`) at first run if absent.
- Configures `ufw` (P2P TCP/UDP ports only — no RPC exposed).
- Configures `fail2ban` with a `gyds-bootnode` jail.
- Installs a `systemd` unit (`gyds-bootnode.service`) that auto-restarts.
- Writes a `bootnode.toml` with chain ID, P2P port, max peers, and the
  bootstrap peer list.
- Prints the node's public ENR-style address for sharing with other operators.

### `cmd/bootnode/main.go` — NEW
- Minimal node: P2P discovery only — no mining, no consensus, no RPC, no
  full state storage.
- Flags: `--datadir`, `--p2pport` (default 30303), `--maxpeers` (default 100),
  `--node-key`, `--bootstrap` (comma-separated peer list), `--chain-id`
  (default 13370).
- Starts only the `network.P2PNetwork` and answers `MsgPeerDiscovery`
  requests.
- Graceful shutdown on SIGINT/SIGTERM.

---

## ⏳ IN PROGRESS / TODO

### Blockchain core
- ❌ Wire a real Merkle/Patricia state-trie root into `header.StateRoot`
  (currently zero hash).
- ❌ Real ECDSA signature verification in `verifySignature` /
  `verifyFeePayerSignature` (currently length-only checks).
- ❌ Implement `LevelDB` pruning (function is a no-op).
- ❌ Replace JSON block encoding in `internal/blockchain/storage.go` with
  RLP/protobuf for production efficiency.

### Install scripts
- ✅ `install-fullnode.sh`, `install-litenode.sh`, `install-termux.sh`,
  `install-node.sh` all rewritten to build real binaries.
- ✅ `install-bootnode.sh` (new) — peer discovery node.
- ✅ `install-all-nodes.sh` (new) — install any combination
  (`--bootnode --fullnode --litenode --rpc --all`) on one server with
  automatic port-shift for the RPC node.
- ❌ Add `install-rpc-proxy.sh` for the public `rpc.netlifegy.com` /
  `rpc2` / `rpc3` reverse-proxy nodes.
- ❌ WireGuard mesh bring-up automation across founder nodes.

### Block time & mining
- ✅ Updated `cmd/fullnode/main.go`: `BlockTime: 120`, `TargetShareTime: 120`.
- ✅ Updated `internal/genesis/genesis.go`: `TargetBlockTime: 120`.
- All running binaries verified at the new 120-second cadence.

### Admin UI
- ✅ New `src/components/admin/NodeInstaller.tsx` — pick which nodes
  (bootnode / fullnode / RPC / litenode / Termux) to install on one server,
  configure block time and mining, then copy a one-liner or full script
  ready to paste over SSH.
- ✅ New "Install" tab wired into `src/pages/Admin.tsx`.

### Frontend / dashboard (separate from Go work)
- See `FIXES.md` for the React/Supabase dashboard checklist (token
  operations, holder counts, NetworkSettings admin tab, etc.).

---

## Verified working in Replit container

All three binaries build and run end-to-end:

```
$ go build -o /tmp/gyds-fullnode ./cmd/fullnode    # 7.8 MB ELF
$ go build -o /tmp/gyds-litenode ./cmd/litenode    # 8.3 MB ELF
$ go build -o /tmp/gyds-bootnode ./cmd/bootnode    # 3.2 MB ELF

$ /tmp/gyds-fullnode --founder --datadir=/tmp/gd --rpcport=18548 ...
P2P network listening on port 18305
RPC server listening on port 18548
Full Node Started Successfully!

$ /tmp/gyds-litenode --datadir=/tmp/ln --rpc=...
ChainCore Lite Node v2.1.0 — Public Edition

$ /tmp/gyds-bootnode --datadir=/tmp/bn --p2pport=18404
Node ID: 8fee145e34c23fad
P2P network listening on port 18404
```

Production deployment on Ubuntu 22.04:

```
# Single-server, multiple nodes:
sudo SRC_DIR=$PWD/public/blockchain-go bash \
    public/scripts/install-all-nodes.sh --bootnode --fullnode --litenode

# Or one node at a time:
sudo bash public/scripts/install-fullnode.sh
sudo bash public/scripts/install-bootnode.sh
bash      public/scripts/install-litenode.sh   # user-mode, no sudo
bash      public/scripts/install-termux.sh     # inside Termux on Android

# Or via the dashboard: Admin → Install → pick nodes → copy command
```
