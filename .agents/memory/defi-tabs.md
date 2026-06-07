---
name: DeFi Tabs
description: DeFi page tabs and DeFiBottomNav updated with OrderBook and YieldVaults.
---

DeFi page now has 8 tabs:
- swap, pools, stake (existing)
- orderbook → OrderBook.tsx (limit/market/stop-limit orders, live book visualization)
- vaults → YieldVaults.tsx (5 vaults: GYDS auto-stake, LP compound, GYD stable, boosted, validator)
- bridge (existing CrossChainBridge)
- launchpad, portfolio (existing)

DeFiBottomNav updated to show all 8 tabs with smaller icons (h-4 w-4) to fit.

**Why:** OrderBook and YieldVaults are Phase 2 TODO items; added as DeFi tabs rather than top-level pages since they're trading tools.
