import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";
import { seedFounder } from "./seed";
import { storage } from "./storage";
import { initVapid, ensurePushSubscriptionsTable } from "./webpush";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Security headers (CSP hardening)
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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

await setupAuth(app);
registerRoutes(app);
await seedFounder();
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

const PORT = parseInt(process.env.PORT ?? "5001", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`ChainCore server running on port ${PORT}`);
});
