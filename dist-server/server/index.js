"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const auth_1 = require("./auth");
const routes_1 = require("./routes");
const seed_1 = require("./seed");
const storage_1 = require("./storage");
const webpush_1 = require("./webpush");
const __dirname = path_1.default.dirname((0, url_1.fileURLToPath)(import.meta.url));
const app = (0, express_1.default)();
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
// Security headers (CSP hardening)
app.use((_req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed by Vite HMR in dev
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' wss: ws: https:",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; '));
    next();
});
await (0, auth_1.setupAuth)(app);
(0, routes_1.registerRoutes)(app);
await (0, seed_1.seedFounder)();
await storage_1.storage.seedAchievements().catch(e => console.warn("seedAchievements:", e.message));
await storage_1.storage.initReferralTables().catch(e => console.warn("initReferralTables:", e.message));
await storage_1.storage.initGovernanceTreasury().catch(e => console.warn("initGovernanceTreasury:", e.message));
await storage_1.storage.initApiKeysTables().catch(e => console.warn("initApiKeysTables:", e.message));
await storage_1.storage.initApiUsageLogs().catch(e => console.warn("initApiUsageLogs:", e.message));
await storage_1.storage.initBridgeTransferTable().catch(e => console.warn("initBridgeTransferTable:", e.message));
await storage_1.storage.initGovernanceDelegation().catch(e => console.warn("initGovernanceDelegation:", e.message));
await storage_1.storage.initNftTables().catch(e => console.warn("initNftTables:", e.message));
await storage_1.storage.initInsuranceTables().catch(e => console.warn("initInsuranceTables:", e.message));
await storage_1.storage.initPriceHistory().catch(e => console.warn("initPriceHistory:", e.message));
await storage_1.storage.initWebhookTables().catch(e => console.warn("initWebhookTables:", e.message));
await storage_1.storage.initMultisigTables().catch(e => console.warn("initMultisigTables:", e.message));
await storage_1.storage.initIdentityTables().catch(e => console.warn("initIdentityTables:", e.message));
await storage_1.storage.initRwaTables().catch(e => console.warn("initRwaTables:", e.message));
await storage_1.storage.initNetworkSnapshotTable().catch(e => console.warn("initNetworkSnapshotTable:", e.message));
await storage_1.storage.initTradesTable().catch((e) => console.warn("initTradesTable:", e.message));
await storage_1.storage.initNotificationTable().catch((e) => console.warn("initNotificationTable:", e.message));
await storage_1.storage.initWebhookDeliveriesTable().catch((e) => console.warn("initWebhookDeliveriesTable:", e.message));
await storage_1.storage.initOracleTables().catch((e) => console.warn("initOracleTables:", e.message));
// Ensure admin_config table exists
await storage_1.storage.setAdminConfig('bridge_fee_percent', '0.3').catch(() => { });
// Add is_visible column to token_launches if missing
storage_1.storage.updateLaunchVisibility('00000000-0000-0000-0000-000000000000', true).catch(() => { });
// Hourly network snapshot cron
setInterval(() => {
    storage_1.storage.captureNetworkSnapshot().catch(e => console.warn("snapshot cron:", e.message));
}, 60 * 60 * 1000);
storage_1.storage.captureNetworkSnapshot().catch(() => { });
// 90-day DB pruner cron — runs once daily at startup + every 24h
async function runDbPruner() {
    const pgPool = storage_1.storage.pgPool;
    if (!pgPool)
        return;
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
            if (r.rowCount > 0)
                console.log(`[pruner] ${q.split(' ').slice(0, 3).join(' ')}: removed ${r.rowCount} rows`);
        }
        console.log(`[pruner] Daily pruner complete (90-day retention)`);
    }
    catch (e) {
        console.warn("[pruner] error:", e.message);
    }
}
runDbPruner().catch(() => { });
setInterval(runDbPruner, 24 * 60 * 60 * 1000);
// Init Web Push VAPID keys + push_subscriptions table
(0, webpush_1.initVapid)().catch(e => console.warn("webpush init:", e.message));
(0, webpush_1.ensurePushSubscriptionsTable)().catch(e => console.warn("push_subscriptions table:", e.message));
// Price Alert LISTEN/NOTIFY via Postgres
async function startPriceAlertListener() {
    const pgPool = storage_1.storage.pgPool;
    if (!pgPool)
        return;
    const client = await pgPool.connect();
    await client.query('LISTEN price_alert_trigger').catch(() => { });
    client.on('notification', async (msg) => {
        try {
            const payload = JSON.parse(msg.payload ?? '{}');
            const { userId, symbol, price, target, direction, email } = payload;
            const { sendPriceAlertEmail } = await Promise.resolve().then(() => __importStar(require('./email')));
            const { sendPushToUser } = await Promise.resolve().then(() => __importStar(require('./webpush')));
            if (email) {
                sendPriceAlertEmail(email, symbol, price, target, direction).catch(() => { });
            }
            if (userId) {
                sendPushToUser(userId, {
                    title: `📈 ${symbol} Price Alert`,
                    body: `${symbol} is now ${direction} $${target} (current: $${price})`,
                    url: '/tokens',
                }).catch(() => { });
            }
        }
        catch { }
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
    const distPath = path_1.default.join(__dirname, "../dist");
    app.use(express_1.default.static(distPath));
    app.get("/{*path}", (_req, res) => {
        res.sendFile(path_1.default.join(distPath, "index.html"));
    });
}
const PORT = parseInt(process.env.PORT ?? "5001", 10);
app.listen(PORT, "0.0.0.0", () => {
    console.log(`ChainCore server running on port ${PORT}`);
});
