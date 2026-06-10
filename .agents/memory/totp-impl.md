---
name: TOTP implementation
description: otplib v12 dropped the authenticator export; use the built-in server/totp.ts module instead.
---

## Rule
Never import `authenticator` from `otplib` — it was removed in v12.

## Current approach
`server/totp.ts` is a zero-dependency TOTP implementation using Node.js built-in `crypto`:
- `totp.generateSecret()` — returns a base32-encoded 20-byte secret
- `totp.generate(secret)` — returns current 6-digit TOTP token
- `totp.verify({ token, secret })` — checks ±1 time step (30s window)
- `totp.keyuri(label, issuer, secret)` — returns `otpauth://totp/...` URI for QR

## Why
otplib v12 completely redesigned its API and the `authenticator` export was dropped. Installing and using the new API required complex plugin wiring (crypto + base32 plugins). The built-in crypto approach is simpler, has zero deps, and is RFC 6238 compliant.

## How to apply
Import `{ totp }` from `"./totp"` in server/auth.ts only. Do NOT add otplib imports.
