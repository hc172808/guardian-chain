# DeFi real-implementation checklist

This is the ongoing checklist for replacing demo, simulated, and metadata-only DeFi behavior with verified protocol behavior.

## Completed

- [x] Remove fake success fallbacks from swap, staking, farming, LP actions, portfolio actions, position actions, and launch contributions.
- [x] Make unavailable money-moving actions show an explicit error instead of recording synthetic transactions or changing local state.

## Remaining

- [ ] Deploy and configure the swap router; replace price-based quotes with router/pool quotes.
- [ ] Deploy liquidity factory/pair contracts; implement real add/remove liquidity, LP mint/burn, locks, and pool closure.
- [ ] Deploy staking contracts; track deposits, withdrawals, rewards, and exchange rate from chain state.
- [ ] Deploy farming contracts; replace fallback farms and implement real stake, unstake, and harvest.
- [ ] Deploy vault contracts and strategies; replace hardcoded APY/TVL/capacity with live values.
- [ ] Implement perpetual margin, oracle pricing, funding, liquidation, and settlement.
- [ ] Implement prediction-market escrow, oracle resolution, and payouts.
- [ ] Implement bridge source-chain proofs, relayer execution, destination settlement, and confirmation tracking.
- [ ] Add an order-matching engine with balance reservation, fills, partial fills, and cancellation.
- [ ] Add launchpad contribution escrow, allocation, and token distribution.
- [ ] Add stablecoin contract deployment, mint, burn, collateral, and redemption flows.
- [ ] Replace portfolio position inference with canonical positions indexed from protocol events.
- [ ] Remove random and hardcoded market-data fallbacks; show unavailable states when live data is missing.
- [ ] Route direct Supabase DeFi reads through consistent Express APIs with server-side authorization.
- [ ] Replace disabled/no-op analytics, filters, alerts, and harvest controls with working behavior or remove them.

## Rule

No DeFi money-moving action should display success, create a confirmed transaction, update protocol totals, or mutate a position unless the operation is verified by the relevant contract or trusted backend settlement.