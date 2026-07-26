---
name: UI improvements July 2026
description: Summary of major UI/UX and backend additions made in July 2026 session.
---

## Changes made

**DeFi nav restructured:**
- Primary tabs (8): Swap, Pools, Stake, Farm, Vaults, Bridge, Stable, Portfolio
- Advanced tabs behind "More" drawer: Orderbook, Perps, Predict, Launchpad
- IL Calculator moved inside Pools tab (button in header → ImpermanentLossCalc component inline)
- `ilcalc` removed from DeFiBottomNav and DeFi.tsx TAB_MAP

**Leaderboard replaced:**
- /leaderboard now redirects to /referrals (Referrals.tsx already existed and is fully functional)
- Leaderboard sidebar entry removed; Referrals sidebar entry remains

**Theme toggle:**
- ThemeToggle component at `src/components/layout/ThemeToggle.tsx`
- useAppTheme hook: reads/writes localStorage key `app-theme`, applies `theme-light` or `theme-dark` class to `document.documentElement`
- Light theme CSS variables added to src/index.css under `.theme-light`
- ThemeToggle rendered in Layout.tsx desktop header (top-right, before currency selector)
- useAppTheme() called in AppContent in App.tsx for mount-time init

**Transaction history:**
- tx_hash in Transactions.tsx now shows as a clickable link to `https://explorer.netlifegy.com/tx/{hash}`

**API keys:**
- api_keys table created at runtime (CREATE TABLE IF NOT EXISTS in routes.ts)
- GET /api/keys, POST /api/keys, DELETE /api/keys/:id
- GET /api/admin/keys (admin only)
- Key format: `gyds_<64 hex chars>`, stored as SHA-256 hash, prefix shown in UI
- ApiKeyManager.tsx component at src/components/admin/ApiKeyManager.tsx (standalone, not yet wired to Developer page — Developer.tsx already has its own keys tab)

**Discord alerts (server/discord.ts):**
- discordNodeDown / discordNodeUp / discordGovernancAlert / discordLargeBridgeTransfer / discordNewGovernanceProposal / discordAlert
- Set DISCORD_WEBHOOK_URL env var to enable; silently no-ops if missing
- Wired to: node stop (routes.ts ~2091), new governance proposal (routes.ts ~1833), bridge transfer >= 10,000 tokens (routes.ts ~3399)
- All admin Telegram chats also notified on node stop, new proposal, large bridge

**Why:**
- User asked "if you were creating it for yourself what would you add or remove" then asked to implement all suggestions.
