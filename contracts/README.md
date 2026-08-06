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
2. Deploy GydsSwapFactory(feeToSetter)
3. Deploy GydsSwapRouter(factory, WGYDS)
4. Deploy GydsSwapFarm(gydsTokenAddress, emissionRate)
5. Per pair: factory.createPair(tokenA, tokenB, "GYDS", "USDT")
6. Per farm pool: farm.addPool(glpTokenAddress, allocPoints)
```

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
