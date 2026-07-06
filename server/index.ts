import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";
import { seedFounder, seedFirewallDefaults } from "./seed";
import { storage } from "./storage";
import { initVapid, ensurePushSubscriptionsTable } from "./webpush";
import { Pool } from "pg";
import { aiFirewallMiddleware, refreshSecuritySettings, ipBanGate, initIpBanTables, getClientIp } from "./security";
import { initActivityFeed, handleUpgrade } from "./activityFeed";
import { ensurePreferredCurrencyColumn } from "./exchangeRates";
import { testNodeManager, loadPersistedTestNodeState } from "./testNodes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// ── Trust proxy — MUST be first, before all middleware ───────────────────────
// Sets the trusted hop count to 1 (Replit's edge proxy / load balancer).
// This makes req.ip reliable (the real client IP from the first untrusted XFF entry)
// and prevents IP spoofing attacks against rate limiters and the firewall.
app.set("trust proxy", 1);

// ── Request timeout (30 s) — protection against slow-loris & hung connections ─
app.use((req: any, res: any, next: any) => {
  // Set a 30-second hard timeout on each request socket
  req.socket?.setTimeout(30_000);
  res.setTimeout(30_000, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: "Request timeout.", code: "TIMEOUT" });
    }
  });
  next();
});

// ── Body parsing — tighter limits ─────────────────────────────────────────────
// Auth routes need very little body; restrict them to 16 KB to prevent large payload DoS
app.use('/api/auth', express.json({ limit: '16kb' }));
app.use('/api/auth', express.urlencoded({ extended: false, limit: '16kb' }));
// Everything else gets 2 MB (was 10 MB — reduced to limit upload-based DoS)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── Global rate limiter — last line of defence against extreme floods ──────────
// Very generous (600 req/min) — only catches bulk abuse. Per-route limiters are tighter.
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Never rate-limit loopback (Replit preview, health checks, localhost nodes)
    const ip = req.ip ?? req.socket?.remoteAddress ?? '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  },
  message: { error: 'Too many requests. Please slow down.', code: 'GLOBAL_RATE_LIMITED' },
  handler: (_req: any, res: any) => {
    res.status(429).json({ error: 'Too many requests. Please slow down.', code: 'GLOBAL_RATE_LIMITED' });
  },
});
app.use(globalLimiter);

// ── CORS — credential-safe origin allowlist ────────────────────────────────────
// RPC endpoints must stay open (*) for wallets; all others restrict credentials
// to known origins to prevent cross-site credential theft.
function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>([
    'https://netlifegy.com',
    'https://www.netlifegy.com',
    'https://rpc.netlifegy.com',
    'https://app.netlifegy.com',
    'http://localhost:5001',
    'http://localhost:3000',
    'http://127.0.0.1:5001',
  ]);
  // Replit dev-domain (format: <slug>.repl.co or <slug>.replit.dev)
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) {
    origins.add(`https://${devDomain}`);
    origins.add(`https://${devDomain.replace(/^[^.]+\./, '')}`); // parent domain
  }
  return origins;
}
const ALLOWED_ORIGINS = buildAllowedOrigins();
const RPC_PATHS = new Set(['/rpc', '/api/rpc', '/']);

