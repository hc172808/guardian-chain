---
name: Admin camelCase
description: Drizzle ORM returns camelCase keys; Admin.tsx NodeInstallation interface must match.
---

## Rule
All Drizzle query results use camelCase field names. Never use snake_case in frontend interfaces for DB-sourced data.

## NodeInstallation fields (correct camelCase)
- `userId` (not `user_id`)
- `nodeType` (not `node_type`)
- `wireguardPublicKey` (not `wireguard_public_key`)
- `isApproved` (not `is_approved`)
- `isSynced` (not `is_synced`)
- `createdAt` (not `created_at`)

## Why
Drizzle maps DB column names (`snake_case`) to JavaScript property names (`camelCase`) automatically. Using `node.node_type` would return `undefined`; use `node.nodeType`.

## How to apply
Check any interface that maps to a Drizzle table. If it uses snake_case, fix to camelCase.
