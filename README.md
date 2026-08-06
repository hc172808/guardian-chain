# ChainCore — GYDS Blockchain Network Dashboard

A full-stack blockchain ecosystem dashboard for the GYDS Network (Chain ID 198282).

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React 18 + TypeScript (port 5000 in dev) |
| Backend | Express.js + Passport.js sessions (port 5001) |
| Database | Replit PostgreSQL via Drizzle ORM |
| Styling | Tailwind CSS + shadcn/ui (dark theme) |
| State | TanStack React Query + React Context |
| Auth | Username/password + Web3 wallet signature (EIP-6963) |

## Quick Start

```bash
npm install
npm run dev          # Vite (5000) + Express (5001) concurrently
npm run build        # production build
npm run db:push      # apply Drizzle schema (needs TTY — see DB notes)
```

Default founder login:
```
Username: netlifegy
Password: GYDSchain2026!
```
Change this after first login.

## Environment Variables

### Required (set by Replit automatically)
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Express session secret (auto-generated if missing) |

### Optional — set via **Admin → Server Config** or in `.env`

#### Wallets
| Variable | Description |
|---|---|
| `ADMIN_WALLET` | Admin wallet address (0x...) |
| `FOUNDER_WALLET` | Founder wallet address (0x...) |
| `REWARD_ADDRESS` | Mining/reward wallet (also exported as `GYDS_MINING_WALLET`) |

#### Repository Access
| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | GitHub Personal Access Token (private repo pulls, node scripts) |

#### hCaptcha (Faucet Protection)
| Variable | Description |
|---|---|
| `VITE_HCAPTCHA_SITE_KEY` | Public site key (sent to browser) |
| `HCAPTCHA_SECRET_KEY` | Server-side verification key |

#### Telegram Alerts
| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Chat or group ID for alerts |

#### Email / SMTP
| Variable | Description |
|---|---|
| `SMTP_HOST` | SMTP hostname (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | SMTP port (default `587`) |
| `SMTP_USER` | SMTP username / email address |
| `SMTP_PASS` | SMTP password or app password |
| `SMTP_FROM` | From address (e.g. `no-reply@netlifegy.com`) |

#### WhatsApp (Meta Business API)
| Variable | Description |
|---|---|
| `WHATSAPP_TOKEN` | Meta Cloud API permanent token |
| `WHATSAPP_PHONE_ID` | Phone number ID from Meta Business |

#### Network
| Variable | Description |
|---|---|
| `GYDS_BOOTSTRAP_NODES` | Comma-separated enode:// bootstrap node URIs |

> All optional vars can be set without restarting the app manually — use **Admin → Server Config** and click **Save & Apply**. The panel writes to both `.env` and `gyds-config.env` and triggers a PM2 restart automatically in production.

## Shared Config File

`gyds-config.env` is written alongside `.env` whenever you save via Admin → Server Config or run `deploy-dashboard.sh`. All node install scripts source it automatically:

```bash
GYDS_CONF="${GYDS_CONF:-/var/www/gydschain/gyds-config.env}"
[[ -f "$GYDS_CONF" ]] && source "$GYDS_CONF"
```

## Database Notes

- **Source of truth:** `shared/schema.ts` (Drizzle ORM)
- **`npm run db:push` has a TTY issue** in this environment — may say "nothing to migrate" incorrectly
- **Correct migration flow:**
  ```bash
  npm run db:generate           # generates SQL in drizzle/migrations/
  psql "$DATABASE_URL" < drizzle/migrations/latest.sql
  ```
- Full schema snapshot (safe to re-run): `psql "$DATABASE_URL" < migrations/0002_full_schema_sync.sql`
- Drizzle returns **camelCase** column names in TypeScript

## Import Rules

```typescript
// CORRECT — lowercase folder, named export:
import { Layout } from '@/components/layout/Layout';

// WRONG — causes Vite 500:
import Layout from '@/components/Layout';
```

## Key Directories

```
src/pages/          — route pages (Admin, Auth, Explorer, Wallet, DeFi, etc.)
src/components/     — feature-scoped components
src/components/admin/ — admin panel components (40+ tabs)
server/             — Express server (index.ts, auth.ts, routes.ts, storage.ts)
shared/schema.ts    — Drizzle ORM schema (source of truth)
public/scripts/     — node install + deploy bash scripts
public/docker/      — Docker files + Compose configs
```

## Deployment

```bash
# Fresh Ubuntu server (Cloudflare + subdomain):
SUBDOMAIN=app DOMAIN=netlifegy.com bash public/scripts/setup-server.sh

# Redeploy existing install:
bash public/scripts/deploy-dashboard.sh

# Safe git pull + PM2 reload:
gyds-redeploy
```

`deploy-dashboard.sh` interactively asks for all optional config values (wallets, tokens, SMTP, etc.) — press Enter to skip any. Writes both `.env` and `gyds-config.env`.

## Network Config

| Parameter | Value |
|---|---|
| Chain ID | 198282 |
| Block Time | 120 seconds |
| Domain | netlifegy.com |
| RPC | rpc.netlifegy.com |
| Explorer | app.netlifegy.com/explorer |

## User Roles

Three roles stored in `user_roles` table: `user`, `admin`, `founder`

## Adding a New Page

1. Create `src/pages/YourPage.tsx` — wrap with `<Layout>`
2. Add route in `src/App.tsx`
3. Add nav item in `src/components/layout/Sidebar.tsx`
4. Add to `PAGES` array in `src/pages/Preview.tsx`
5. Add backend routes in `server/routes.ts` if needed