app.use((req: any, res: any, next: any) => {
  const origin: string | undefined = req.headers.origin;
  const isRpc = RPC_PATHS.has(req.path);

  if (isRpc) {
    // RPC must be open for any wallet app
    res.setHeader('Access-Control-Allow-Origin', '*');
    // No credentials on open-CORS responses
  } else if (!origin) {
    // Same-origin request (no Origin header) — always allowed
  } else if (ALLOWED_ORIGINS.has(origin)) {
    // Known trusted origin — allow credentials
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  } else {
    // Unknown origin — strict deny: emit no ACAO header at all.
    // The browser will block the request. This prevents untrusted sites from
    // reading any response data even without credentials.
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') { res.sendStatus(403); return; }
    // For non-preflight requests from unknown origins, continue (the missing
    // ACAO header will cause the browser to block the response) but don't block
    // server-side so API keys / mobile clients still work without a browser Origin.
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ── Security headers ──────────────────────────────────────────────────────────
app.use((_req: any, res: any, next: any) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // HSTS — tell browsers to always use HTTPS (1 year, include subdomains)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // Prevent leaking server info
  res.removeHeader('X-Powered-By');
  res.setHeader('Server', 'GYDS');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // unsafe-eval needed by Vite HMR in dev
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' wss: ws: https:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
});

// ── AI Firewall + DDoS protection middleware — runs before all routes ─────────
app.use(aiFirewallMiddleware);
await refreshSecuritySettings();
// Refresh security settings every 5 min
setInterval(() => refreshSecuritySettings().catch(() => {}), 5 * 60_000);

await setupAuth(app);

// ── IP Session Lock ────────────────────────────────────────────────────────
// After login the session stores the client IP. Any subsequent request from
// a different IP destroys the session and forces re-authentication.
// Public paths (auth endpoints, RPC, static) are excluded.
const IP_LOCK_SKIP = ['/api/auth/', '/rpc', '/api/rpc', '/api/exchange-rates', '/api/price'];
app.use((req: any, res: any, next: any) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) return next();
  // Skip non-API and public API paths
  const skip = IP_LOCK_SKIP.some(p => req.path.startsWith(p));
  if (skip) return next();

  const sessionIp: string | undefined = (req.session as any).ip;
  const currentIp: string = req.ip ?? req.socket?.remoteAddress ?? 'unknown';

  if (!sessionIp) {
    // Legacy session without IP recorded — save it now, allow through
    (req.session as any).ip = currentIp;
    return next();
  }

  if (currentIp !== sessionIp) {
    const username = (req.user as any)?.username ?? (req.user as any)?.id ?? 'unknown';
    console.warn(`[ip-lock] IP mismatch for "${username}" — session: ${sessionIp}, request: ${currentIp}`);
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Session expired: IP address changed. Please log in again.' });
  }

  next();
});

registerRoutes(app);
await seedFounder();
await seedFirewallDefaults().catch(e => console.warn("seedFirewallDefaults:", e.message));
await storage.seedAchievements().catch(e => console.warn("seedAchievements:", e.message));
await storage.initReferralTables().catch(e => console.warn("initReferralTables:", e.message));
await storage.initGovernanceTreasury().catch(e => console.warn("initGovernanceTreasury:", e.message));
await storage.initApiKeysTables().catch(e => console.warn("initApiKeysTables:", e.message));
await storage.initApiUsageLogs().catch(e => console.warn("initApiUsageLogs:", e.message));
await storage.initBridgeTransferTable().catch(e => console.warn("initBridgeTransferTable:", e.message));
await storage.initGovernanceDelegation().catch(e => console.warn("initGovernanceDelegation:", e.message));
await storage.initNftTables().catch(e => console.warn("initNftTables:", e.message));
await storage.initInsuranceTables().catch(e => console.warn("initInsuranceTables:", e.message));
await storage.initPriceHistory().catch(e => console.warn("initPriceHistory:", e.message));
await storage.initWebhookTables().catch(e => console.warn("initWebhookTables:", e.message));
await storage.initMultisigTables().catch(e => console.warn("initMultisigTables:", e.message));
await storage.initIdentityTables().catch(e => console.warn("initIdentityTables:", e.message));
await storage.initRwaTables().catch(e => console.warn("initRwaTables:", e.message));
await storage.initNetworkSnapshotTable().catch(e => console.warn("initNetworkSnapshotTable:", e.message));
await (storage as any).initTradesTable().catch((e: any) => console.warn("initTradesTable:", e.message));
await (storage as any).initNotificationTable().catch((e: any) => console.warn("initNotificationTable:", e.message));
await (storage as any).initWebhookDeliveriesTable().catch((e: any) => console.warn("initWebhookDeliveriesTable:", e.message));
await (storage as any).initOracleTables().catch((e: any) => console.warn("initOracleTables:", e.message));
// Ensure admin_config table exists
await (storage as any).setAdminConfig('bridge_fee_percent', '0.3').catch(() => {});
// Add is_visible column to token_launches if missing
(storage as any).updateLaunchVisibility('00000000-0000-0000-0000-000000000000', true).catch(() => {});

// Hourly network snapshot cron
setInterval(() => {
  storage.captureNetworkSnapshot().catch(e => console.warn("snapshot cron:", e.message));
}, 60 * 60 * 1000);
storage.captureNetworkSnapshot().catch(() => {});

