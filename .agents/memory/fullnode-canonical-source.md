---
name: Local node source policy
description: Keep node installers independent from separate node repositories and protect network genesis consistency.
---

Node source code must stay in the checked-out project bundles. Fetch installer scripts from `hc172808/guardian-chain/main/public/scripts` first, then fall back to the local copy. Do not fetch node source from separate repositories.

**Why:** The user explicitly asked that node install scripts come from the dashboard repository first with local fallback, while node source remains bundled locally and separate node repositories stay removed.

**How to apply:** Remote fetches may retrieve only the selected installer/support scripts from the dashboard repository. Every node build must use the local role-specific bundle; don't add GitHub checks, webhooks, or fetches for standalone node repositories. Third-party Go dependencies may still be resolved from their normal module sources.

The user previously approved a coordinated reset of mainnet (198282) and persistent testnet (198281) to 3B GYDS using the app's six-wallet allocation proportions. The six recipients were supplied and format-checked; keep actual addresses in genesis configuration, never memory, and do not substitute placeholder/precompile addresses. Do not treat that historical approval as authorization for a future production reset.

**Why:** Genesis and validator mismatches can split peers or change balances, and a coordinated reset is destructive.

**How to apply:** Before any future reset, get fresh confirmation, verify the approved allocations and deterministic genesis hash across all node roles, preserve backups, and never include devnet unless separately approved.