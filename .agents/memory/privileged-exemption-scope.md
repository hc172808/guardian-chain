---
name: Privileged-user exemptions must cover every layer, not just the handler
description: Admin/founder bypass logic inside a route handler does nothing if middleware in front of the route still blocks the request first
---

When an app grants admin/founder accounts an exemption from bans, lockouts,
or captcha, that exemption is easy to implement correctly *inside* the route
handler (`isPrivilegedUsername()` checks before applying a ban/lockout) and
still fail in practice, because Express middleware runs in registration
order. A generic per-IP rate limiter (`express-rate-limit`, etc.) applied to
the route will reject the request with a blunt 429 *before* the handler ever
runs — so the privileged bypass code is dead weight, and admin/founder still
"stall" or get blocked exactly like everyone else.

**Why this matters:** exemption logic added only where the ban/lockout state
is stored (deep in the handler) gives a false sense that privileged accounts
"can't be locked out," while a shallower layer (rate limiter, WAF rule,
reverse-proxy block) enforces the same restriction with no knowledge of the
exemption.

**How to apply:** when adding a privileged-user exemption, audit every
middleware layer in front of the route (rate limiters, IP/ban gates, CAPTCHA
gates) and make each one skip for privileged identifiers too — e.g.
`express-rate-limit`'s `skip` option accepts an async predicate
(`Promise<boolean>`), so it can call the same `isPrivilegedUsername`/
`isPrivilegedWallet` check used elsewhere instead of only gating inside the
handler.
