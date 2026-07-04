---
name: DDoS & Firewall Protection
description: Full implementation details for the multi-layer server-side DDoS protection and firewall rules.
---

## Architecture

Three files:
- `server/security.ts` — core firewall engine
- `server/index.ts` — global middleware stack and CORS
- `server/auth.ts` + `server/routes.ts` — per-route rate limiters

## Key Rules

**Trust proxy must come first** — `app.set("trust proxy", 1)` is placed BEFORE all middleware in index.ts. Removing or moving it breaks rate limiter IP extraction (req.ip) and allows IP spoofing.

**Loopback bypass** — `ALWAYS_ALLOW` (127.0.0.1, ::1) bypasses all firewall layers. This means dev curl tests from localhost appear not to trigger protections. Test with `X-Forwarded-For: 5.5.5.5` header to simulate external IP.

**Progressive temp-ban** — strikes escalate per IP: 1st=5min, 2nd=30min, 3rd=4hr, 4th+=permanent. A single IP hitting multiple honeypot paths in rapid succession will escalate to temp-banned; subsequent requests return 429 TEMP_BANNED not 403 HONEYPOT. This is correct behavior.

**Burst window = 5s, threshold = 25** — >25 req/5s from same IP = DDoS flag → temp-ban (sensitivity>=4).

**Sustained rate = per sensitivityLevel** — sensitivity 6 = ~53 req/min limit.

## CORS Allowlist

Known origins get credentials: netlifegy.com, www.netlifegy.com, rpc.netlifegy.com, app.netlifegy.com, localhost:5001/3000, Replit dev domain (from REPLIT_DEV_DOMAIN env).
Unknown origins: no ACAO header emitted (strict deny, browser blocks response).
RPC paths (/rpc, /api/rpc, /): open with Access-Control-Allow-Origin: * but NO credentials.

## Rate Limiters

| Limiter | Window | Max | Applied to |
|---|---|---|---|
| globalLimiter | 60s | 600 | all routes (index.ts) |
| authLimiter | 15m | 20 | login, register, verify-email, nonce, web3, change-password, reset-password/*, totp/setup, resend-verification |
| totpLimiter | 15m | 10 | totp/verify, totp/backup-codes/use, DELETE totp |
| resetConfirmLimiter | 30m | 5 | reset-password/confirm |
| faucetLimiter | 1hr | 5 | /api/faucet/claim |
| rpcLimiter | 60s | 60 | /api/rpc (skips loopback) |
| apiLimiter | 60s | 100 | /api/developer/keys |
| uploadLimiter | 10m | 10 | /api/admin/wallet-releases/upload |

## Security Headers Added

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (HSTS, new)
- `Server: GYDS` (hides Express)
- `X-Powered-By` removed
- Existing: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, Permissions-Policy, CSP

## Honeypot Paths

~40 known scanner bait paths (.env, .git, wp-admin, phpmyadmin, shell.php, actuator, etc.). Also fuzzy: any .php/.asp/.cgi extension, /wp-* prefix, /.git[/] or /.svn[/] paths, double-encoded traversal (%252e).

## Attack Patterns (16 total)

SQL injection, NoSQL injection, LDAP injection, Shell injection, Path traversal, Null byte, XSS, SSTI, PHP object injection, XXE, XML bomb, SSRF, HTTP response splitting, Log4Shell, Mass assignment probe, RPC replay flood.

Both req.body (JSON.stringified) and query string (URL-decoded) are scanned.
