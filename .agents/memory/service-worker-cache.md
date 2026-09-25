---
name: Service worker cache
description: Client cache invalidation for frontend bundle changes
---

# Service worker cache

When a user can still see removed frontend copy after a successful rebuild, invalidate the installed PWA cache by bumping `CACHE_NAME` in `public/sw.js`.

**Why:** Static assets use stale-while-revalidate, so an already-installed service worker can continue serving an older hashed bundle until its cache is replaced.

**How to apply:** Bump the cache name for user-visible bundle changes, rebuild, restart the workflow, and verify the served `sw.js` and bundle no longer contain the old text.