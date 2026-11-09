---
name: Testnet coin symbols
description: Network-specific display tickers for GYDS and GYD.
---

Testnet uses TGYDS for the native coin and TGYD for the stablecoin. Mainnet keeps GYDS and GYD. Treat testnet tickers as network-specific display symbols while preserving canonical operation identifiers.

**Why:** the user requested distinct symbols for test coins.

**How to apply:** use network-aware display labels, keep mainnet symbols unchanged, and normalize TGYDS/TGYD before sending canonical token identifiers to APIs.
