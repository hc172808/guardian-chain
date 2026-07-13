---
name: Server .env loading and lazy RPC config
description: Why .env-based admin config (Server Config) silently reverted on every restart, and how RPC endpoint lists must be read lazily, not baked into module-level consts.
---

**Problem:** Admin "Server Config" writes values to `.env` + calls `process.env[k]=v` for the live process, but nothing ever loaded `.env` back into `process.env` on the next process start (no dotenv package, no loader). Every saved value (RPC URLs, treasury key, SMTP creds, etc.) vanished on the next restart, making the whole feature look broken/flaky.

**Fix:** Added a manual `.env` parser at the very top of `server/index.ts`, called via an IIFE, that fills in any `process.env` key not already set.

**Why this matters more subtly:** ES module `import` statements are hoisted and fully executed (including their whole transitive import graph) before the importing file's own top-level code runs. So placing the `.env` loader after the `import` lines in `index.ts` was NOT early enough for modules imported transitively (e.g. `chainRpc.ts`, pulled in via `routes.ts`) that read `process.env.X` into a top-level `const` — those baked in the pre-load (usually undefined/default) value permanently for the process lifetime, silently ignoring any real env value or admin override.

**How to apply:** Never read `process.env` into a module-level `const` for values that admin config / .env / secrets can change at runtime. Wrap the read in a function (e.g. `getRpcEndpoints()`) called at use-time instead. This applies anywhere a config value can be changed by an admin panel, secret rotation, or .env edit without a full redeploy.
