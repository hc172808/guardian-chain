---
name: Auth and transaction raw SQL fixes
description: Drizzle fails on deployed DB schema drift for nonce, password change, and transactions — replaced with raw pgPool SQL.
---

## Rule
Any storage function touching auth (nonce/password) or user transactions must use raw pgPool.query() SQL, not Drizzle ORM.

## Affected functions (all now use raw pgPool):
- setUserNonce — in-memory Map (primary) + raw UPDATE; INSERT placeholder for new wallets
- getUserNonce — in-memory Map check first, then raw SELECT fallback
- clearUserNonce — Map delete + raw UPDATE
- updateUserPassword — raw UPDATE users SET password_hash
- insertTransaction — raw INSERT; uses ?? (not ||) for field normalisation; validates required fields
- getUserTransactions / getAllTransactions — raw SELECT with camelCase column aliases

## Why:
- Deployed PostgreSQL has schema drift vs TypeScript schema; Drizzle SELECT * fails on missing columns
- Frontend sends snake_case in req.body; Drizzle INSERT expects camelCase — NOT NULL violations
- Drizzle UPDATE can silently return 0 rows affected without throwing, masking failures

## Nonce store pattern:
In-memory Map keyed by lowercase wallet_address, TTL 10 min. DB write is best-effort.
Single-process PM2 deployment — Map is authoritative. Multi-instance would need Redis.

## Field normalisation (insertTransaction):
Use (data.camel !== undefined ? data.camel : data.snake) ?? fallback
NOT data.camel || data.snake — the || operator treats '' as falsy and causes silent NULL inserts.
