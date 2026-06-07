---
name: New Pages
description: 9 new ecosystem pages added in June 2026 build-out.
---

All new pages in `src/pages/`:
- Governance.tsx → /governance (proposals, voting, DAO treasury)
- NFT.tsx → /nft (marketplace, collections, mint)
- Analytics.tsx → /analytics (OHLCV candles, heatmap, network stats)
- Community.tsx → /community (forum posts, votes, comments, referral system)
- Developer.tsx → /developer (API keys, endpoint docs, playground, SDKs)
- Leaderboard.tsx → /leaderboard (XP, traders, validators, miners; weekly/monthly/all)
- Multisig.tsx → /multisig (create, propose, approve/reject, execute threshold txs)
- Identity.tsx → /identity (DID, KYC tiers, verified claims, reputation scores)
- RWA.tsx → /rwa (real estate, bonds, commodities, invoice assets)

All routes added to App.tsx. Sidebar has three collapsible sections (Core, Ecosystem, Resources).

**Why:** Sidebar was getting too long with flat list; added collapsible NavSection component.
