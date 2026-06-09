# ChainCore — Project TODO

---

## Project: GydsSwap DEX for GydsChain

### Network
| Property | Value |
|---|---|
| Blockchain | GydsChain |
| Native Coin | GYDS |
| Chain ID | 13370 |

### DEX Identity
| Property | Value |
|---|---|
| DEX Name | GydsSwap |
| LP Token Standard Name | Gyds Liquidity Provider |
| LP Symbol Prefix | GLP |
| AMM Architecture | Uniswap V2 style (x * y = k) |
| Smart Contract Standard | Solidity, ERC-20 compatible |

### LP Token Naming Convention
| Pair | LP Token Symbol |
|---|---|
| GYDS / USDT | GLP-GYDS-USDT |
| GYDS / BTC | GLP-GYDS-BTC |
| GYDS / ETH | GLP-GYDS-ETH |
| GYDS / USDC | GLP-GYDS-USDC |

---

### Smart Contracts

- [ ] **GydsSwapFactory.sol** — deploy new pool pairs, track all pools
- [ ] **GydsSwapPair.sol** — AMM pool (x*y=k), mint/burn LP tokens, swap logic, fee collection
- [ ] **GydsSwapRouter.sol** — user-facing entry point: addLiquidity, removeLiquidity, swap
- [ ] **GLPToken.sol** — ERC-20 LP token (one per pair), symbol = GLP-{TOKEN0}-{TOKEN1}
- [ ] **GydsSwapFarm.sol** — stake LP tokens to earn GYDS farming rewards
- [ ] **GydsSwapLibrary.sol** — pure helpers: getAmountOut, getAmountIn, quote, sort tokens

### Core DEX Requirements

- [ ] Create liquidity pools for trading pairs
- [ ] Support adding liquidity with two assets
- [ ] Mint LP tokens (ERC-20) when liquidity is added
- [ ] Burn LP tokens when liquidity is removed
- [ ] Distribute 0.3% trading fees proportionally to liquidity providers
- [ ] Track pool reserves and LP ownership on-chain
- [ ] Support staking LP tokens for farming rewards

### Frontend — GydsSwap UI

- [ ] **Swap tab** — token-in / token-out, price impact, slippage setting, confirm swap
- [ ] **Add Liquidity tab** — select pair, input amounts, preview LP tokens to receive, confirm
- [ ] **Remove Liquidity tab** — input LP amount, preview tokens to receive, confirm
- [ ] **Pool Statistics page** — TVL, 24h volume, fee APR, reserve ratio per pool
- [ ] **LP Token Balances page** — list user's GLP tokens with USD value
- [ ] **Earned Fees page** — accumulated fees per pool, claimable amount
- [ ] **LP Farming Dashboard** — staked LP positions, pending GYDS rewards, stake/unstake/claim

### Wallet Integration

- [ ] Connect GydsChain wallet (Chain ID 13370)
- [ ] Display GYDS native balance
- [ ] Display all GLP token balances
- [ ] Sign and submit swap / liquidity transactions
- [ ] Transaction status feedback (pending → confirmed)

### Explorer Integration

- [ ] Show all liquidity pools with TVL
- [ ] Show total value locked (TVL) across GydsSwap
- [ ] Show LP token holders per pool
- [ ] Show swap history / recent trades

### Security

- [ ] Input validation on all user-facing amounts
- [ ] Slippage protection (min amount out / deadline)
- [ ] Reentrancy protection (ReentrancyGuard on all state-changing functions)
- [ ] Transaction verification (check return values, use SafeERC20)
- [ ] Audit-ready code structure (NatSpec comments, event emissions, access control)

### UI Branding

| Property | Value |
|---|---|
| Network Name | GydsChain |
| Coin Symbol | GYDS |
| DEX Name | GydsSwap |
| LP Standard | GLP |
| Primary Color | Teal / #00e5cc (match ChainCore theme) |

---

## Completed

- [x] Migrate ChainCore from Supabase to Replit Auth + Replit PostgreSQL
- [x] Express API server on port 5001 with Drizzle ORM
- [x] All 160 frontend modules loading without errors
- [x] Fix temporal dead zone crash in `src/lib/miningPools.ts`
- [x] App renders correctly — login screen visible, Replit OIDC auth wired
