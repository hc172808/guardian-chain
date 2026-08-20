---
name: Fullnode canonical source
description: Node installers use one fullnode repository for all supported runtime modes.
---

All production node installers should clone and build `https://github.com/hc172808/fullnode.git`, selecting the node role with `GYDS_NODE_MODE` rather than maintaining separate per-node repositories.

**Why:** Keeping node implementations in separate repositories caused source drift and made it unclear which binary shared the canonical chain behavior.

**How to apply:** Preserve the fullnode repository as the source of truth for `full`, `lite`, `rpc`, `boost`, `genesis`, and `validator`. Do not silently fall back to another repository for an unsupported mode; fail explicitly until that mode exists in fullnode.