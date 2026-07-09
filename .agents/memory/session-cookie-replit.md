---
name: Session cookie Replit fix
description: How to make Express session cookies work in Replit dev preview
---

## Rule
Session cookies in Replit require three coordinated settings:
1. `secure: true` + `sameSite: 'none'` on the cookie (gated on `process.env.REPL_ID`)
2. Vite proxy must add `headers: { "X-Forwarded-Proto": "https" }` so Express sees HTTPS
3. IP session lock must be disabled in dev (gated on `REPLIT_DEPLOYMENT`)

**Why:** Replit serves dev over HTTPS through an iframe (cross-origin). SameSite=None is required for cross-origin iframes. SameSite=None requires Secure. Express only sends Secure cookies when it detects HTTPS via X-Forwarded-Proto. The Vite proxy (changeOrigin:true) does not forward that header automatically.

**How to apply:** Any project using express-session on Replit needs these exact changes in auth setup and vite.config.ts. Check server/auth.ts getSession() and vite.config.ts proxy config.
