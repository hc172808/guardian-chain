---
name: Deployment runtime contract
description: Production publishing must start the Express server that serves both the built SPA and API routes.
---

The production build is a Vite frontend build, not a server bundle. The deployment run command must start `server/index.ts` through the project start script so API routes are available alongside `dist`.

**Why:** Pointing deployment at an assumed `dist/index.cjs` leaves the published app offline and causes browser API requests to receive the hosting provider's HTML error page.

**How to apply:** Keep the build command as `npm run build` and the autoscale run command as `npm run start`; verify `/api/auth/captcha` returns JSON after publishing.