---
name: Contract tooling firewall
description: Replit package firewall behavior affecting optional SSH and Hardhat contract tooling.
---

The Replit package firewall blocked installation attempts for optional `ssh2` and for contract tooling because the project dependency tree resolves `handlebars@4.7.9`. Keep the SSH client lazy-loaded so missing SSH tooling cannot prevent the application server from starting. Do not bypass the firewall; update the direct parent dependency to a safe supported release before retrying a package install.

**Why:** A transitive tooling dependency blocked otherwise unrelated installs, while a static SSH import caused the API server to fail before serving routes.

**How to apply:** If contract compilation or SSH operations need packages, follow the package-management skill to identify and update the direct parent dependency; preserve runtime startup when optional tooling is absent.
