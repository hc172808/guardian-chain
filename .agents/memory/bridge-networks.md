---
name: Bridge Networks
description: Cross-chain bridge supports 25 networks; non-EVM chains handled differently.
---

The EXTERNAL_CHAINS array in `src/components/defi/CrossChainBridge.tsx` now has 25 networks split by `evm: boolean`:

**EVM chains** (use wallet_switchEthereumChain + eth_getBalance):
ETH, BNB, Polygon, Avalanche, Fantom, Cronos, Arbitrum, Optimism, Base, zkSync Era, Linea

**Non-EVM chains** (verifySourceWallet returns ok:true immediately — trusted):
Solana (Phantom), NEAR, Cosmos, Polkadot, Cardano, TRON, TON, XRP, Stellar, Algorand, Hedera, Aptos, Sui, ICP

**Why:** Non-EVM chains don't support `wallet_switchEthereumChain`. A cross-chain relayer/oracle would be needed for production validation. The UI flow is the same for the user.

**useCoinGeckoPrices** has all 25 chain IDs mapped to CoinGecko IDs (with deduplication for L2s that share ETH price).
