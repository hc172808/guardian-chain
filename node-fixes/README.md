# Bundled GYDS node sources

Node installers now build only from source already included in this project. They do
not clone or pull separate node repositories.

| Role | Local source |
|---|---|
| Full node | `node-fixes/fullnode` |
| RPC node | `node-fixes/rpcnode` |
| Boost node | `node-fixes/boostnode` |
| Lite node | `node-fixes/litenode` |
| Genesis node | `node-fixes/genesis` |
| Validator node | `node-fixes/validatornode` |
| Bootnode | `public/blockchain-go/cmd/bootnode` |

Run installers from a checked-out project directory, or set `PROJECT_ROOT` to that
directory. A role's `NODE_SOURCE_DIR` may be set to another local directory if it
contains the expected Go module.

Passing Go builds do not by themselves make a node safe for a public network. The
bundled genesis data and the monolithic ChainCore source still need network-level
compatibility review. See [`nodes-requirements.md`](../nodes-requirements.md) for
the audit and the checklist for any future separate node repositories.
