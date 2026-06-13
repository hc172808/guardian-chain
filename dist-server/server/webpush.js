"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initVapid = initVapid;
exports.getVapidPublicKey = getVapidPublicKey;
exports.sendPushToUser = sendPushToUser;
exports.broadcastPush = broadcastPush;
exports.ensurePushSubscriptionsTable = ensurePushSubscriptionsTable;
/**
 * Web Push service — VAPID-based push notifications.
 * Generates VAPID keys on first run and stores them in admin_config.
 * Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars to use fixed keys.
 */
const web_push_1 = __importDefault(require("web-push"));
const pg_1 = require("pg");
const pgPool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
let initialized = false;
async function initVapid() {
    if (initialized)
        return;
    let publicKey = process.env.VAPID_PUBLIC_KEY;
    let privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
        // Try to load from DB
        try {
            const r = await pgPool.query(`SELECT config_value FROM admin_config WHERE config_key='vapid_keys' LIMIT 1`);
            if (r.rows[0]) {
                const keys = r.rows[0].config_value;
                publicKey = keys.publicKey;
                privateKey = keys.privateKey;
            }
        }
        catch { }
    }
    if (!publicKey || !privateKey) {
        const keys = web_push_1.default.generateVAPIDKeys();
        publicKey = keys.publicKey;
        privateKey = keys.privateKey;
        // Persist to DB
        try {
            await pgPool.query(`INSERT INTO admin_config (config_key, config_value) VALUES ('vapid_keys', $1)
         ON CONFLICT (config_key) DO UPDATE SET config_value = $1`, [JSON.stringify({ publicKey, privateKey })]);
        }
        catch { }
        console.log('[webpush] Generated new VAPID keys');
    }
    web_push_1.default.setVapidDetails('mailto:netlifegy@gmail.com', publicKey, privateKey);
    initialized = true;
    return publicKey;
}
async function getVapidPublicKey() {
    if (!initialized)
        await initVapid();
    try {
        const keys = web_push_1.default.generateVAPIDKeys; // just to check initialized
        const r = await pgPool.query(`SELECT config_value FROM admin_config WHERE config_key='vapid_keys' LIMIT 1`);
        if (r.rows[0])
            return r.rows[0].config_value.publicKey;
    }
    catch { }
    return process.env.VAPID_PUBLIC_KEY ?? null;
}
async function sendPushToUser(userId, payload) {
    if (!initialized)
        await initVapid();
    try {
        const r = await pgPool.query(`SELECT subscription FROM push_subscriptions WHERE user_id = $1`, [userId]);
        const promises = r.rows.map((row) => web_push_1.default.sendNotification(row.subscription, JSON.stringify({ ...payload, icon: payload.icon ?? '/gyds-coin.jpg' }))
            .catch(() => { }) // ignore stale subscriptions
        );
        await Promise.all(promises);
    }
    catch { }
}
async function broadcastPush(payload) {
    if (!initialized)
        await initVapid();
    try {
        const r = await pgPool.query(`SELECT user_id, subscription FROM push_subscriptions`);
        const promises = r.rows.map((row) => web_push_1.default.sendNotification(row.subscription, JSON.stringify({ ...payload, icon: payload.icon ?? '/gyds-coin.jpg' }))
            .catch(() => { }));
        await Promise.all(promises);
    }
    catch { }
}
async function ensurePushSubscriptionsTable() {
    await pgPool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, (subscription->>'endpoint'))
    )
  `).catch(() => { });
}
