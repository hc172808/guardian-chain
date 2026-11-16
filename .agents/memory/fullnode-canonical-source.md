---
name: Local node source policy
description: Keep node installers independent from separate node repositories and protect network genesis consistency.
---

Node code and install scripts should be sourced from the checked-out project bundles. Do not make installers clone or pull separate node repositories unless the user explicitly changes this policy. Keep any future-repository requirements in `nodes-requirements.md`.

**Why:** The user explicitly chose locally maintained node scripts and source, and asked to remove the app's remote node-repository integrations.

**How to apply:** Keep each install path bound to a local role-specific source, and don't add GitHub checks, webhooks, or fetches for separate node repositories. Third-party Go dependencies may still be resolved from their normal module sources.

The user previously approved a coordinated reset of mainnet (198282) and persistent testnet (198281) to 3B GYDS using the app's six-wallet allocation proportions. The six recipients were supplied and format-checked; keep actual addresses in genesis configuration, never memory, and do not substitute placeholder/precompile addresses. Do not treat that historical approval as authorization for a future production reset.

**Why:** Genesis and validator mismatches can split peers or change balances, and a coordinated reset is destructive.

**How to apply:** Before any future reset, get fresh confirmation, verify the approved allocations and deterministic genesis hash across all node roles, preserve backups, and never include devnet unless separately approved.