---
name: Progressive login lockout
description: Per-account escalating login lockout (distinct from IP-based bans), with admin-configurable durations and redirect URL.
---

Separate from the existing IP-based ban/honeypot system (`login_failures`, `ip_bans`), there is a per-account lockout keyed on the submitted username/email (`login_lockouts` table).

- First wrong password already triggers a lockout (default 1 min); each subsequent failure escalates through an admin-configurable duration ladder (default 60s → 5m → 15m → 1h → 6h → 24h, capped at the last value).
- Settings (`enabled`, `durationsSec[]`, `redirectUrl`) live in `admin_config` under key `lockout_settings`, 60s in-process cache — same pattern as `honeypot_redirect_url`.
- Admin/founder accounts are always exempt (`isPrivilegedUsername`) — they keep the existing wallet-signature fallback (`USE_WALLET_FALLBACK`) instead of ever being locked out.
- While locked, the client receives `code: "LOGIN_LOCKED"` with `lockedUntil` (ms epoch) and `redirectUrl` (nullable). Frontend (`src/pages/Auth.tsx` LoginForm) redirects immediately if a URL is set, otherwise shows a live countdown and disables the form.
- Admin UI lives in a new "Lockout" tab in `src/components/admin/FirewallManager.tsx` (`LockoutSettingsTab.tsx`) — lets admin/founder edit the duration ladder (accepts inputs like `30s`, `5m`, `2h`), set/clear the redirect URL, and view/manually unlock active lockouts.

**Why:** user wanted escalating timeouts distinct from IP bans, since a shared IP (e.g. office/NAT) using IP-based lockout would collaterally block other legitimate accounts.

**How to apply:** when extending, reuse `checkLockout` / `recordLockoutFailure` / `clearLockout` from `server/security.ts` — don't duplicate the escalation math elsewhere.
