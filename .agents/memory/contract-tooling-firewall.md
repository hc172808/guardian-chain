---
name: Contract tooling firewall
description: Replit package firewall behavior affecting optional SSH and Hardhat contract tooling.
---

The Replit package firewall previously blocked optional `ssh2` and older contract tooling because the dependency tree resolved `handlebars@4.7.9`. Updating the direct Hardhat Toolbox dependency to a supported Hardhat 2 release and installing through the managed package flow succeeded. Keep the SSH client lazy-loaded; do not bypass the firewall.

**Why:** A transitive tooling dependency blocked otherwise unrelated installs, while a static SSH import caused the API server to fail before serving routes. A supported direct-parent update resolved the contract-tooling install without bypassing package policy.

**How to apply:** If contract compilation or SSH operations need packages, follow the package-management skill to identify and update the direct parent dependency; preserve runtime startup when optional tooling is absent.