// 90-day DB pruner cron — runs once daily at startup + every 24h
async function runDbPruner() {
  const pgPool = (storage as any).pgPool;
  if (!pgPool) return;
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const pruneQueries = [
      `DELETE FROM network_snapshots WHERE created_at < $1`,
      `DELETE FROM api_usage_logs WHERE created_at < $1`,
      `DELETE FROM webhook_deliveries WHERE created_at < $1`,
      `DELETE FROM xp_events WHERE created_at < $1`,
      `DELETE FROM email_verification_tokens WHERE expires_at < NOW() - INTERVAL '7 days'`,
    ];
    for (const q of pruneQueries) {
      const r = await pgPool.query(q, q.includes('$1') ? [cutoff] : []).catch(() => ({ rowCount: 0 }));
      if (r.rowCount > 0) console.log(`[pruner] ${q.split(' ').slice(0, 3).join(' ')}: removed ${r.rowCount} rows`);
    }
    console.log(`[pruner] Daily pruner complete (90-day retention)`);
  } catch (e: any) { console.warn("[pruner] error:", e.message); }
}
runDbPruner().catch(() => {});
setInterval(runDbPruner, 24 * 60 * 60 * 1000);

// Init Web Push VAPID keys + push_subscriptions table
initVapid().catch(e => console.warn("webpush init:", e.message));
ensurePushSubscriptionsTable().catch(e => console.warn("push_subscriptions table:", e.message));
ensurePreferredCurrencyColumn().catch(e => console.warn("currency column:", e.message));

// Auto-restart any test nodes that were running before this server restart
async function autoRestartPersistedNodes() {
  const toRestart = await loadPersistedTestNodeState();
  if (toRestart.length === 0) {
    console.log("[test-nodes] No persisted nodes to restart");
    return;
  }
  console.log(`[test-nodes] Auto-restarting ${toRestart.length} node(s) from persisted state…`);
  for (const { network, type } of toRestart) {
    try {
      const result = testNodeManager.start(network as any, type as any);
      if (result.ok) {
        console.log(`[test-nodes] ✓ Restarted ${type} (${network})`);
      } else {
        console.log(`[test-nodes] ⚠ ${type} (${network}): ${result.message}`);
      }
    } catch (e: any) {
      console.warn(`[test-nodes] Failed to restart ${type} (${network}):`, e.message);
    }
  }
}
// Delay 2s to let DB connections settle, then restore node state
setTimeout(() => autoRestartPersistedNodes().catch(e => console.warn("[test-nodes] auto-restart error:", e.message)), 2000);

// Price Alert LISTEN/NOTIFY via Postgres
async function startPriceAlertListener() {
  const pgPool = (storage as any).pgPool as Pool | undefined;
  if (!pgPool) return;
  const client = await pgPool.connect();
  await client.query('LISTEN price_alert_trigger').catch(() => {});
  client.on('notification', async (msg: any) => {
    try {
      const payload = JSON.parse(msg.payload ?? '{}');
      const { userId, symbol, price, target, direction, email } = payload;
      const { sendPriceAlertEmail } = await import('./email');
      const { sendPushToUser } = await import('./webpush');
      if (email) {
        sendPriceAlertEmail(email, symbol, price, target, direction).catch(() => {});
      }
      if (userId) {
        sendPushToUser(userId, {
          title: `📈 ${symbol} Price Alert`,
          body: `${symbol} is now ${direction} $${target} (current: $${price})`,
          url: '/tokens',
        }).catch(() => {});
      }
    } catch {}
  });
  client.on('error', () => { client.release(); });
  console.log('[price-alerts] Listening for Postgres NOTIFY on price_alert_trigger');
}
startPriceAlertListener().catch(e => console.warn("price alert listener:", e.message));

// Ensure hCaptcha secret is configured if HCAPTCHA_SECRET_KEY is set
if (process.env.HCAPTCHA_SECRET_KEY) {
  console.log('[faucet] hCaptcha verification enabled');
}

// Serve static frontend in production only
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "../dist");
  app.use(express.static(distPath));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

initActivityFeed();

const PORT = parseInt(process.env.PORT ?? "5001", 10);
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`ChainCore server running on port ${PORT}`);
});

server.on('upgrade', (req, socket, head) => {
  handleUpgrade(req, socket as any, head);
});
