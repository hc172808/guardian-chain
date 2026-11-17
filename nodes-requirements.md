# GYDS Node Source Requirements

This document is the checklist for maintaining the node sources bundled in this
project and for any future standalone node repositories. Installer scripts are
fetched from `hc172808/guardian-chain/main/public/scripts` first, with a local
checkout fallback. Node source code remains bundled in this project; installers
must not pull separate node repositories.

## Current local source inventory

| Role | Tracked source | Local installer |
|---|---|---|
| Full node | `node-fixes/fullnode` | `public/scripts/install-fullnode.sh`, `install-fullnode-service.sh`, `install-localnode.sh` |
| RPC node | `node-fixes/rpcnode` | `public/scripts/install-rpcnode.sh` |
| Lite node | `node-fixes/litenode` | `public/scripts/install-litenode.sh`, `install-termux.sh` |
| Boost node | `node-fixes/boostnode` | `public/scripts/install-boostnode.sh` |
| Genesis node | `node-fixes/genesis` | `public/scripts/install-genesis.sh` |
| Validator node | `node-fixes/validatornode` | `public/scripts/install-validatornode.sh` |
| Bootnode | `public/blockchain-go` | `public/scripts/install-bootnode.sh` |

The Admin node installer downloads the selected script from the dashboard
repository's `public/scripts` folder first and falls back to the matching local
file when GitHub cannot be reached. It places scripts in a temporary directory
and builds node binaries from the local source bundle. Go may still download
third-party modules recorded in `go.mod`/`go.sum`; that is dependency retrieval,
not retrieval of node source repositories.

## Audit findings and limits

- All seven roles above have a local source directory and a corresponding
  installer. Passing a compile test only proves the source builds; it does not
  prove that it can safely join or operate a public chain.
- The checkout does not currently contain one canonical genesis specification:
  `public/blockchain-go/internal/genesis.DefaultGenesisConfig` declares a 1B
  supply and placeholder allocations, while the node-builder path separately
  pre-mints 100M GYDS to a founder account.
- The five standalone `node-fixes/*/core/genesis.go` files use a separate
  200,000-token allocation across placeholder accounts. Their genesis headers
  use fixed state-root values rather than deriving state from those
  allocations; the validator bundle also hardcodes its genesis hash.
- There is no separate testnet genesis fixture in the bundled node sources.
  Accepting chain ID 198281 in an RPC or installer is not enough to establish
  testnet genesis compatibility.
- The previously approved 3B, six-recipient schedule is not represented by the
  current genesis files. Do not replace these placeholders with guessed
  allocations or deploy a changed genesis. A genesis change alters block 0 and
  cannot be applied to existing chain data as a routine node update.
- The bootnode entry point builds and tests on its own, but running
  `go test ./...` for the entire `public/blockchain-go` module currently fails
  in `internal/indexer` because that package uses APIs that no longer match the
  blockchain package. This is a separate module-wide issue and must be resolved
  before claiming that the whole shared module is verified.
- The RPC node currently has a partial, in-memory implementation. Its inspected
  handlers return fixed balances and synthetic transaction data, and its genesis
  data is embedded in the source. Do not use this implementation as an
  authoritative production RPC or for real asset activity until it is replaced
  or verified against the canonical chain implementation.
- Mainnet and testnet use different chain IDs (198282 and 198281). Every role
  must use the selected ID consistently in RPC responses, P2P handshakes,
  genesis configuration, persisted state, and service configuration. The RPC
  installer and RPC responses accept/report both IDs; this does not establish
  that the bundled RPC node has correct testnet state or synchronization.
- Genesis allocations, validator identities, block hashes, state roots, and
  peer compatibility must be compared across every role before production
  deployment. Never infer compatibility from matching chain IDs alone.
- Check each role's port exposure, RPC/WebSocket authorization and origin
  policy, key handling, permissions, persistence, logs, service restart and
  upgrade behavior, and rollback safety. Review the source and installer before
  exposing any RPC endpoint publicly.
- Current installers should fail clearly when their expected local bundle is
  absent or has the wrong Go module. They must not clone or pull node source.
- Script retrieval from the dashboard repository is not permission to fetch
  node source code remotely; keep node builds bound to the local role bundle.

## Requirements for each future standalone node repository

### Source and release contents

- A clear role-specific README: purpose, supported networks, minimum hardware,
  ports, prerequisites, install/upgrade/recovery commands, and known limits.
- A unique Go module path and committed `go.mod` and `go.sum`.
- A standard command entry point and focused internal packages for config,
  chain/genesis, state storage, consensus or relay behavior, P2P, RPC, and
  observability as appropriate to that role.
- Versioned releases with a changelog, supported Go versions, and a declared
  support matrix for mainnet and testnet.
- Example configuration with safe defaults. Never include private keys,
  credentials, or production signing material in the repository.
- A service definition or an explicit documented interface for the local
  installer: binary name, command-line flags, environment variables, data
  directories, health check, ports, logs, and shutdown behavior.

### Network compatibility contract

- Exact chain IDs and network names; reject unknown values instead of silently
  falling back to mainnet.
- The approved genesis configuration and deterministic genesis/block hash
  calculation, with tests proving that allocation or validator changes alter
  the expected hash.
- A compatibility table for P2P protocol versions, message formats, bootstrap
  peers, consensus rules, fork/version handling, and state/database upgrades.
- RPC method support and error behavior that match the chain API. Chain ID,
  network version, block height, balances, transaction submission, receipts,
  and logs must reflect real node state rather than placeholders.
- A documented trust boundary: which listeners are loopback-only, VPN-only, or
  public; how authentication, CORS/origin checks, rate limits, and firewall
  rules are applied.

### Required verification

- `go test ./...`, `go vet ./...`, formatting, and reproducible build checks.
- Unit tests for configuration validation, network isolation, genesis hashes,
  state transitions, transaction/signature validation, and malformed input.
- Integration tests for peer discovery, P2P handshake/network mismatch,
  synchronization, RPC/WebSocket behavior, restart persistence, and graceful
  shutdown.
- Cross-role compatibility tests using the same approved genesis and network
  fixtures; compare chain ID, genesis hash, state root, and representative RPC
  results.
- Installer tests for every documented OS/architecture, missing or mismatched
  local source, safe upgrades, existing data preservation, and rollback.
- Shell syntax checks plus compilation/tests for any embedded Python or other
  generated configuration code.
- A security review covering key storage, privilege boundaries, exposed
  listeners, dependency vulnerabilities, and release artifact integrity.

## Adding a future remote source

Treat a future standalone node repository as an optional source of versioned
node releases, not an implicit installer dependency. The existing remote-first
installer-script download from the dashboard repository is a separate mechanism.
Before wiring a standalone node repository into the app, document
its repository URL, owner, release/tag policy, integrity verification, module
path, source-to-installer interface, supported networks, tests, rollback plan,
and how the local bundle remains usable when the remote service is unavailable.
Get explicit approval before changing installers to fetch node source remotely.
