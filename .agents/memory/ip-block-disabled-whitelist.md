---
name: IP-block disabled + auto-whitelist on login
description: Firewall/ban enforcement is intentionally OFF by default; logins auto-whitelist the IP but monitoring stays on.
---

The user reported getting IP-blocked repeatedly (admin/founder included) and asked to disable IP blocking while keeping monitoring, and to auto-whitelist any user's IP on successful login.

**Decision:** Added a master switch `ipBlockEnabled` in `server/security.ts` (persisted in `admin_config.ip_block_enforcement`), defaulting to **false**. All block/ban *enforcement* points (permanent block-list, temp-bans, honeypot/UA/burst/rate/payload auto-block, DB `ip_bans` gate, login pre-check) now check this flag — when off they log a `[monitor-only]` warning and call `next()`/allow instead of rejecting. Detection, counters, and audit logging are untouched, so monitoring keeps working.

Also added `ip_whitelist` table + `addIpToWhitelist()`, called from every successful login path in `server/auth.ts` (password login and wallet/web3 login, any role). Whitelisted IPs bypass firewall/ban checks like loopback does, but `last_seen_at`/`login_count` keep updating (throttled to once every 5 min) so they remain visible/monitored, not silently exempt forever.

**Why:** Cloudflare-edge IP collapsing (see cloudflare-trust.md) and aggressive auto-ban thresholds were false-positive-blocking legitimate users including the site owner; the fix needed to preserve future opt-back-in without ripping out the detection logic.

**How to apply:** To re-enable real enforcement later, call `setIpBlockEnforcement(true)` from `server/security.ts` (writes to `admin_config`) once thresholds/allowlists have been tuned — don't just flip `ipBlockEnabled` in code without also considering Cloudflare-edge collapsing and whether admin/founder wallets are in `ip_whitelist` first.
