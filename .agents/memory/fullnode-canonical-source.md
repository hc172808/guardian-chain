---
name: Fullnode canonical source
description: Node installers use one fullnode repository for all supported runtime modes.
---

All production node installers should clone and build `https://github.com/hc172808/fullnode.git`, selecting supported roles with `GYDS_NODE_MODE` rather than maintaining separate per-node repositories. This source currently requires Go 1.25.0.

Before any future Go fullnode feature or installer work, fetch the canonical repository, verify its origin, and fast-forward the intended branch before editing or building. Do not use `fullnode-repull` as a substitute; it tracks `guardian-chain`.

Keep the dedicated validator setup unchanged until the upstream PoS engine actually consumes its configured signing key. The presence of a `validator` mode alone does not make it safe for production. Unsupported roles such as `bootnode` must fail explicitly instead of building from another repository. When migrating existing installs, use a separate canonical data directory and leave legacy data untouched; warn that backup and resync may be needed.

**Why:** Keeping node implementations in separate repositories caused source drift. The user also wants all Go work based on the latest canonical source. Upstream validator mode does not yet pass the configured key to PoS signing, and reusing legacy chain state across different implementations may corrupt or misinterpret it.

**How to apply:** Before Go changes or installs, verify the remote is `hc172808/fullnode` and update safely without force-resetting local edits. Build supported modes with the Go version its `go.mod` requires. Do not migrate `scripts/setup-validator-node.sh` or reuse its state until signing support is verified upstream. Treat unsupported roles as explicit errors; preserve legacy data and explain resync requirements.