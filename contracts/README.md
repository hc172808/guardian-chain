# GydsSwap Smart Contracts

Uniswap V2 style AMM for **GydsChain** (Chain ID 198282).

## Contracts

| File | Role |
|---|---|
| `WGYDS.sol` | Wrapped GYDS — ERC-20 wrapper for native GYDS coin |
| `GLPToken.sol` | ERC-20 LP token (GLP prefix) — one per pair, with ERC-2612 permit |
| `GydsSwapLibrary.sol` | Pure math helpers — sqrt, quote, getAmountOut/In, TWAP |
| `GydsSwapPair.sol` | AMM pool — mint, burn, swap, sync, 0.3% fee, TWAP oracle |
| `GydsSwapFactory.sol` | Deploys pairs via CREATE2, maintains pair registry |
| `GydsSwapRouter.sol` | User-facing router — addLiquidity, removeLiquidity, all swap variants |
| `GydsSwapFarm.sol` | LP staking farm — stake GLP tokens, earn GYDS rewards |

## LP Token Naming

```
GYDS / USDT  →  GLP-GYDS-USDT
GYDS / BTC   →  GLP-GYDS-BTC
GYDS / ETH   →  GLP-GYDS-ETH
GYDS / USDC  →  GLP-GYDS-USDC
```

## Deployment Order

```
1. Deploy WGYDS
2. Deploy GydsSwapFactory(feeToSetter, WGYDS, USDT)
3. Deploy GydsSwapRouter(factory, WGYDS)
4. Deploy GydsSwapFarm(gydsTokenAddress, emissionRate)
5. Create and fund the WGYDS/USDT reference pair
6. Register each launch token with factory.registerLaunchToken(token)
7. Per cross-coin pair: factory.createPairForLaunch(token, quote, tokenSymbol, quoteSymbol, token)
8. Per farm pool: farm.addPool(glpTokenAddress, allocPoints)
```

Non-WGYDS pairs are gated at the pair contract, including direct pair swaps and
router swaps. The selected launch token must reach a $10,000 USD market cap,
computed from its current ERC-20 total supply (burns reduce this supply) and a
30-minute on-chain TWAP through its WGYDS pool and the WGYDS/USDT reference pool.
After reaching the threshold, the token remains unlocked. There is no token-age
requirement. WGYDS pairs remain available for price discovery.

## GYDS Mainnet deployment

The repository starts with zero contract addresses. A real swap cannot execute
until the contracts are deployed to chain ID `198282`, the token contracts are
real contracts on that chain, the pair is created, and liquidity is funded.

1. Configure `GYDS_LOCAL_RPC_URL` (preferred) or `GYDS_RPC_URL` to a reachable
   RPC for chain `198282`; without either, the script checks the local node at
   `http://127.0.0.1:8545`. The first run is read-only and does not need a
   deployer key.
2. For USDT trading, set `GYDS_USDT_TOKEN_ADDRESS` to the actual USDT ERC-20
   contract on GYDS mainnet. For GYD/USDT trading, also set
   `GYDS_GYD_TOKEN_ADDRESS` to the actual GYD ERC-20 contract. The deployment
   script checks the chain, contract code, and token symbols before creating
   pairs; it does not create fake or placeholder tokens.
3. From this directory, run `npm run setup:gydschain`. It compiles the
   contracts, checks the chain and token contracts, then exits after a read-only
   dry run unless explicitly confirmed.
4. To submit transactions, add `DEPLOYER_PRIVATE_KEY` through Replit Secrets
   (never paste it in chat or commit it) and set
   `CONFIRM_GYDS_MAINNET_DEPLOYMENT=true` in the deployment environment. Run
   `npm run setup:gydschain` again only after confirming the target chain and
   deployer address. The script deploys WGYDS, Factory, Router, and Farm,
   creates the WGYDS/USDT reference pair, adds its LP token to the farm, and
   saves public contract addresses to the repository-root `.env`.
5. The farm starts with zero rewards. Fund and configure emissions separately
   after deciding the reward budget. The script creates empty pairs; add real
   liquidity before enabling trading. It does not deploy user-created
   stablecoins: those remain subject to the app's explicit approval flow.

## Security Notes

- Reentrancy guard on all state-changing functions in Pair and Farm
- 0.3% swap fee enforced by K-invariant check — cannot be bypassed
- Minimum liquidity (1000 wei) locked on first deposit — prevents price manipulation
- SafeERC20-style low-level calls with return-value checks
- All admin functions are owner-only with events emitted
- ERC-2612 permit on LP tokens enables gasless approvals
- Flash swaps supported via `gydsSwapCall` callback

## AMM Formula

```
x * y = k   (constant product)

fee = 0.3%  (0.25% to LPs + 0.05% protocol)

amountOut = (amountIn × 997 × reserveOut) / (reserveIn × 1000 + amountIn × 997)
```

## Compile

```bash
# Using Hardhat
npx hardhat compile

# Using Foundry
forge build
```

## Test

```bash
npx hardhat test
# or
forge test -v
```
