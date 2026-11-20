---
name: Token creation network
description: Network policy for newly created tokens
---

# Token creation network

New token creation is limited to verified GRC-20 deployments on GYDS mainnet (chain ID 198282). The creator's wallet must approve deployment and sign an account-linking message. The server verifies the exact contract creation input, receipt, contract state, initial supply, creator balance, and wallet proof before saving a row with `deploymentStatus=confirmed`. Legacy records remain historical and must not be upgraded to confirmed without proof.

**Why:** The prior factory generated random contract addresses and transaction hashes, then saved those as if a token were deployed. Local RPC nodes are synthetic and cannot establish a real mainnet deployment.

New token creation is mainnet-only. Cross-coin pairs unlock at $10,000 market cap using on-chain `totalSupply()` × a 30-minute TWAP; supply is never entered as circulating supply. There is no 30-day age gate, and unlocks persist.

**Why:** The user requires mainnet-only creation, automatic wallet-visible supply from mainnet data, and a market-cap trading unlock rather than a time-based promotion.

**How to apply:** Use only explicitly configured `GYDS_RPC_URL` / `GYDS_RPC_BACKUP_URLS` for server verification; never fall back to local test nodes for token confirmation. Read supply from the deployed contract, never trust cached/manual supply for the gate or wallet display, and fail closed if mainnet data is unavailable. Cross-coin pairs require the configured market-cap threshold using the 30-minute on-chain TWAP; no age gate.
