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

### `install-fullnode.sh` — already in repo, needs follow-up
- ⚠️ Known limitation: the script's embedded `BUILDSCRIPT` does
  `cd /tmp/gydschain-build && go build ./cmd/fullnode` but never copies the
  source there, so it silently falls back to a placeholder shell-script
  "binary" at `/usr/local/bin/gyds-fullnode` (a `while true; do sleep 1`
  stub).
- TODO: patch the script to either copy `public/blockchain-go/` into
  `/tmp/gydschain-build` first, or `git clone` the repo, then build the real
  binary.

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
- ❌ Patch `install-fullnode.sh` so its build step actually compiles the
  real source (see note above).
- ❌ Add `install-rpc-proxy.sh` for the public `rpc.netlifegy.com` /
  `rpc2` / `rpc3` reverse-proxy nodes.
- ❌ WireGuard mesh bring-up automation across founder nodes.

### Frontend / dashboard (separate from Go work)
- See `FIXES.md` for the React/Supabase dashboard checklist (token
  operations, holder counts, NetworkSettings admin tab, etc.).

---

## Verified working in Replit container

```
$ go build -o /tmp/gyds-fullnode ./cmd/fullnode    # OK, 7.8 MB ELF
$ /tmp/gyds-fullnode --founder --datadir=/tmp/gyds-data \
    --rpcport=18546 --p2pport=18303 --storage=1 \
    --validator-key=/tmp/gyds-keys/validator.key --mining=false
2026/04/21 22:26:44 P2P network listening on port 18303
2026/04/21 22:26:44 PoS consensus engine started
2026/04/21 22:26:44 RPC server listening on port 18546
```

Production deployment on Ubuntu 22.04:
```
sudo bash public/scripts/install-fullnode.sh    # founder node
sudo bash public/scripts/install-bootnode.sh    # bootstrap/discovery node
sudo systemctl start gyds-fullnode gyds-bootnode
```
