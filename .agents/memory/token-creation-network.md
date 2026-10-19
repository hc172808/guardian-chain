---
name: Token creation network
description: Network policy for newly created tokens
---

# Token creation network

New token creation is limited to verified GRC-20 deployments on GYDS mainnet (chain ID 198282). The creator's wallet must approve deployment and sign an account-linking message. The server verifies the exact contract creation input, receipt, contract state, initial supply, creator balance, and wallet proof before saving a row with `deploymentStatus=confirmed`. Legacy records remain historical and must not be upgraded to confirmed without proof.

**Why:** The prior factory generated random contract addresses and transaction hashes, then saved those as if a token were deployed. Local RPC nodes are synthetic and cannot establish a real mainnet deployment.

**How to apply:** Use only explicitly configured `GYDS_RPC_URL` / `GYDS_RPC_BACKUP_URLS` for server verification; never fall back to local test nodes for token confirmation. Do not record or award a successful token launch until all on-chain checks and the creator signature pass.