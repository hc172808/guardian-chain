---
name: Mining wallet binding
description: Mining must always use a real wallet created or imported through the Wallet page.
---

The browser miner and manual Mine Next Block flow must resolve a valid `0x` wallet address from the user's Wallet-page wallets and send rewards to that address, never to a user ID placeholder.

The standalone miner must require the same 40-hex-character wallet format during installation/configuration and refuse to start with the example placeholder or an arbitrary user ID.

**Why:** Rewarding a user ID or starting without a wallet makes mining appear successful while credits cannot be attributed to a usable wallet.

**How to apply:** When changing mining controls, pool membership, reward distribution, or miner installation, preserve the explicit wallet selection/validation and test both continuous start/stop and manual block mining.