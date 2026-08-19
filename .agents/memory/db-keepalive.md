---
name: Database pool keep-alive
description: Database health checks must use the shared PostgreSQL pool rather than module-local pools.
---

Database reliability depends on one shared pool with TCP keepalive, a practical idle timeout, and a lightweight scheduled `SELECT 1` health check. Separate module-local pools can disconnect independently and waste connection capacity.

**Why:** A keep-alive on only one pool does not protect routes, storage, node state, notifications, or exchange-rate queries using other pools.

**How to apply:** Import the pool from `server/db.ts` for new database access, and keep the Admin cron scheduler’s database check enabled so failures are visible in the job status.