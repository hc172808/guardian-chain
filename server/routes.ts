import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { storage } from "./storage";
import { testNodeManager, getGenesisEnode, NETWORK_CFGS, saveTestNodeState, loadPersistedTestNodeState, getNodeLogFilePath, clearNodeLogFile, creditAddress, getNetworkBalance, seedBalanceTrie } from "./testNodes";
import { withCache, getCacheStats, clearCache, invalidate } from "./queryCache";
import { encryptSeed, decryptSeed } from "./walletCrypto";
import { getVapidPublicKey, sendPushToUser, broadcastPush } from "./webpush";
import { Pool } from "pg";
import { blockIp, unblockIp, clearAllBlockedIps, getBlockedIpList, getFirewallStatus, refreshSecuritySettings, listIpBans, addIpBan, removeIpBan, getClientIp, getHoneypotRedirectUrl, invalidateHoneypotCache, getLockoutSettings, invalidateLockoutSettingsCache, listActiveLockouts, clearLockout, DEFAULT_LOCKOUT_DURATIONS_SEC } from "./security";
import { sendTelegramAlert, sendTelegramMessage, testTelegramConnection } from "./telegram";
import { sendBuyRequestStatusEmail, sendCashoutStatusEmail } from "./email";
import { sendWhatsAppAlert, sendWhatsAppMessage, testWhatsAppConnection, getWhatsAppConfig, saveWhatsAppConfig } from "./whatsapp";
import multer from "multer";
import path from "path";
import fs from "fs";
import { broadcastActivity, issueWsToken } from "./activityFeed";
import { broadcastTransfer, pollForConfirmation, checkRpcHealth, testEndpoints } from "./chainRpc";
import { generateTreasuryWallet, hasTreasuryKey, getTreasuryAddress, getTreasuryBalance, sendTreasuryTransfer } from "./treasury";
const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── GitHub Webhook store (in-memory, max 100 events) ─────────────────────────
interface GithubWebhookEvent {
  id: string;
  event: string;
  repo: string;
  pusher?: string;
  branch?: string;
  commitCount?: number;
  headCommit?: string;
  timestamp: string;
  verified: boolean;
}
const githubWebhookEvents: GithubWebhookEvent[] = [];
const githubPendingRecheck = new Set<string>(); // repos that need a NodeRepoSync recheck

// 20 req / 15 min — matches auth.ts authLimiter
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many login attempts. Please wait 15 minutes before trying again." } });
// 5 req / hr — faucet claim
const faucetLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: "Too many faucet requests." } });
// 100 req / min for developer API keys (was 200 — tightened)
const apiLimiter = rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: "Rate limit exceeded. Please slow down." } });
// RPC relay: 60 req / min per IP (protect the /rpc proxy endpoint)
const rpcLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false, skip: (req) => { const ip = req.ip ?? ''; return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'; }, message: { error: "RPC rate limit exceeded." } });
// File upload: 10 req / 10 min
const uploadLimiter = rateLimit({ windowMs: 10 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many uploads. Please wait." } });

function requireAuth(req: Request, res: Response, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function requireAdmin(req: Request, res: Response, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
  const user = req.user as any;
  if (!user._isAdmin && !user._isFounder) return res.status(403).json({ error: "Forbidden" });
  next();
}

async function enrichUserWithRoles(req: Request, _res: Response, next: any) {
  if (req.isAuthenticated() && req.user) {
    const user = req.user as any;
    if (!("_rolesLoaded" in user)) {
      const roles = await storage.getUserRoles(user.id);
      const roleNames = roles.map((r: any) => r.role);
      user.roles = roleNames;
      user._isFounder = roleNames.includes("founder");
      user._isAdmin = roleNames.includes("admin") || roleNames.includes("founder");
      user._rolesLoaded = true;
    }
  }
  next();
}

export function registerRoutes(app: Express) {
  app.use(enrichUserWithRoles);

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.get("/api/me", async (req, res) => {
    if (!req.isAuthenticated()) return res.json(null);
    const user = req.user as any;
    // Always fetch live roles from DB — req.user never has them populated
    const roleRows = await pgPool.query(
      `SELECT role FROM user_roles WHERE user_id = $1`, [user.id]
    ).catch(() => ({ rows: [] as any[] }));
    const roles: string[] = roleRows.rows.map((r: any) => r.role);
    const isAdmin = roles.includes('admin') || roles.includes('founder');
    const isFounder = roles.includes('founder');
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      walletAddress: user.walletAddress,
      totpEnabled: user.totpEnabled ?? false,
      isBanned: user.isBanned ?? false,
      hasPassword: !!(user.passwordHash ?? user.password_hash),
      roles,
      isAdmin,
      isFounder,
      createdAt: user.createdAt ?? user.created_at ?? null,
    });
  });

  // ── Profile ────────────────────────────────────────────────────────────────
  app.get("/api/profile", requireAuth, async (req, res) => {
    const user = req.user as any;
    const profile = await storage.getUserProfile(user.id);
    // Attach preferred_currency from DB
    try {
      const { rows } = await pgPool.query(`SELECT preferred_currency FROM profiles WHERE user_id=$1`, [user.id]);
      if (rows[0]) (profile as any).preferred_currency = rows[0].preferred_currency ?? 'USD';
    } catch {}
    res.json(profile);
  });

  app.patch("/api/profile", requireAuth, async (req, res) => {
    const user = req.user as any;
    const profile = await storage.updateUserProfile(user.id, req.body);
    res.json(profile);
  });

  // ── Currency preference ────────────────────────────────────────────────────
  app.patch("/api/profile/currency", requireAuth, async (req, res) => {
    const user = req.user as any;
    const VALID = ['USD','EUR','GBP','CAD','AUD','GYD','JMD'];
    const { preferred_currency } = req.body;
    if (!VALID.includes(preferred_currency)) return res.status(400).json({ error: "Invalid currency" });
    try {
      await pgPool.query(`UPDATE profiles SET preferred_currency=$1, updated_at=NOW() WHERE user_id=$2`, [preferred_currency, user.id]);
      res.json({ ok: true, preferred_currency });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Exchange Rates ─────────────────────────────────────────────────────────
  app.get("/api/exchange-rates", async (_req, res) => {
    try {
      const { getExchangeRates } = await import("./exchangeRates");
      const data = await getExchangeRates();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Profile privacy ────────────────────────────────────────────────────────
  app.get("/api/profile/privacy", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      const { rows } = await pgPool.query(`SELECT is_public FROM profiles WHERE user_id=$1`, [user.id]);
      res.json({ is_public: rows[0]?.is_public ?? false });
    } catch { res.json({ is_public: false }); }
  });

  app.patch("/api/profile/privacy", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { is_public } = req.body;
    if (typeof is_public !== 'boolean') return res.status(400).json({ error: 'is_public must be boolean' });
    try {
      await pgPool.query(`UPDATE profiles SET is_public=$1, updated_at=NOW() WHERE user_id=$2`, [is_public, user.id]);
      res.json({ ok: true, is_public });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Public profile view ────────────────────────────────────────────────────
  app.get("/api/profile/:userId/public", async (req, res) => {
    try {
      const { rows } = await pgPool.query(
        `SELECT p.display_name, p.username, p.bio, p.avatar_url, p.is_public, u.wallet_address
         FROM profiles p JOIN users u ON u.id=p.user_id
         WHERE p.user_id=$1 LIMIT 1`,
        [req.params.userId]
      );
      if (!rows[0]) return res.status(404).json({ error: 'User not found' });
      if (!rows[0].is_public) return res.status(403).json({ error: 'This profile is private' });
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Telegram alert test ────────────────────────────────────────────────────
  app.post("/api/profile/telegram-test", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { chat_id, bot_token } = req.body;
    const profile = await storage.getUserProfile(user.id);
    const chatId = chat_id ?? (profile as any)?.telegram_chat_id ?? "";
    if (!chatId) return res.status(400).json({ ok: false, error: "No Telegram chat ID provided. Set it in your profile or pass chat_id." });
    const result = await testTelegramConnection(chatId, bot_token);
    res.json(result);
  });

  // ── WhatsApp — admin config ────────────────────────────────────────────────
  app.get("/api/admin/whatsapp-config", requireAdmin, async (_req, res) => {
    const cfg = await getWhatsAppConfig();
    // Never expose the full access token to the client — just mask it
    res.json({
      enabled:       cfg.enabled,
      phoneNumberId: cfg.phoneNumberId,
      accessTokenSet: cfg.accessToken.length > 0,
      accessTokenMasked: cfg.accessToken.length > 8
        ? cfg.accessToken.slice(0, 6) + "•".repeat(12) + cfg.accessToken.slice(-4)
        : cfg.accessToken ? "•".repeat(cfg.accessToken.length) : "",
      businessId:    cfg.businessId,
    });
  });

  app.post("/api/admin/whatsapp-config", requireAdmin, async (req, res) => {
    const { enabled, phoneNumberId, accessToken, businessId } = req.body;
    await saveWhatsAppConfig({
      ...(enabled       !== undefined && { enabled: Boolean(enabled) }),
      ...(phoneNumberId !== undefined && { phoneNumberId: String(phoneNumberId).trim() }),
      ...(accessToken   !== undefined && accessToken !== "" && { accessToken: String(accessToken).trim() }),
      ...(businessId    !== undefined && { businessId: String(businessId).trim() }),
    });
    res.json({ ok: true });
  });

  app.post("/api/admin/whatsapp-test", requireAdmin, async (req, res) => {
    const { to, message, phoneNumberId, accessToken } = req.body;
    if (!to) return res.status(400).json({ ok: false, error: "Recipient phone number (to) is required" });
    // If a custom message is provided, send it directly instead of the test template
    if (message && message.trim()) {
      const result = await sendWhatsAppMessage(to, message.trim(), {
        enabled: true,
        phoneNumberId: phoneNumberId || (await getWhatsAppConfig()).phoneNumberId,
        accessToken: accessToken || (await getWhatsAppConfig()).accessToken,
        businessId: '',
      });
      return res.json(result);
    }
    const result = await testWhatsAppConnection(to, { phoneNumberId, accessToken });
    res.json(result);
  });

  // ── WhatsApp — bulk broadcast (admin) ──────────────────────────────────────
  app.post("/api/admin/whatsapp-broadcast", requireAdmin, async (req, res) => {
    const { numbers, message } = req.body;
    if (!Array.isArray(numbers) || numbers.length === 0) return res.status(400).json({ ok: false, error: "numbers array required" });
    if (!message || !message.trim()) return res.status(400).json({ ok: false, error: "message required" });
    const cfg = await getWhatsAppConfig();
    if (!cfg.enabled) return res.status(400).json({ ok: false, error: "WhatsApp not enabled in admin config" });
    let ok = 0, fail = 0;
    const errors: string[] = [];
    for (const num of numbers) {
      const result = await sendWhatsAppMessage(num, message.trim(), cfg);
      if (result.ok) ok++; else { fail++; errors.push(`${num}: ${result.error}`); }
    }
    res.json({ ok: true, sent: ok, failed: fail, errors: errors.slice(0, 10) });
  });

  // ── WhatsApp — user test ───────────────────────────────────────────────────
  app.post("/api/profile/whatsapp-test", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { phone } = req.body;
    const profile = await storage.getUserProfile(user.id);
    const to = phone ?? (profile as any)?.metadata?.whatsapp_number ?? "";
    if (!to) return res.status(400).json({ ok: false, error: "No WhatsApp number set. Add it in your profile first." });
    const result = await testWhatsAppConnection(to);
    res.json(result);
  });

  // ── Telegram send direct message (admin/founder) ───────────────────────────
  app.post("/api/admin/telegram-send", async (req, res) => {
    const user = req.user as any;
    if (!user || !["admin", "founder"].includes(user.role)) return res.status(403).json({ error: "Forbidden" });
    const { chat_id, message } = req.body;
    if (!chat_id || !message) return res.status(400).json({ error: "chat_id and message required" });
    const result = await sendTelegramMessage(chat_id, message);
    res.json(result);
  });

  // PUT is an alias for PATCH (Profile.tsx uses PUT)
  app.put("/api/profile", requireAuth, async (req, res) => {
    const user = req.user as any;
    // Username uniqueness check
    if (req.body.username) {
      const existing = await storage.getUserProfileByUsername(req.body.username.trim().toLowerCase());
      if (existing && (existing as any).userId !== user.id) return res.status(409).json({ error: "Username taken" });
    }
    const profile = await storage.updateUserProfile(user.id, req.body);
    res.json(profile);
  });

  // ── Wallets ────────────────────────────────────────────────────────────────
  app.get("/api/wallets", requireAuth, async (req, res) => {
    const user = req.user as any;
    const data = await storage.getUserWallets(user.id);
    // Decrypt seeds on the way out (transparent to client)
    const decrypted = data.map((w: any) => ({
      ...w,
      encrypted_seed: w.encryptedSeed ? decryptSeed(w.encryptedSeed) : '',
      encryptedSeed: w.encryptedSeed ? decryptSeed(w.encryptedSeed) : '',
    }));
    res.json(decrypted);
  });

  app.post("/api/wallets", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      const { address, encrypted_seed = "", pin_hash = "" } = req.body;
      if (!address) return res.status(400).json({ error: "address required" });
      const seedToStore = encryptSeed(encrypted_seed);
      const row = await storage.insertWallet({ userId: user.id, address, encryptedSeed: seedToStore, pinHash: pin_hash });
      res.json(row);
    } catch (err: any) {
      console.error("[wallets] create error:", err.message);
      res.status(500).json({ error: err.message ?? "Failed to create wallet" });
    }
  });

  app.delete("/api/wallets/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    await storage.deleteWallet(req.params.id, user.id);
    res.json({ ok: true });
  });

  app.patch("/api/wallets/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { encrypted_seed, pin_hash } = req.body;
    const row = await storage.updateWallet(req.params.id, user.id, {
      ...(encrypted_seed !== undefined ? { encryptedSeed: encryptSeed(encrypted_seed) } : {}),
      ...(pin_hash !== undefined ? { pinHash: pin_hash } : {}),
    });
    if (!row) return res.status(404).json({ error: 'Wallet not found' });
    res.json(row);
  });

  // ── Transactions ───────────────────────────────────────────────────────────
  app.get("/api/transactions", requireAuth, async (req, res) => {
    const user = req.user as any;
    const data = user._isAdmin
      ? await storage.getAllTransactions()
      : await storage.getUserTransactions(user.id);
    res.json(data);
  });

  app.post("/api/transactions", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const row = await storage.insertTransaction({ ...req.body, userId: user.id });
      res.json(row);

      storage.awardXpOnce(user.id, 'first_transaction', 50, 'First transaction on GYDSchain! +50 XP').catch(() => {});
      broadcastActivity({ type: 'transaction', title: 'New Transaction', detail: `${req.body.type ?? 'transfer'} · ${req.body.amount ?? ''} ${req.body.tokenSymbol ?? req.body.token_symbol ?? ''}`.trim(), user: user.username ?? (user.walletAddress ?? '').slice(0, 10), ip: req.ip ?? undefined });

      // ── Broadcast to GYDSchain network (fire-and-forget after response) ──────
      const fromAddress = req.body.from_address ?? req.body.fromAddress ?? '';
      const toAddress   = req.body.to_address   ?? req.body.toAddress   ?? '';
      const amountEther = parseFloat(req.body.amount ?? '0');
      const signedRaw   = req.body.signed_raw_tx ?? req.body.signedRawTx ?? undefined;

      if (fromAddress && toAddress && amountEther > 0) {
        broadcastTransfer({
          fromAddress,
          toAddress,
          amountEther,
          signedRawTx: signedRaw,
          chainId: parseInt(process.env.GYDS_CHAIN_ID ?? '13370'),
        }).then(async (broadcast) => {
          const txId = row.id;
          console.log(`[chain] tx ${txId} → onChain=${broadcast.onChain} hash=${broadcast.txHash} endpoint=${broadcast.endpoint ?? 'n/a'}${broadcast.error ? ' err=' + broadcast.error : ''}`);

          if (broadcast.onChain) {
            await pgPool.query(
              `UPDATE transactions SET tx_hash=$1, status='pending' WHERE id=$2`,
              [broadcast.txHash, txId]
            );
            // Poll for confirmation in background
            pollForConfirmation(broadcast.txHash).then(async ({ confirmed, blockNumber }) => {
              if (confirmed) {
                await pgPool.query(
                  `UPDATE transactions SET status='confirmed', confirmed_at=NOW() WHERE id=$1`,
                  [txId]
                );
                console.log(`[chain] tx ${txId} confirmed at block ${blockNumber}`);
                broadcastActivity({ type: 'transaction', title: 'Transaction Confirmed', detail: `${req.body.type ?? 'transfer'} · ${req.body.amount ?? ''} GYDS confirmed on-chain`, user: user.username ?? '', ip: req.ip ?? undefined });
              }
            }).catch((e) => console.warn('[chain] poll error:', e.message));
          }
        }).catch((e) => console.warn('[chain] broadcast error:', e.message));
      }
    } catch (err: any) {
      console.error('[transactions] insert error:', err.message);
      res.status(500).json({ error: err.message ?? 'Failed to submit transaction' });
    }
  });

  // ── RPC health check endpoint ──────────────────────────────────────────────
  app.get("/api/chain/health", requireAuth, async (_req, res) => {
    const health = await checkRpcHealth();
    res.json(health);
  });

  // ── RPC URL env config (admin) ─────────────────────────────────────────────
  app.get("/api/admin/rpc-url", requireAdmin, (_req, res) => {
    res.json({ rpcUrl: process.env.GYDS_RPC_URL ?? '' });
  });
  app.post("/api/admin/rpc-url", requireAdmin, async (req, res) => {
    const { rpcUrl } = req.body ?? {};
    if (!rpcUrl || typeof rpcUrl !== 'string') {
      res.status(400).json({ ok: false, error: 'rpcUrl required' }); return;
    }
    const trimmed = rpcUrl.trim();
    process.env.GYDS_RPC_URL = trimmed;
    try {
      const envPath = path.resolve('.env');
      let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      if (/^GYDS_RPC_URL=.*/m.test(content)) {
        content = content.replace(/^GYDS_RPC_URL=.*/m, `GYDS_RPC_URL=${trimmed}`);
      } else {
        content += `\nGYDS_RPC_URL=${trimmed}\n`;
      }
      fs.writeFileSync(envPath, content, 'utf8');
    } catch {}
    res.json({ ok: true, rpcUrl: trimmed });
  });

  // ── Node Installations ─────────────────────────────────────────────────────
  // In-memory ping history ring buffer (max 40 entries per node)
  const PING_HISTORY_MAX = 40;
  const pingHistory = new Map<string, Array<{ ts: number; online: boolean; latencyMs: number | null; blockHeight: number | null; peerCount: number | null }>>();
  const pushPingHistory = (nodeId: string, entry: { online: boolean; latencyMs: number | null; blockHeight: number | null; peerCount: number | null }) => {
    const buf = pingHistory.get(nodeId) ?? [];
    buf.push({ ...entry, ts: Date.now() });
    if (buf.length > PING_HISTORY_MAX) buf.splice(0, buf.length - PING_HISTORY_MAX);
    pingHistory.set(nodeId, buf);
  };

  app.get("/api/nodes", requireAuth, async (req, res) => {
    const user = req.user as any;
    const data = user._isAdmin
      ? await storage.getAllNodes()
      : await storage.getUserNodes(user.id);
    res.json(data);
  });

  app.get("/api/nodes/:id", requireAuth, async (req, res) => {
    try {
      const { rows } = await pgPool.query(
        `SELECT ni.*, u.email FROM node_installations ni LEFT JOIN users u ON u.id=ni.user_id WHERE ni.id=$1`,
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      const r = rows[0];
      res.json({
        id: r.id, userId: r.user_id, nodeType: r.node_type,
        ipAddress: r.ip_address, hostname: r.hostname, rpcPort: r.rpc_port,
        wireguardPublicKey: r.wireguard_public_key,
        isOnline: r.is_online, isApproved: r.is_approved, isSynced: r.is_synced,
        lastBlockHeight: r.last_block_height, peerCount: r.peer_count,
        lastHeartbeat: r.last_heartbeat, createdAt: r.created_at,
        profiles: { email: r.email },
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/nodes/:id/ping-history", requireAdmin, async (req, res) => {
    res.json(pingHistory.get(req.params.id) ?? []);
  });

  app.post("/api/nodes", requireAuth, async (req, res) => {
    const user = req.user as any;
    const isPrivileged = user._isAdmin || user._isFounder;
    const b = req.body ?? {};
    // Accept both camelCase (from NodeConfigManager) and snake_case
    const row = await storage.insertNode({
      nodeType:   b.nodeType   ?? b.node_type   ?? 'litenode',
      hostname:   b.hostname   ?? b.ip_address  ?? null,
      ipAddress:  b.ipAddress  ?? b.ip_address  ?? null,
      rpcPort:    b.rpcPort    ?? b.rpc_port    ?? 8545,
      wireguardPublicKey: b.wireguardPublicKey ?? b.wireguard_public_key ?? null,
      userId: user.id,
      isApproved: isPrivileged ? true : (b.isApproved ?? b.is_approved ?? false),
      approvedBy: isPrivileged ? user.id : null,
      approvedAt: isPrivileged ? new Date() : null,
    });
    res.json(row);
    storage.awardXpOnce(user.id, 'first_node', 200, 'First node installed on GYDSchain! +200 XP').catch(() => {});
  });

  // ── /api/node-installations aliases (legacy compat) ────────────────────────
  app.get("/api/node-installations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const data = user._isAdmin ? await storage.getAllNodes() : await storage.getUserNodes(user.id);
    res.json(data);
  });
  app.post("/api/node-installations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const isPrivileged = user._isAdmin || user._isFounder;
    const b = req.body ?? {};
    const row = await storage.insertNode({
      nodeType:   b.nodeType   ?? b.node_type   ?? 'litenode',
      hostname:   b.hostname   ?? b.ip_address  ?? null,
      ipAddress:  b.ipAddress  ?? b.ip_address  ?? null,
      rpcPort:    b.rpcPort    ?? b.rpc_port    ?? 8545,
      wireguardPublicKey: b.wireguardPublicKey ?? b.wireguard_public_key ?? null,
      userId: user.id,
      isApproved: isPrivileged ? true : (b.isApproved ?? b.is_approved ?? false),
      approvedBy: isPrivileged ? user.id : null,
      approvedAt: isPrivileged ? new Date() : null,
    });
    res.json(row);
    storage.awardXpOnce(user.id, 'first_node', 200, 'First node installed on GYDSchain! +200 XP').catch(() => {});
  });
  app.delete("/api/node-installations/:id", requireAuth, async (req, res) => {
    await storage.deleteNode(req.params.id); res.json({ ok: true });
  });

  app.patch("/api/nodes/:id", requireAdmin, async (req, res) => {
    const row = await storage.updateNode(req.params.id, req.body);
    res.json(row);
    if (req.body.isApproved === true) {
      broadcastActivity({ type: 'node_approved', title: 'Node Approved', detail: `Node ${req.params.id.slice(0, 8)}… approved`, user: (req.user as any)?.username });
    }
  });

  app.delete("/api/nodes/:id", requireAuth, async (req, res) => {
    await storage.deleteNode(req.params.id);
    res.json({ ok: true });
  });

  // ── Documentation ──────────────────────────────────────────────────────────
  app.get("/api/docs", async (_req, res) => {
    const data = await storage.getAllDocs();
    res.json(data);
  });

  app.get("/api/docs/:slug", async (req, res) => {
    const doc = await storage.getDoc(req.params.slug);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  });

  app.put("/api/docs/:slug", requireAdmin, async (req, res) => {
    const row = await storage.upsertDoc(req.params.slug, req.body);
    res.json(row);
  });

  // ── Admin Config ───────────────────────────────────────────────────────────
  app.get("/api/config", async (req, res) => {
    const data = await storage.getAllConfigs();
    // Filter sensitive keys for non-admins
    const user = req.user as any;
    const isAdmin = user?._isAdmin || user?._isFounder;
    const filtered = isAdmin ? data : data.filter((c: any) => !String(c.configKey).startsWith("secret_"));
    res.json(filtered);
  });

  app.get("/api/config/:key", async (req, res) => {
    const row = await storage.getConfig(req.params.key);
    if (!row) return res.json(null);
    res.json(row);
  });

  app.post("/api/config", requireAdmin, async (req, res) => {
    const user = req.user as any;
    const { key, value } = req.body;
    const row = await storage.upsertConfig(key, value, user.id);
    res.json(row);
  });

  // ── Token Operations ───────────────────────────────────────────────────────
  // Drizzle returns camelCase JS keys (operationType, walletAddress, ...) while
  // the frontend (BurnMintManager) expects the snake_case shape it POSTs with.
  // Map + coerce numeric strings to numbers here so the History tab doesn't
  // crash on `op.operation_type.toUpperCase()` against an undefined field.
  const toSnakeOperation = (r: any) => ({
    id: r.id,
    operation_type: r.operationType ?? r.operation_type,
    amount: Number(r.amount),
    usdt_amount: Number(r.usdtAmount ?? r.usdt_amount ?? 0),
    wallet_address: r.walletAddress ?? r.wallet_address,
    tx_hash: r.txHash ?? r.tx_hash,
    created_by: r.createdBy ?? r.created_by,
    created_at: r.createdAt ?? r.created_at,
    status: r.status,
  });

  app.get("/api/token-operations", async (_req, res) => {
    const data = await storage.getTokenOperations();
    res.json((data as any[]).map(toSnakeOperation));
  });

  app.post("/api/token-operations", requireAdmin, async (req, res) => {
    const user = req.user as any;
    const { operation_type, usdt_amount, wallet_address, tx_hash, amount, ...rest } = req.body;
    const opType = operation_type ?? rest.operationType;

    let finalTxHash = tx_hash ?? rest.txHash;
    let onChain = false;
    let onChainError: string | undefined;

    // Mints become real transfers from the treasury account when one is
    // configured — otherwise this stays the existing off-chain ledger entry
    // (with a fabricated tx hash), same as before.
    const isMint = opType === "mint" || opType === "mint_gusd";
    if (isMint && hasTreasuryKey() && wallet_address && amount) {
      try {
        const result = await sendTreasuryTransfer(wallet_address, Number(amount));
        finalTxHash = result.txHash;
        onChain = true;
      } catch (err: any) {
        onChainError = err.message;
        // Fall through and record as an off-chain/simulated op so the admin
        // still has a ledger entry, but the response tells them it failed
        // on-chain instead of silently pretending it worked.
      }
    }

    const row = await storage.insertTokenOperation({
      ...rest,
      amount,
      operationType: opType,
      usdtAmount: usdt_amount ?? rest.usdtAmount ?? 0,
      walletAddress: wallet_address ?? rest.walletAddress,
      txHash: finalTxHash,
      createdBy: user.id,
    });
    res.json({ ...toSnakeOperation(row), on_chain: onChain, on_chain_error: onChainError });
  });

  // ── Treasury (real on-chain mint funding source) ───────────────────────────
  app.get("/api/admin/treasury/status", requireAdmin, async (_req, res) => {
    try {
      const configured = hasTreasuryKey();
      const address = getTreasuryAddress();
      let balance: string | null = null;
      let balanceError: string | undefined;
      if (address) {
        try {
          const result = await getTreasuryBalance();
          balance = result?.balance ?? null;
        } catch (err: any) {
          balanceError = err.message;
        }
      }
      res.json({ configured, address, balance, balanceError });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Generates a fresh keypair server-side and returns it ONCE. Nothing is
  // persisted — the admin must copy the private key immediately and either
  // paste it into the Treasury Private Key field below, or set it as
  // TREASURY_PRIVATE_KEY in .env themselves, then fund the address on-chain.
  app.post("/api/admin/treasury/generate", requireAdmin, async (_req, res) => {
    try {
      const wallet = generateTreasuryWallet();
      res.json({ ...wallet, warning: "This private key is shown only once and is not stored anywhere. Copy it now — if you lose it before saving, you must generate a new wallet." });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Token Price ────────────────────────────────────────────────────────────
  // Drizzle's `numeric` columns are returned as strings by node-postgres; coerce
  // them to numbers here so every consumer (e.g. price.toFixed(...)) works.
  const coerceTokenPrice = (row: any) =>
    row && {
      ...row,
      price: Number(row.price),
      total_supply: Number(row.total_supply ?? row.totalSupply),
      circulating_supply: Number(row.circulating_supply ?? row.circulatingSupply),
      burned_total: Number(row.burned_total ?? row.burnedTotal),
    };

  app.get("/api/token-price", async (_req, res) => {
    const row = await storage.getTokenPrice();
    res.json(coerceTokenPrice(row));
  });

  app.patch("/api/token-price", requireAdmin, async (req, res) => {
    // BurnMintManager (frontend) PATCHes snake_case keys, but the Drizzle
    // schema/storage layer expects camelCase — map them so burns/mints
    // actually update circulating supply & burned totals instead of no-oping.
    const { circulating_supply, burned_total, total_supply, ...rest } = req.body;
    const row = await storage.updateTokenPrice({
      ...rest,
      ...(circulating_supply !== undefined ? { circulatingSupply: circulating_supply } : {}),
      ...(burned_total !== undefined ? { burnedTotal: burned_total } : {}),
      ...(total_supply !== undefined ? { totalSupply: total_supply } : {}),
    });
    res.json(coerceTokenPrice(row));
  });

  // ── Tokens ─────────────────────────────────────────────────────────────────
  app.get("/api/tokens", withCache(20_000), async (req, res) => {
    const network = req.query.network as string | undefined;
    let data = await storage.getActiveTokens();
    if (network && ['mainnet', 'testnet', 'devnet'].includes(network)) {
      data = (data as any[]).filter((t: any) => (t.networkType ?? t.network_type ?? 'devnet') === network);
    }
    res.json(data);
  });

  // Search tokens by name/symbol/address (must come before /:id)
  app.get("/api/tokens/search", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.json([]);
    const all = await storage.getActiveTokens();
    const ql = q.toLowerCase();
    const matches = (all as any[]).filter((t: any) =>
      t.name?.toLowerCase().includes(ql) ||
      t.symbol?.toLowerCase().includes(ql) ||
      t.address?.toLowerCase() === ql
    );
    const limit = Number(req.query.limit ?? 10);
    const result = matches.slice(0, limit);
    res.json(limit === 1 ? (result[0] ?? null) : result);
  });

  app.get("/api/tokens/by-address/:address", async (req, res) => {
    const row = await storage.getTokenByAddress(req.params.address);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });

  app.get("/api/tokens/:id", async (req, res) => {
    const row = await storage.getToken(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });

  app.post("/api/tokens", requireAuth, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertToken({ ...req.body, creatorId: user.id });
    res.json(row);
    storage.awardXpOnce(user.id, 'first_token', 300, 'First token launched on GYDSchain! +300 XP').catch(() => {});
  });

  app.patch("/api/tokens/:id", requireAuth, async (req, res) => {
    const row = await storage.updateToken(req.params.id, req.body);
    res.json(row);
  });

  // Renounce a token authority (mint/freeze/update) — permanent, creator only
  app.post("/api/tokens/:id/renounce", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { authorityType } = req.body;
    const allowed = ["mint", "freeze", "update"];
    if (!allowed.includes(authorityType)) return res.status(400).json({ error: "Invalid authorityType" });
    const token = await storage.getToken(req.params.id);
    if (!token) return res.status(404).json({ error: "Token not found" });
    if ((token as any).creatorId !== user.id && !user._isAdmin) return res.status(403).json({ error: "Not token creator" });
    const updates: Record<string, any> = {};
    updates[`${authorityType}Locked`] = true;
    updates[`${authorityType}Holder`] = null;
    const row = await storage.updateToken(req.params.id, updates);
    await storage.insertAuditLog({ userId: user.id, userEmail: user.email, action: `renounce_${authorityType}`, category: "token", targetType: "token", targetId: req.params.id, details: updates, ipAddress: req.ip ?? null });
    res.json(row);
  });

  // ── Token Launches ─────────────────────────────────────────────────────────
  app.get("/api/launches", async (_req, res) => {
    const data = await storage.getActiveLaunches();
    res.json(data);
  });
  app.get("/api/token-launches", async (_req, res) => {
    const data = await storage.getActiveLaunches();
    res.json(data);
  });

  app.post("/api/launches", requireAuth, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertLaunch({ ...req.body, creatorId: user.id });
    res.json(row);
  });
  app.post("/api/token-launches", requireAuth, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertLaunch({ ...req.body, creatorId: user.id });
    res.json(row);
  });

  // ── User Stablecoins ───────────────────────────────────────────────────────
  app.get("/api/stablecoins", async (_req, res) => {
    try {
      const { rows } = await pgPool.query(`SELECT * FROM user_stablecoins ORDER BY created_at DESC`);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/stablecoins/my", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      const { rows } = await pgPool.query(`SELECT * FROM user_stablecoins WHERE creator_id=$1 ORDER BY created_at DESC`, [user.id]);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/stablecoins/:id", async (req, res) => {
    try {
      const { rows } = await pgPool.query(`SELECT * FROM user_stablecoins WHERE id=$1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/stablecoins", requireAuth, async (req, res) => {
    const user = req.user as any;
    const isAdminOrFounder = user._isAdmin || user._isFounder;
    try {
      const {
        name, symbol, description, logoUrl, pegType, pegValue, basketWeights,
        collateralType, collateralRatio, liquidationThreshold, reserveAssets,
        stabilityFee, mintingFee, burnFee, websiteUrl, twitterUrl,
      } = req.body;

      if (!name || !symbol || !pegType || !collateralType)
        return res.status(400).json({ error: 'Missing required fields' });

      // Reserved symbols
      const RESERVED = ['GYDS','GYD','ETH','BTC','USDC','USDT','DAI','BNB','SOL','MATIC'];
      if (RESERVED.includes(symbol.toUpperCase()))
        return res.status(400).json({ error: `Symbol "${symbol}" is reserved` });

      // Unique symbol check
      const { rows: existing } = await pgPool.query(
        `SELECT id FROM user_stablecoins WHERE UPPER(symbol)=UPPER($1) UNION SELECT id FROM tokens WHERE UPPER(symbol)=UPPER($1)`,
        [symbol]
      );
      if (existing.length) return res.status(409).json({ error: `Symbol "${symbol}" already exists` });

      // Max per user
      const { rows: [maxCfg] } = await pgPool.query(`SELECT config_value FROM admin_config WHERE config_key='stablecoin_max_per_user'`).catch(() => ({ rows: [] as any[] }));
      const maxPerUser = Number(maxCfg?.config_value) || 3;
      if (!isAdminOrFounder) {
        const { rows: myCount } = await pgPool.query(`SELECT COUNT(*) FROM user_stablecoins WHERE creator_id=$1`, [user.id]);
        if (Number(myCount[0].count) >= maxPerUser)
          return res.status(429).json({ error: `Maximum ${maxPerUser} stablecoins per user` });
      }

      // Collateral rule enforcement
      const MODELS: Record<string, { minRatio: number; minLiq: number }> = {
        over_collateralized: { minRatio: 150, minLiq: 110 },
        algorithmic:         { minRatio: 100, minLiq: 100 },
        hybrid:              { minRatio: 120, minLiq: 110 },
        fiat_backed:         { minRatio: 100, minLiq: 100 },
      };
      const model = MODELS[collateralType];
      if (!model) return res.status(400).json({ error: 'Invalid collateral type' });
      if (Number(collateralRatio) < model.minRatio)
        return res.status(400).json({ error: `Collateral ratio must be ≥ ${model.minRatio}% for ${collateralType}` });
      if (Number(liquidationThreshold) < model.minLiq)
        return res.status(400).json({ error: `Liquidation threshold must be ≥ ${model.minLiq}%` });
      if (Number(liquidationThreshold) >= Number(collateralRatio))
        return res.status(400).json({ error: 'Liquidation threshold must be less than collateral ratio' });

      // Fee validation
      if (Number(stabilityFee) < 0 || Number(stabilityFee) > 25)
        return res.status(400).json({ error: 'Stability fee must be 0%–25%' });
      if (Number(mintingFee) < 0 || Number(mintingFee) > 5)
        return res.status(400).json({ error: 'Minting fee must be 0%–5%' });
      if (Number(burnFee) < 0 || Number(burnFee) > 2)
        return res.status(400).json({ error: 'Burn fee must be 0%–2%' });

      // Creation fee (skip for admin/founder)
      const { rows: [feeCfg] } = await pgPool.query(`SELECT config_value FROM admin_config WHERE config_key='stablecoin_creation_fee'`).catch(() => ({ rows: [] as any[] }));
      const creationFee = Number(feeCfg?.config_value) || 10000;

      const { rows: [newSc] } = await pgPool.query(`
        INSERT INTO user_stablecoins
          (creator_id, name, symbol, description, logo_url, peg_type, peg_value, basket_weights,
           collateral_type, collateral_ratio, liquidation_threshold, reserve_assets,
           stability_fee, minting_fee, burn_fee, website_url, twitter_url, creation_fee_paid,
           status, is_approved)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING *`,
        [
          user.id, name.trim(), symbol.toUpperCase(), description || null, logoUrl || null,
          pegType, String(pegValue || '1.00'), JSON.stringify(basketWeights || []),
          collateralType, String(collateralRatio), String(liquidationThreshold),
          JSON.stringify(Array.isArray(reserveAssets) ? reserveAssets : ['GYD','GYDS']),
          String(stabilityFee), String(mintingFee), String(burnFee),
          websiteUrl || null, twitterUrl || null,
          isAdminOrFounder ? '0' : String(creationFee),
          isAdminOrFounder ? 'active' : 'pending_review',
          isAdminOrFounder,
        ]
      );
      res.status(201).json(newSc);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/stablecoins/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const isAdminOrFounder = user._isAdmin || user._isFounder;
    try {
      const { rows: [sc] } = await pgPool.query(`SELECT * FROM user_stablecoins WHERE id=$1`, [req.params.id]);
      if (!sc) return res.status(404).json({ error: 'Not found' });
      if (sc.creator_id !== user.id && !isAdminOrFounder)
        return res.status(403).json({ error: 'Forbidden' });
      const allowed = ['name','description','logo_url','website_url','twitter_url','stability_fee','minting_fee','burn_fee'];
      const sets: string[] = [];
      const vals: any[] = [];
      allowed.forEach(col => {
        const key = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (req.body[key] !== undefined) { vals.push(req.body[key]); sets.push(`${col}=$${vals.length}`); }
      });
      if (isAdminOrFounder && req.body.status) { vals.push(req.body.status); sets.push(`status=$${vals.length}`); }
      if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
      vals.push(req.params.id);
      const { rows: [updated] } = await pgPool.query(`UPDATE user_stablecoins SET updated_at=NOW(),${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
      res.json(updated);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/stablecoins/:id/approve", requireAdmin, async (req, res) => {
    const user = req.user as any;
    try {
      const addr = `0x${require('crypto').randomBytes(20).toString('hex')}`;
      const { rows: [sc] } = await pgPool.query(
        `UPDATE user_stablecoins SET status='active', is_approved=true, approved_by=$1, approved_at=NOW(), address=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
        [user.id, addr, req.params.id]
      );
      if (!sc) return res.status(404).json({ error: 'Not found' });
      res.json(sc);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/stablecoins/:id/pause", requireAdmin, async (req, res) => {
    const { reason } = req.body;
    try {
      const { rows: [sc] } = await pgPool.query(
        `UPDATE user_stablecoins SET status='paused', paused_reason=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
        [reason || null, req.params.id]
      );
      if (!sc) return res.status(404).json({ error: 'Not found' });
      res.json(sc);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/stablecoins/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const isAdminOrFounder = user._isAdmin || user._isFounder;
    try {
      const { rows: [sc] } = await pgPool.query(`SELECT * FROM user_stablecoins WHERE id=$1`, [req.params.id]);
      if (!sc) return res.status(404).json({ error: 'Not found' });
      if (sc.creator_id !== user.id && !isAdminOrFounder) return res.status(403).json({ error: 'Forbidden' });
      if (sc.status === 'active' && !isAdminOrFounder) return res.status(400).json({ error: 'Cannot delete an active stablecoin' });
      await pgPool.query(`DELETE FROM user_stablecoins WHERE id=$1`, [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Liquidity Pools ────────────────────────────────────────────────────────
  app.get("/api/pools", withCache(12_000), async (_req, res) => {
    const data = await storage.getActivePools();
    res.json(data);
  });
  app.get("/api/liquidity-pools", async (_req, res) => {
    const data = await storage.getActivePools();
    res.json(data);
  });

  app.post("/api/pools", requireAuth, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertPool({ ...req.body, creatorId: user.id });
    res.json(row);
  });
  app.post("/api/liquidity-pools", requireAuth, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertPool({ ...req.body, creatorId: user.id });
    res.json(row);
  });

  // ── Token Watchlist ────────────────────────────────────────────────────────
  app.get("/api/watchlist", requireAuth, async (req, res) => {
    const user = req.user as any;
    const data = await storage.getUserWatchlist(user.id);
    res.json(data);
  });

  app.post("/api/watchlist", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { token_id } = req.body;
    const row = await storage.addToWatchlist(user.id, token_id);
    res.json(row);
  });

  app.delete("/api/watchlist/:tokenId", requireAuth, async (req, res) => {
    const user = req.user as any;
    await storage.removeFromWatchlist(user.id, req.params.tokenId);
    res.json({ ok: true });
  });

  // ── Token Price Alerts ─────────────────────────────────────────────────────
  app.get("/api/alerts", requireAuth, async (req, res) => {
    const user = req.user as any;
    const data = await storage.getUserAlerts(user.id);
    res.json(data);
  });

  app.post("/api/alerts", requireAuth, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertAlert({ ...req.body, userId: user.id });
    res.json(row);
  });

  app.delete("/api/alerts/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    await storage.deleteAlert(req.params.id, user.id);
    res.json({ ok: true });
  });

  // ── Network Validators ─────────────────────────────────────────────────────
  app.get("/api/validators", withCache(8_000), async (_req, res) => {
    const data = await storage.getValidators();
    res.json(data);
  });

  app.post("/api/validators", requireAdmin, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertValidator({ ...req.body, createdBy: user.id });
    invalidate("/api/validators");
    res.json(row);
  });

  app.patch("/api/validators/:id", requireAdmin, async (req, res) => {
    const row = await storage.updateValidator(req.params.id, req.body);
    invalidate("/api/validators");
    res.json(row);
  });

  app.delete("/api/validators/:id", requireAdmin, async (req, res) => {
    await storage.deleteValidator(req.params.id);
    invalidate("/api/validators");
    res.json({ ok: true });
  });

  // ── Delegations ────────────────────────────────────────────────────────────
  app.get("/api/delegations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const data = await storage.getUserDelegations(user.id);
    res.json(data);
  });
  app.get("/api/validator-delegations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const data = await storage.getUserDelegations(user.id);
    res.json(data);
  });

  app.post("/api/delegations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertDelegation({ ...req.body, userId: user.id });
    res.json(row);
  });
  app.post("/api/validator-delegations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertDelegation({ ...req.body, userId: user.id });
    res.json(row);
  });

  // ── Firewall / Security ────────────────────────────────────────────────────
  // Serializers: Drizzle returns camelCase → frontend expects snake_case
  const serFwRule = (r: any) => ({
    id: r.id, rule_type: r.ruleType ?? r.rule_type, action: r.action,
    protocol: r.protocol, port: r.port, ip_address: r.ipAddress ?? r.ip_address,
    direction: r.direction, description: r.description,
    is_active: r.isActive ?? r.is_active ?? true,
    created_at: r.createdAt ?? r.created_at,
  });
  const serJail = (r: any) => ({
    id: r.id, jail_name: r.jailName ?? r.jail_name,
    is_enabled: r.isEnabled ?? r.is_enabled ?? true,
    max_retries: r.maxRetries ?? r.max_retries ?? 5,
    ban_time: r.banTime ?? r.ban_time ?? 3600,
    find_time: r.findTime ?? r.find_time ?? 600,
    log_path: r.logPath ?? r.log_path, filter_name: r.filterName ?? r.filter_name,
    action: r.action, description: r.description,
    banned_ips: r.bannedIps ?? r.banned_ips ?? [],
    created_at: r.createdAt ?? r.created_at,
  });
  const serIp = (r: any) => ({
    id: r.id, ip_address: r.ipAddress ?? r.ip_address,
    list_type: r.listType ?? r.list_type, reason: r.reason,
    expires_at: r.expiresAt ?? r.expires_at, created_at: r.createdAt ?? r.created_at,
  });
  const serRateLimit = (r: any) => ({
    id: r.id, name: r.name, endpoint: r.endpoint,
    requests_per_window: r.requestsPerWindow ?? r.requests_per_window ?? 100,
    window_seconds: r.windowSeconds ?? r.window_seconds ?? 60,
    burst_limit: r.burstLimit ?? r.burst_limit ?? 20,
    action: r.action, is_enabled: r.isEnabled ?? r.is_enabled ?? true,
    description: r.description, created_at: r.createdAt ?? r.created_at,
  });
  const serDdos = (r: any) => ({
    id: r.id, name: r.name, protection_type: r.protectionType ?? r.protection_type,
    threshold: r.threshold, action: r.action,
    is_enabled: r.isEnabled ?? r.is_enabled ?? true,
    description: r.description, created_at: r.createdAt ?? r.created_at,
  });
  // Input mappers: frontend snake_case → Drizzle camelCase
  const mapFwRule = (b: any) => ({
    ...(b.rule_type   !== undefined && { ruleType:    b.rule_type }),
    ...(b.action      !== undefined && { action:      b.action }),
    ...(b.protocol    !== undefined && { protocol:    b.protocol }),
    ...(b.port        !== undefined && { port:        b.port }),
    ...(b.ip_address  !== undefined && { ipAddress:   b.ip_address }),
    ...(b.direction   !== undefined && { direction:   b.direction }),
    ...(b.description !== undefined && { description: b.description }),
    ...(b.is_active   !== undefined && { isActive:    b.is_active }),
  });
  const mapJail = (b: any) => ({
    ...(b.jail_name   !== undefined && { jailName:    b.jail_name }),
    ...(b.is_enabled  !== undefined && { isEnabled:   b.is_enabled }),
    ...(b.max_retries !== undefined && { maxRetries:  b.max_retries }),
    ...(b.ban_time    !== undefined && { banTime:     b.ban_time }),
    ...(b.find_time   !== undefined && { findTime:    b.find_time }),
    ...(b.log_path    !== undefined && { logPath:     b.log_path }),
    ...(b.filter_name !== undefined && { filterName:  b.filter_name }),
    ...(b.action      !== undefined && { action:      b.action }),
    ...(b.description !== undefined && { description: b.description }),
  });
  const mapIp = (b: any) => ({
    ...(b.ip_address !== undefined && { ipAddress: b.ip_address }),
    ...(b.list_type  !== undefined && { listType:  b.list_type }),
    ...(b.reason     !== undefined && { reason:    b.reason }),
  });
  const mapRateLimit = (b: any) => ({
    ...(b.name                !== undefined && { name:              b.name }),
    ...(b.endpoint            !== undefined && { endpoint:          b.endpoint }),
    ...(b.requests_per_window !== undefined && { requestsPerWindow: b.requests_per_window }),
    ...(b.window_seconds      !== undefined && { windowSeconds:     b.window_seconds }),
    ...(b.burst_limit         !== undefined && { burstLimit:        b.burst_limit }),
    ...(b.action              !== undefined && { action:            b.action }),
    ...(b.is_enabled          !== undefined && { isEnabled:         b.is_enabled }),
    ...(b.description         !== undefined && { description:       b.description }),
  });
  const mapDdos = (b: any) => ({
    ...(b.name            !== undefined && { name:           b.name }),
    ...(b.protection_type !== undefined && { protectionType: b.protection_type }),
    ...(b.threshold       !== undefined && { threshold:      b.threshold }),
    ...(b.action          !== undefined && { action:         b.action }),
    ...(b.is_enabled      !== undefined && { isEnabled:      b.is_enabled }),
    ...(b.description     !== undefined && { description:    b.description }),
  });

  app.get("/api/firewall/rules", requireAdmin, async (_req, res) => {
    const rows = await storage.getFirewallRules(); res.json(rows.map(serFwRule));
  });
  app.post("/api/firewall/rules", requireAdmin, async (req, res) => {
    const row = await storage.insertFirewallRule(mapFwRule(req.body) as any); res.json(serFwRule(row));
  });
  app.patch("/api/firewall/rules/:id", requireAdmin, async (req, res) => {
    const row = await storage.updateFirewallRule(req.params.id, mapFwRule(req.body)); res.json(serFwRule(row));
  });
  app.delete("/api/firewall/rules/:id", requireAdmin, async (req, res) => {
    await storage.deleteFirewallRule(req.params.id); res.json({ ok: true });
  });

  app.get("/api/firewall/jails", requireAdmin, async (_req, res) => {
    const rows = await storage.getFail2banJails(); res.json(rows.map(serJail));
  });
  app.post("/api/firewall/jails", requireAdmin, async (req, res) => {
    const row = await storage.insertFail2banJail(mapJail(req.body) as any); res.json(serJail(row));
  });
  app.patch("/api/firewall/jails/:id", requireAdmin, async (req, res) => {
    const row = await storage.updateFail2banJail(req.params.id, mapJail(req.body)); res.json(serJail(row));
  });
  app.delete("/api/firewall/jails/:id", requireAdmin, async (req, res) => {
    await storage.deleteFail2banJail(req.params.id); res.json({ ok: true });
  });

  app.get("/api/firewall/ip-list", requireAdmin, async (_req, res) => {
    const rows = await storage.getIpAccessList(); res.json(rows.map(serIp));
  });
  app.post("/api/firewall/ip-list", requireAdmin, async (req, res) => {
    const row = await storage.insertIpAccess(mapIp(req.body) as any); res.json(serIp(row));
  });
  app.delete("/api/firewall/ip-list/:id", requireAdmin, async (req, res) => {
    await storage.deleteIpAccess(req.params.id); res.json({ ok: true });
  });

  app.get("/api/firewall/rate-limits", requireAdmin, async (_req, res) => {
    const rows = await storage.getRateLimitRules(); res.json(rows.map(serRateLimit));
  });
  app.post("/api/firewall/rate-limits", requireAdmin, async (req, res) => {
    const row = await storage.insertRateLimitRule(mapRateLimit(req.body) as any); res.json(serRateLimit(row));
  });
  app.patch("/api/firewall/rate-limits/:id", requireAdmin, async (req, res) => {
    const row = await storage.updateRateLimitRule(req.params.id, mapRateLimit(req.body)); res.json(serRateLimit(row));
  });
  app.delete("/api/firewall/rate-limits/:id", requireAdmin, async (req, res) => {
    await storage.deleteRateLimitRule(req.params.id); res.json({ ok: true });
  });

  app.get("/api/firewall/ddos", requireAdmin, async (_req, res) => {
    const rows = await storage.getDdosProtection(); res.json(rows.map(serDdos));
  });
  app.post("/api/firewall/ddos", requireAdmin, async (req, res) => {
    const row = await storage.insertDdosProtection(mapDdos(req.body) as any); res.json(serDdos(row));
  });
  app.patch("/api/firewall/ddos/:id", requireAdmin, async (req, res) => {
    const row = await storage.updateDdosProtection(req.params.id, mapDdos(req.body)); res.json(serDdos(row));
  });
  app.delete("/api/firewall/ddos/:id", requireAdmin, async (req, res) => {
    await storage.deleteDdosProtection(req.params.id); res.json({ ok: true });
  });

  // ── AI Firewall / Security enforcement routes ──────────────────────────────
  // Status
  app.get("/api/security/status", requireAdmin, (_req, res) => {
    res.json(getFirewallStatus());
  });

  // Blocked IPs list
  app.get("/api/security/blocked-ips", requireAdmin, (_req, res) => {
    res.json({ ips: getBlockedIpList() });
  });

  // Block a single IP
  app.post("/api/security/blocked-ips", requireAdmin, (req, res) => {
    const { ip } = req.body ?? {};
    if (!ip) return res.status(400).json({ error: "ip required" });
    blockIp(String(ip).trim());
    res.json({ ok: true, blocked: getBlockedIpList() });
  });

  // Unblock a specific IP
  app.delete("/api/security/blocked-ips/:ip", requireAdmin, (req, res) => {
    unblockIp(decodeURIComponent(req.params.ip));
    res.json({ ok: true });
  });

  // Clear ALL blocked IPs
  app.delete("/api/security/blocked-ips", requireAdmin, (_req, res) => {
    clearAllBlockedIps();
    res.json({ ok: true, message: "All blocked IPs cleared" });
  });

  // ── Persistent public-IP bans (DB-backed) ─────────────────────────────────
  // Applies to every API request via the ipBanGate middleware.
  app.get("/api/admin/ip-bans", requireAdmin, async (_req, res) => {
    try { res.json({ bans: await listIpBans() }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/ip-bans", requireAdmin, async (req, res) => {
    try {
      const { ip, reason, expiresAt, userId } = req.body ?? {};
      let targetIp = String(ip ?? "").trim();
      // Convenience: ban a user's last-login IP by passing { userId }
      if (!targetIp && userId) {
        const r = await pgPool.query(`SELECT last_login_ip FROM users WHERE id=$1`, [userId]).catch(() => ({ rows: [] as any[] }));
        targetIp = r.rows[0]?.last_login_ip ?? "";
      }
      if (!targetIp) return res.status(400).json({ error: "ip (or userId with recorded last-login IP) required" });
      const actor = req.user as any;
      await addIpBan({
        ip: targetIp,
        reason: reason ?? "manual",
        bannedBy: actor?.id ?? "admin",
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        auto: false,
      });
      await storage.insertAuditLog({
        userId: actor.id, userEmail: actor.email ?? null,
        action: "ban_ip", category: "admin",
        targetType: "ip", targetId: targetIp,
        details: { reason, expiresAt } as any,
        ipAddress: getClientIp(req),
      } as any).catch(() => {});
      res.json({ ok: true, bans: await listIpBans() });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/admin/ip-bans/:ip", requireAdmin, async (req, res) => {
    try {
      const ip = decodeURIComponent(req.params.ip);
      await removeIpBan(ip);
      const actor = req.user as any;
      await storage.insertAuditLog({
        userId: actor.id, userEmail: actor.email ?? null,
        action: "unban_ip", category: "admin",
        targetType: "ip", targetId: ip,
        details: {} as any,
        ipAddress: getClientIp(req),
      } as any).catch(() => {});
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Honeypot redirect URL (used when an IP fails login 3× in 30s) ─────────
  app.get("/api/admin/honeypot-redirect", requireAdmin, async (_req, res) => {
    try { res.json({ url: await getHoneypotRedirectUrl() }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/admin/honeypot-redirect", requireAdmin, async (req, res) => {
    try {
      const url = String(req.body?.url ?? "").trim();
      if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: "url must start with http:// or https://" });
      await storage.setAdminConfig("honeypot_redirect_url", url);
      invalidateHoneypotCache();
      res.json({ ok: true, url: url || null });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Force reload firewall settings from DB
  app.post("/api/security/reload", requireAdmin, async (_req, res) => {
    await refreshSecuritySettings();
    res.json({ ok: true, status: getFirewallStatus() });
  });

  // ── Progressive login-lockout settings (1 min → 24h escalation + redirect URL) ─
  app.get("/api/admin/lockout-settings", requireAdmin, async (_req, res) => {
    try { res.json(await getLockoutSettings()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/lockout-settings", requireAdmin, async (req, res) => {
    try {
      const body = req.body ?? {};
      const enabled = body.enabled !== false;
      let durationsSec: number[] = Array.isArray(body.durationsSec) && body.durationsSec.length > 0
        ? body.durationsSec.map((n: any) => Math.max(1, Math.floor(Number(n) || 0))).filter((n: number) => n > 0)
        : DEFAULT_LOCKOUT_DURATIONS_SEC;
      if (durationsSec.length === 0) durationsSec = DEFAULT_LOCKOUT_DURATIONS_SEC;
      const redirectUrl = typeof body.redirectUrl === "string" && body.redirectUrl.trim() ? body.redirectUrl.trim() : null;
      if (redirectUrl && !/^https?:\/\//i.test(redirectUrl) && !redirectUrl.startsWith("/")) {
        return res.status(400).json({ error: "redirectUrl must start with http://, https://, or /" });
      }
      const value = { enabled, durationsSec, redirectUrl };
      await storage.setAdminConfig("lockout_settings", value);
      invalidateLockoutSettingsCache();
      const actor = req.user as any;
      await storage.insertAuditLog({
        userId: actor.id, userEmail: actor.email ?? null,
        action: "update_lockout_settings", category: "admin",
        targetType: "admin_config", targetId: "lockout_settings",
        details: value as any,
        ipAddress: getClientIp(req),
      } as any).catch(() => {});
      res.json({ ok: true, ...value });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/lockouts", requireAdmin, async (_req, res) => {
    try { res.json(await listActiveLockouts()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/admin/lockouts/:identifier", requireAdmin, async (req, res) => {
    try {
      const identifier = decodeURIComponent(req.params.identifier);
      await clearLockout(identifier);
      const actor = req.user as any;
      await storage.insertAuditLog({
        userId: actor.id, userEmail: actor.email ?? null,
        action: "unlock_login_lockout", category: "admin",
        targetType: "login_lockout", targetId: identifier,
        details: {} as any,
        ipAddress: getClientIp(req),
      } as any).catch(() => {});
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Audit Logs ─────────────────────────────────────────────────────────────
  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    const user = req.user as any;
    const data = user._isAdmin
      ? await storage.getAuditLogs()
      : await storage.getAuditLogs(user.id);
    res.json(data);
  });

  app.post("/api/audit-logs", requireAuth, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertAuditLog({ ...req.body, userId: user.id });
    res.json(row);
  });

  // ── Orders ─────────────────────────────────────────────────────────────────
  app.get("/api/orders", requireAuth, async (req, res) => {
    const user = req.user as any;
    res.json(await storage.getUserOrders(user.id));
  });

  app.post("/api/orders", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { side, orderType, price, stopPrice, amount } = req.body;
    if (!side || !orderType || !amount) return res.status(400).json({ error: "side, orderType and amount required" });
    const row = await storage.insertOrder({ userId: user.id, side, orderType, price: price ?? null, stopPrice: stopPrice ?? null, amount: String(amount) });
    res.json(row);
  });

  app.delete("/api/orders/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const row = await storage.cancelOrder(req.params.id, user.id);
    if (!row) return res.status(404).json({ error: "Order not found" });
    res.json({ ok: true });
  });

  // ── Vault Positions ────────────────────────────────────────────────────────
  app.get("/api/vault-positions", requireAuth, async (req, res) => {
    const user = req.user as any;
    res.json(await storage.getUserVaultPositions(user.id));
  });

  app.post("/api/vault-positions", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { vaultId, vaultName, token, amount, apy, autoCompound, lockDays, lockedUntil } = req.body;
    if (!vaultId || !amount) return res.status(400).json({ error: "vaultId and amount required" });
    const row = await storage.insertVaultPosition({
      userId: user.id, vaultId, vaultName, token, amount: String(amount),
      apy: String(apy), autoCompound: !!autoCompound,
      lockDays: lockDays ?? null,
      lockedUntil: lockedUntil ? new Date(lockedUntil) : null,
    });
    res.json(row);
  });

  app.patch("/api/vault-positions/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { autoCompound } = req.body;
    if (typeof autoCompound !== 'boolean') return res.status(400).json({ error: "autoCompound boolean required" });
    const row = await storage.toggleVaultAutoCompound(req.params.id, user.id, autoCompound);
    if (!row) return res.status(404).json({ error: "Position not found" });
    res.json(row);
  });

  app.delete("/api/vault-positions/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const row = await storage.withdrawVaultPosition(req.params.id, user.id);
    if (!row) return res.status(404).json({ error: "Position not found" });
    res.json({ ok: true });
  });

  // ── Faucet ─────────────────────────────────────────────────────────────────
  // Get recent claims for cooldown UI — return snake_case for frontend compatibility
  app.get("/api/faucet/claims", requireAuth, async (req, res) => {
    const user = req.user as any;
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - COOLDOWN_MS);
    const claims = await storage.getRecentFaucetClaimsForUser(user.id, since);
    // Map camelCase Drizzle fields to snake_case for the frontend
    res.json(claims.map(c => ({ token_type: c.tokenType, created_at: c.createdAt })));
  });

  app.post("/api/faucet/claim", requireAuth, faucetLimiter, async (req, res) => {
    const user = req.user as any;
    const AMOUNTS: Record<string, number> = { gyd: 100, gyds: 0.5, gusd: 100 };
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const { token_type, wallet_address, hcaptcha_token } = req.body;
    const tokenType = String(token_type ?? "").toLowerCase();
    const walletAddress = String(wallet_address ?? "").trim();

    // Verify hCaptcha if secret is configured
    if (process.env.HCAPTCHA_SECRET_KEY) {
      if (!hcaptcha_token) return res.status(400).json({ ok: false, error: "CAPTCHA required" });
      try {
        const verifyRes = await fetch("https://hcaptcha.com/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `response=${encodeURIComponent(hcaptcha_token)}&secret=${encodeURIComponent(process.env.HCAPTCHA_SECRET_KEY)}`,
        });
        const verifyData = await verifyRes.json();
        if (!verifyData.success) return res.status(400).json({ ok: false, error: "CAPTCHA verification failed" });
      } catch {
        return res.status(500).json({ ok: false, error: "CAPTCHA service unavailable" });
      }
    }

    if (!AMOUNTS[tokenType]) return res.status(400).json({ ok: false, error: "Invalid token_type (gyd|gyds|gusd)" });
    if (!walletAddress) return res.status(400).json({ ok: false, error: "wallet_address required" });

    const since = new Date(Date.now() - COOLDOWN_MS);
    const recent = await storage.getRecentFaucetClaim(user.id, tokenType, since);
    if (recent) {
      const next = new Date(new Date(recent.createdAt!).getTime() + COOLDOWN_MS).toISOString();
      return res.status(429).json({ ok: false, error: "Cooldown active", next_claim_at: next });
    }

    const amount = AMOUNTS[tokenType];
    const txHash = `0xfaucet-${tokenType}-${Date.now().toString(16)}-${crypto.randomUUID().slice(0, 8)}`;
    await storage.insertFaucetClaim({ userId: user.id, walletAddress, tokenType, amount: String(amount), txHash, ipAddress: req.ip ?? null });
    await storage.insertTokenOperation({ operationType: tokenType === "gyd" ? "mint_gyd" : tokenType === "gusd" ? "mint_gusd" : "mint_gyds", amount: String(amount), walletAddress, txHash, status: "confirmed", createdBy: user.id });
    // Also insert a transaction record so the balance shows regardless of which address was claimed to
    await storage.insertTransaction({
      from_address: '0x000000000000000000000000000000000000fac3',
      to_address: walletAddress,
      amount: String(amount),
      fee: '0',
      tx_hash: txHash + '-tx',
      status: 'confirmed',
      wallet_id: null,
      user_id: user.id,
      token_symbol: tokenType.toUpperCase(),
      confirmed_at: new Date().toISOString(),
    });
    await storage.insertAuditLog({ userId: user.id, userEmail: user.email, action: "faucet_claim", category: "token", targetType: "token", targetId: tokenType, details: { amount, wallet_address: walletAddress, tx_hash: txHash }, ipAddress: req.ip ?? null });

    // Credit on-chain balance trie so all running local nodes reflect the claim
    const tokenKey = tokenType === "gyd" ? "GYD" : tokenType === "gusd" ? "GUSD" : "GYDS";
    const amountWei = BigInt(Math.round(amount * 1e18));
    for (const net of ["mainnet", "testnet", "devnet"] as const) {
      creditAddress(net, walletAddress, tokenKey as "GYDS" | "GYD" | "GUSD", amountWei);
    }

    res.json({ ok: true, tx_hash: txHash, amount, token_type: tokenType });
    broadcastActivity({ type: 'faucet', title: 'Faucet Claim', detail: `${amount} ${tokenType.toUpperCase()} → ${walletAddress.slice(0, 10)}…`, user: user.username ?? user.walletAddress?.slice(0, 10), ip: req.ip ?? undefined });

    // Server-side notification: faucet drip
    const notifMsg = `${amount} ${tokenType.toUpperCase()} sent to ${walletAddress.slice(0, 10)}…`;
    (storage as any).createNotification(user.id.toString(), 'tx', '💧 Faucet Drip Sent', notifMsg, '/wallet').catch(() => {});

    // Telegram + WhatsApp alerts
    storage.getUserProfile(user.id).then((profile: any) => {
      const chatId = profile?.telegram_chat_id;
      if (chatId) sendTelegramAlert(chatId, "faucet", { amount, token: tokenType, wallet: walletAddress, txHash }).catch(() => {});
      const waNum = profile?.metadata?.whatsapp_number;
      if (waNum) sendWhatsAppAlert(waNum, "faucet", { amount, token: tokenType, wallet: walletAddress, txHash }).catch(() => {});
    }).catch(() => {});
  });

  // ── Network Stats ──────────────────────────────────────────────────────────
  app.get("/api/network-stats", withCache(5_000), async (_req, res) => {
    const stats = await storage.getNetworkStats();
    res.json({ ok: true, timestamp: new Date().toISOString(), chainId: 13370, stats: { ...stats, posFinality: 99.99 } });
  });

  // ── Node Visibility (public GET, admin PUT) ────────────────────────────────
  app.get("/api/node-visibility", async (_req, res) => {
    const row = await storage.getConfig("node_visibility");
    const defaults = { litenode: true, rpcnode: false, boostnode: false, fullnode: false, genesis: false, bootnode: false };
    if (!row) return res.json(defaults);
    try {
      res.json({ ...defaults, ...(typeof row.configValue === "string" ? JSON.parse(row.configValue) : row.configValue) });
    } catch {
      res.json(defaults);
    }
  });

  app.put("/api/node-visibility", requireAdmin, async (req, res) => {
    const user = req.user as any;
    const allowed = ["litenode", "rpcnode", "boostnode", "fullnode", "genesis", "bootnode"];
    const updates: Record<string, boolean> = {};
    for (const k of allowed) {
      if (typeof req.body[k] === "boolean") updates[k] = req.body[k];
    }
    const row = await storage.upsertConfig("node_visibility", JSON.stringify(updates), user.id);
    await storage.insertAuditLog({ userId: user.id, userEmail: user.email, action: "update_node_visibility", category: "admin", targetType: "config", targetId: "node_visibility", details: updates, ipAddress: req.ip ?? null });
    res.json(row);
  });

  // ── Admin: All Users ───────────────────────────────────────────────────────
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    const users = await storage.getAllUsersWithRoles();
    res.json(users);
  });

  app.get("/api/admin/users-whatsapp", requireAdmin, async (_req, res) => {
    const rows = await storage.getUsersWithWhatsApp();
    res.json({ users: rows });
  });

  app.patch("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    const actor = req.user as any;
    const { role } = req.body;
    if (!["user", "admin", "founder"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (!actor._isFounder && role === "founder") return res.status(403).json({ error: "Only founders can grant founder role" });
    await storage.setUserRole(req.params.id, role);
    await storage.insertAuditLog({ userId: actor.id, userEmail: actor.email, action: "set_user_role", category: "admin", targetType: "user", targetId: req.params.id, details: { role }, ipAddress: req.ip ?? null });
    res.json({ ok: true });
  });

  app.patch("/api/admin/users/:id/ban", requireAdmin, async (req, res) => {
    const actor = req.user as any;
    const { banned } = req.body;
    await storage.setBanStatus(req.params.id, !!banned);
    await storage.insertAuditLog({ userId: actor.id, userEmail: actor.email, action: banned ? "ban_user" : "unban_user", category: "admin", targetType: "user", targetId: req.params.id, details: { banned }, ipAddress: req.ip ?? null });
    res.json({ ok: true });
  });

  // ── Git sync (admin — trigger a git pull on the deployed server) ────────────
  app.post("/api/admin/git-pull", requireAdmin, async (req, res) => {
    const user = req.user as any;
    const { spawn } = await import("child_process");
    const cwd = process.cwd();
    const proc = spawn("git", ["pull", "--ff-only"], { cwd });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", async (code: number) => {
      await storage.insertAuditLog({ userId: user.id, userEmail: user.email, action: "git_pull", category: "admin", targetType: "system", targetId: "dashboard", details: { exit_code: code, stdout: stdout.slice(0, 500), stderr: stderr.slice(0, 500) }, ipAddress: req.ip ?? null });
      res.json({ ok: code === 0, exit_code: code, stdout, stderr });
    });
  });

  // ── Governance ─────────────────────────────────────────────────────────────
  app.get("/api/governance/proposals", async (_req, res) => {
    res.json(await storage.getGovernanceProposals());
  });

  app.post("/api/governance/proposals", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { title, description, proposalType, endDate } = req.body;
    if (!title || !description) return res.status(400).json({ error: "title and description required" });
    const row = await storage.insertGovernanceProposal({
      title, description,
      proposalType: proposalType ?? "parameter",
      createdBy: user.id,
      endDate: endDate ? new Date(endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    // Notify all users about new governance proposal
    storage.getAllUsersBasic?.().then((users: any[]) => {
      (users || []).forEach((u: any) => {
        const uid = u.id?.toString() ?? u.user_id;
        if (uid && uid !== user.id.toString()) {
          (storage as any).createNotification(uid, 'governance', `📜 New Proposal: ${title.slice(0, 50)}`, `A new ${proposalType ?? 'parameter'} proposal has been submitted. Your vote matters!`, '/governance').catch(() => {});
        }
      });
    }).catch(() => {});
    res.json(row);
  });

  app.get("/api/governance/my-votes", requireAuth, async (req, res) => {
    const user = req.user as any;
    const votes = await storage.getUserGovernanceVotes(user.id);
    res.json(votes.map(v => ({ proposalId: v.proposalId, choice: v.choice })));
  });

  app.post("/api/governance/proposals/:id/vote", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { id } = req.params;
    const { choice } = req.body;
    if (!['for', 'against', 'abstain'].includes(choice)) return res.status(400).json({ error: "choice must be for|against|abstain" });
    const existing = await storage.getProposalVote(id, user.id);
    if (existing) return res.status(409).json({ error: "Already voted on this proposal" });
    await storage.insertGovernanceVote({ proposalId: id, userId: user.id, choice });
    await storage.incrementProposalVotes(id, choice as 'for' | 'against' | 'abstain');
    res.json({ ok: true });
    storage.awardXp(user.id, 'governance_vote', 25, `Voted ${choice} on proposal #${id} +25 XP`).catch(() => {});
    broadcastActivity({ type: 'governance_vote', title: 'Governance Vote', detail: `Voted ${choice} on proposal #${id}`, user: user.username ?? user.walletAddress?.slice(0, 10) });
    (storage as any).createNotification(user.id.toString(), 'governance', '✅ Vote Recorded', `Your ${choice} vote on proposal #${id} was recorded. +25 XP`, '/governance').catch(() => {});
    // Telegram + WhatsApp alerts on governance vote
    storage.getUserProfile(user.id).then((profile: any) => {
      const chatId = profile?.telegram_chat_id;
      if (chatId) sendTelegramAlert(chatId, 'governance', {
        title: `Proposal #${id}`,
        body: `You voted <b>${choice}</b> on proposal #${id}. +25 XP awarded.`,
      }).catch(() => {});
      const waNum = profile?.metadata?.whatsapp_number;
      if (waNum) sendWhatsAppAlert(waNum, 'governance', {
        title: `Proposal #${id}`,
        body: `You voted ${choice} on proposal #${id}. +25 XP awarded.`,
      }).catch(() => {});
    }).catch(() => {});
  });

  // ── Community ──────────────────────────────────────────────────────────────
  app.get("/api/community/posts", async (_req, res) => {
    res.json(await storage.getCommunityPosts());
  });

  app.post("/api/community/posts", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { title, body, postType } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });
    const row = await storage.insertCommunityPost({ userId: user.id, title, body: body ?? '', postType: postType ?? 'discussion' });
    res.json(row);
  });

  app.get("/api/community/posts/:id/comments", async (req, res) => {
    res.json(await storage.getCommunityComments(req.params.id));
  });

  app.post("/api/community/posts/:id/comments", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { body } = req.body;
    if (!body) return res.status(400).json({ error: "body required" });
    const row = await storage.insertCommunityComment({ postId: req.params.id, userId: user.id, body });
    res.json({ ...row, authorEmail: user.email });
  });

  app.post("/api/community/votes", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { targetId, targetType, direction } = req.body;
    if (!targetId || !targetType || !['up', 'down'].includes(direction)) {
      return res.status(400).json({ error: "targetId, targetType and direction (up|down) required" });
    }
    const existing = await storage.getCommunityVote(user.id, targetId, targetType);
    if (existing) return res.status(409).json({ error: "Already voted" });
    const row = await storage.insertCommunityVote({ userId: user.id, targetId, targetType, direction });
    res.json({ ok: true });
  });

  // ── Analytics ──────────────────────────────────────────────────────────────
  app.get("/api/analytics/overview", async (_req, res) => {
    const [tokenPriceRow, validatorCount, nodeCount, txCount, tokenCount] = await Promise.all([
      storage.getTokenPrice(),
      storage.countActiveValidators(),
      storage.countOnlineNodes(),
      storage.countTransactions(),
      storage.countTokens(),
    ]);
    res.json({
      price:              tokenPriceRow?.price              ?? "0.0000001",
      totalSupply:        tokenPriceRow?.totalSupply        ?? "100000000000",
      circulatingSupply:  tokenPriceRow?.circulatingSupply  ?? "0",
      burnedTotal:        tokenPriceRow?.burnedTotal        ?? "0",
      activeValidators:   validatorCount,
      onlineNodes:        nodeCount,
      totalTransactions:  txCount,
      launchedTokens:     tokenCount,
    });
  });

  // ── Test Nodes — multi-network (admin/founder only) ────────────────────────
  const VALID_NODE_TYPES  = ["rpc", "lite", "fullnode", "boostnode", "validator", "genesis", "bootnode"] as const;
  const VALID_NETWORKS    = ["mainnet", "testnet", "devnet"] as const;
  type ValidNodeType      = typeof VALID_NODE_TYPES[number];
  type ValidNetwork       = typeof VALID_NETWORKS[number];

  const TEST_NODE_TYPE_MAP: Record<string, string> = {
    rpc: "rpcnode", lite: "litenode", fullnode: "fullnode", boostnode: "boostnode",
    validator: "validator", genesis: "genesis", bootnode: "bootnode",
  };

  // Track DB row IDs keyed by "network:type"
  const testNodeDbIds = new Map<string, string>();

  // Background heartbeat — runs every 30 s regardless of who's looking at the admin panel.
  // Ensures getLiveNodes() always counts auto-restarted test nodes.
  const TEST_NODE_TYPE_MAP_HB: Record<string, string> = {
    rpc: "rpcnode", lite: "litenode", fullnode: "fullnode",
    boostnode: "boostnode", validator: "validatornode", genesis: "genesis", bootnode: "bootnode",
  };
  async function refreshTestNodeHeartbeats() {
    const running = testNodeManager.getRunningNodes();
    for (const { network, type } of running) {
      const key = `${network}:${type}`;
      let id = testNodeDbIds.get(key);
      if (!id) {
        // Not cached yet — look it up by wireguard_public_key pattern (same as upsertTestNodeInstallation)
        try {
          const nodeType = TEST_NODE_TYPE_MAP_HB[type] ?? type;
          const rows = await pgPool.query(
            `SELECT id FROM node_installations WHERE node_type=$1 AND wireguard_public_key LIKE $2 LIMIT 1`,
            [nodeType, `LOCAL:%:${network}`]
          );
          if (rows.rows.length > 0) {
            id = rows.rows[0].id as string;
            testNodeDbIds.set(key, id);
          }
        } catch {}
      }
      if (id) {
        storage.updateNode(id, { lastHeartbeat: new Date(), isOnline: true }).catch(() => {});
      }
    }
  }
  // Run once shortly after startup so auto-restarted nodes are immediately counted
  setTimeout(refreshTestNodeHeartbeats, 5_000);
  setInterval(refreshTestNodeHeartbeats, 30_000);

  async function upsertTestNodeInstallation(
    userId: string, network: string, type: string,
    statObj: { peers?: number; blockHeight?: number; port?: number }
  ) {
    const nodeType = TEST_NODE_TYPE_MAP[type] ?? type;
    const localKey = `LOCAL:${statObj.port ?? 0}:${network}`;
    const base = {
      isOnline: true, isApproved: true, lastHeartbeat: new Date(),
      peerCount: statObj.peers ?? 0, lastBlockHeight: statObj.blockHeight ?? 0,
      syncProgress: 100, isSynced: true, wireguardPublicKey: localKey,
    };
    const key = `${network}:${type}`;
    const existing = testNodeDbIds.get(key);
    if (existing) {
      await storage.updateNode(existing, base);
    } else {
      const rows = await pgPool.query(
        `SELECT id FROM node_installations WHERE user_id=$1 AND node_type=$2 AND wireguard_public_key LIKE $3 LIMIT 1`,
        [userId, nodeType, `LOCAL:%:${network}`]
      );
      if (rows.rows.length > 0) {
        const id = rows.rows[0].id;
        testNodeDbIds.set(key, id);
        await storage.updateNode(id, base);
      } else {
        const node = await storage.insertNode({
          userId, nodeType, approvedBy: userId, approvedAt: new Date(), ...base,
        });
        testNodeDbIds.set(key, node.id);
      }
    }
  }

  // GET status — returns all 3 networks × 5 types
  app.get("/api/admin/test-nodes/status", requireAdmin, async (req, res) => {
    const statuses = testNodeManager.status() as any;
    const userId = (req.user as any)?.id;
    if (userId) {
      for (const [key, id] of testNodeDbIds.entries()) {
        const [network, type] = key.split(":");
        const s = statuses[network]?.[type];
        if (s?.running) {
          storage.updateNode(id, {
            lastHeartbeat: new Date(), isOnline: true,
            peerCount: s.peers ?? 0, lastBlockHeight: s.blockHeight ?? 0,
          }).catch(() => {});
        }
      }
    }
    res.json(statuses);
  });

  // GET genesis enode — /api/admin/genesis-enode/:network
  app.get("/api/admin/genesis-enode/:network", requireAdmin, (req, res) => {
    const network = req.params.network as "mainnet" | "testnet" | "devnet";
    if (!["mainnet", "testnet", "devnet"].includes(network)) {
      res.status(400).json({ ok: false, error: "Invalid network. Use mainnet, testnet, or devnet." });
      return;
    }
    const statuses = testNodeManager.status() as any;
    const running = statuses[network]?.genesis?.running === true;
    const enode = getGenesisEnode(network);
    res.json({ ok: true, enode, running, network, port: NETWORK_CFGS[network].ports.genesis });
  });

  // POST start — /api/admin/test-nodes/:network/:type/start
  app.post("/api/admin/test-nodes/:network/:type/start", requireAdmin, async (req, res) => {
    const network = req.params.network as ValidNetwork;
    const type    = req.params.type    as ValidNodeType;
    if (!VALID_NETWORKS.includes(network))   { res.status(400).json({ ok: false, message: "Invalid network" }); return; }
    if (!VALID_NODE_TYPES.includes(type))    { res.status(400).json({ ok: false, message: "Invalid node type" }); return; }
    const result = await testNodeManager.start(network, type);
    if (result.ok) {
      // Persist "should run" so this node survives server restarts
      saveTestNodeState(network, type, true).catch(() => {});
      const userId = (req.user as any)?.id;
      if (userId) {
        const s = (testNodeManager.status() as any)[network]?.[type] ?? {};
        upsertTestNodeInstallation(userId, network, type, { peers: s.peers, blockHeight: s.blockHeight, port: s.port })
          .catch((e) => console.error(`[test-node] upsert ${network}/${type} failed:`, e.message));
      }
    }
    res.json(result);
  });

  // POST stop — /api/admin/test-nodes/:network/:type/stop
  app.post("/api/admin/test-nodes/:network/:type/stop", requireAdmin, async (req, res) => {
    const network = req.params.network as ValidNetwork;
    const type    = req.params.type    as ValidNodeType;
    if (!VALID_NETWORKS.includes(network))   { res.status(400).json({ ok: false, message: "Invalid network" }); return; }
    if (!VALID_NODE_TYPES.includes(type))    { res.status(400).json({ ok: false, message: "Invalid node type" }); return; }
    const result = testNodeManager.stop(network, type);
    if (result.ok) {
      // Persist "should NOT run" so it stays stopped across restarts
      saveTestNodeState(network, type, false).catch(() => {});
      const id = testNodeDbIds.get(`${network}:${type}`);
      if (id) storage.updateNode(id, { isOnline: false, lastHeartbeat: new Date() }).catch(() => {});
    }
    res.json(result);
  });

  // POST console — /api/admin/test-nodes/:network/:type/console
  // Accepts Geth JS notation or raw JSON-RPC method names and proxies to the node
  app.post("/api/admin/test-nodes/:network/:type/console", requireAdmin, async (req, res) => {
    const network = req.params.network as ValidNetwork;
    const type    = req.params.type    as ValidNodeType;
    if (!VALID_NETWORKS.includes(network))  return res.status(400).json({ ok: false, error: "Invalid network" });
    if (!VALID_NODE_TYPES.includes(type))   return res.status(400).json({ ok: false, error: "Invalid node type" });

    const rawCmd = (req.body?.command ?? "").trim();
    if (!rawCmd) return res.status(400).json({ ok: false, error: "Empty command" });

    // Special commands
    if (rawCmd === "help") {
      return res.json({ ok: true, result: [
        "── Geth console shortcuts ─────────────────────────────",
        "  eth.blockNumber           → current block height",
        "  eth.chainId               → chain ID hex",
        "  eth.gasPrice              → current gas price",
        "  eth.getBalance('0x...')   → balance in wei",
        "  eth.getBlockByNumber('latest', true)",
        "  eth.syncing               → sync status",
        "  net.peerCount             → connected peers",
        "  net.version               → network/chain ID",
        "  net.listening             → true/false",
        "  txpool.status             → pending/queued counts",
        "  txpool.content            → full mempool",
        "  admin.peers               → connected peer list",
        "  admin.nodeInfo            → node info",
        "  web3.version              → client version",
        "  mining.getWork            → current mining job",
        "  mining.submitHashrate('0x...', '0x...')",
        "── Direct RPC (also accepted) ─────────────────────────",
        "  eth_blockNumber, net_peerCount, eth_chainId …",
        "────────────────────────────────────────────────────────",
        "Type 'help' to show this message again.",
      ].join("\n"), formatted: "help" });
    }

    // ── Parse Geth JS notation → { method, params } ──────────────────────────
    type ParsedRpc = { method: string; params: unknown[] };

    function parseGethCommand(cmd: string): ParsedRpc {
      // Already underscore-style (direct JSON-RPC): eth_blockNumber
      if (/^[a-z]+_[a-zA-Z]+$/.test(cmd)) return { method: cmd, params: [] };

      // Try to parse dotted JS notation: eth.getBalance("0x...", "latest")
      const dotMatch = cmd.match(/^([a-z]+)\.([a-zA-Z]+)\s*(?:\((.*)\))?$/s);
      if (!dotMatch) return { method: cmd, params: [] };

      const [, ns, fn, argsStr = ""] = dotMatch;

      // Map known namespace+function aliases
      const aliases: Record<string, string> = {
        "web3.version":              "web3_clientVersion",
        "web3.clientVersion":        "web3_clientVersion",
        "mining.getWork":            "eth_getWork",
        "mining.submitHashrate":     "eth_submitHashrate",
        "mining.submitWork":         "eth_submitWork",
        "admin.nodeInfo":            "web3_clientVersion",
      };
      const aliasKey = `${ns}.${fn}`;
      const method = aliases[aliasKey] ?? `${ns}_${fn}`;

      // Parse simple args: strings, hex, numbers, booleans
      const params: unknown[] = [];
      if (argsStr.trim()) {
        // Split by commas not inside quotes
        const parts = argsStr.split(/,(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/).map(s => s.trim());
        for (const p of parts) {
          if (p === "true")  { params.push(true); continue; }
          if (p === "false") { params.push(false); continue; }
          if (p === "null" || p === "undefined") { params.push(null); continue; }
          if (/^["'](.*)["']$/.test(p)) { params.push(p.replace(/^["']|["']$/g, "")); continue; }
          if (/^0x[0-9a-fA-F]+$/.test(p)) { params.push(p); continue; }
          if (/^-?\d+(\.\d+)?$/.test(p)) { params.push(Number(p)); continue; }
          params.push(p.replace(/^["']|["']$/g, ""));
        }
      }

      // Special default second params
      if (method === "eth_getBalance" && params.length === 1) params.push("latest");
      if (method === "eth_getTransactionCount" && params.length === 1) params.push("latest");
      if (method === "eth_getBlockByNumber" && params.length === 1) params.push(false);
      if (method === "eth_getBlockByHash" && params.length === 1) params.push(false);

      return { method, params };
    }

    const { method, params } = parseGethCommand(rawCmd);

    // ── Forward to the live node port ────────────────────────────────────────
    const statuses = testNodeManager.status() as any;
    const nodeStatus = statuses[network]?.[type];

    if (!nodeStatus?.running) {
      return res.json({ ok: false, error: `${network}/${type} node is not running. Start it first.` });
    }

    const port = nodeStatus.port;
    try {
      const upstream = await fetch(`http://localhost:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.json() as any;

      if (data.error) {
        return res.json({ ok: false, error: `RPC error ${data.error.code}: ${data.error.message}` });
      }

      // Format the result nicely
      const raw = data.result;
      let formatted: string;
      if (raw === null || raw === undefined) {
        formatted = "null";
      } else if (typeof raw === "string" && raw.startsWith("0x") && raw.length === 18) {
        // Likely a wei value — show in GYDS too
        try {
          const wei = BigInt(raw);
          const gyds = Number(wei) / 1e18;
          formatted = `${raw} (${gyds.toFixed(6)} GYDS)`;
        } catch { formatted = raw; }
      } else if (typeof raw === "object") {
        formatted = JSON.stringify(raw, null, 2);
      } else if (typeof raw === "string" && raw.startsWith("0x") && /^0x[0-9a-f]+$/i.test(raw)) {
        // Hex number — show decimal too
        try {
          const dec = parseInt(raw, 16);
          formatted = `${raw} (${dec.toLocaleString()})`;
        } catch { formatted = raw; }
      } else {
        formatted = String(raw);
      }

      return res.json({ ok: true, result: formatted, raw, method, params });
    } catch (err: any) {
      return res.json({ ok: false, error: `Request failed: ${err.message}` });
    }
  });

  // GET logs — /api/admin/test-nodes/:network/:type/logs
  app.get("/api/admin/test-nodes/:network/:type/logs", requireAdmin, (req, res) => {
    const network = req.params.network as ValidNetwork;
    const type    = req.params.type    as ValidNodeType;
    if (!VALID_NETWORKS.includes(network))   { res.status(400).json({ ok: false, message: "Invalid network" }); return; }
    if (!VALID_NODE_TYPES.includes(type))    { res.status(400).json({ ok: false, message: "Invalid node type" }); return; }
    res.json(testNodeManager.getLogs(network, type));
  });

  // ── Node log file routes ───────────────────────────────────────────────────
  // GET /api/admin/test-nodes/logfile — returns last N lines from the combined log file
  app.get("/api/admin/test-nodes/logfile", requireAdmin, (_req, res) => {
    const { fs: fsModule } = (() => { try { return { fs: require("fs") }; } catch { return { fs: null }; } })();
    const fsMod = require("fs") as typeof import("fs");
    const filePath = getNodeLogFilePath();
    try {
      if (!fsMod.existsSync(filePath)) {
        res.json({ ok: true, lines: [], size: 0, path: filePath });
        return;
      }
      const raw = fsMod.readFileSync(filePath, "utf8");
      const lines = raw.split("\n").filter(Boolean);
      const tail = lines.slice(-2000);
      const stat = fsMod.statSync(filePath);
      res.json({ ok: true, lines: tail, total: lines.length, size: stat.size, path: filePath });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/admin/test-nodes/logfile/download — streams the raw log file as a download
  app.get("/api/admin/test-nodes/logfile/download", requireAdmin, (_req, res) => {
    const fsMod = require("fs") as typeof import("fs");
    const filePath = getNodeLogFilePath();
    try {
      if (!fsMod.existsSync(filePath)) {
        res.status(404).json({ ok: false, error: "Log file not found — start a node first." });
        return;
      }
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"test-nodes.log\"");
      fsMod.createReadStream(filePath).pipe(res);
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // DELETE /api/admin/test-nodes/logfile — clears the log file
  app.delete("/api/admin/test-nodes/logfile", requireAdmin, (_req, res) => {
    try {
      clearNodeLogFile();
      res.json({ ok: true, message: "Log file cleared" });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── Bootup toggle — GET all states, PATCH one ─────────────────────────────
  app.get("/api/admin/test-nodes/bootup", requireAdmin, async (_req, res) => {
    try {
      const { pool: pgPool } = await import("./db");
      const rows = await pgPool.query(`SELECT id, should_run FROM test_node_state`).catch(() => ({ rows: [] }));
      const result: Record<string, boolean> = {};
      for (const row of rows.rows) result[row.id] = Boolean(row.should_run);
      res.json(result);
    } catch { res.json({}); }
  });

  // POST start-all — starts all 7 node types for a given network (or all 3 networks)
  app.post("/api/admin/test-nodes/:network/start-all", requireAdmin, async (req, res) => {
    const network = req.params.network as ValidNetwork | "all";
    const networks: ValidNetwork[] = network === "all" ? ["mainnet", "testnet", "devnet"] : [network as ValidNetwork];
    if (!["mainnet", "testnet", "devnet", "all"].includes(network)) {
      return res.status(400).json({ ok: false, message: "Invalid network" });
    }
    const results: any[] = [];
    const userId = (req.user as any)?.id;
    for (const net of networks) {
      for (const type of VALID_NODE_TYPES) {
        const result = await testNodeManager.start(net, type);
        saveTestNodeState(net, type, result.ok).catch(() => {});
        if (result.ok && userId) {
          const s = (testNodeManager.status() as any)[net]?.[type] ?? {};
          upsertTestNodeInstallation(userId, net, type, { peers: s.peers, blockHeight: s.blockHeight, port: s.port })
            .catch((e: any) => console.error(`[test-node] upsert ${net}/${type} failed:`, e.message));
        }
        results.push({ network: net, type, ...result });
      }
    }
    res.json({ ok: true, results });
  });

  // POST stop-all — stops all 7 node types for a given network (or all 3 networks)
  app.post("/api/admin/test-nodes/:network/stop-all", requireAdmin, async (req, res) => {
    const network = req.params.network as ValidNetwork | "all";
    const networks: ValidNetwork[] = network === "all" ? ["mainnet", "testnet", "devnet"] : [network as ValidNetwork];
    if (!["mainnet", "testnet", "devnet", "all"].includes(network)) {
      return res.status(400).json({ ok: false, message: "Invalid network" });
    }
    const results: any[] = [];
    for (const net of networks) {
      for (const type of VALID_NODE_TYPES) {
        const result = testNodeManager.stop(net, type);
        saveTestNodeState(net, type, false).catch(() => {});
        const id = testNodeDbIds.get(`${net}:${type}`);
        if (id) storage.updateNode(id, { isOnline: false, lastHeartbeat: new Date() }).catch(() => {});
        results.push({ network: net, type, ...result });
      }
    }
    res.json({ ok: true, results });
  });

  // GET sync-check — compares each running node's block height to the real GYDSchain
  app.get("/api/admin/test-nodes/sync-check", requireAdmin, async (_req, res) => {
    let chainBlockHex: string | null = null;
    let chainBlock = 0;
    try {
      const rpcEndpoints = [
        process.env.GYDS_RPC_URL,
        'https://rpc.netlifegy.com',
        'https://rpc2.netlifegy.com',
        'https://rpc3.netlifegy.com',
      ].filter(Boolean);
      for (const url of rpcEndpoints) {
        try {
          const r = await fetch(url!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
            signal: AbortSignal.timeout(4000),
          });
          const j: any = await r.json();
          if (j?.result) { chainBlockHex = j.result; chainBlock = parseInt(j.result, 16); break; }
        } catch {}
      }
    } catch {}

    const statuses = testNodeManager.status() as any;
    const syncResults: any[] = [];
    for (const net of ["mainnet", "testnet", "devnet"] as ValidNetwork[]) {
      for (const type of VALID_NODE_TYPES) {
        const s = statuses[net]?.[type];
        if (!s?.running) continue;
        const lag = chainBlock > 0 ? Math.max(0, chainBlock - s.blockHeight) : null;
        const synced = lag !== null ? lag <= 5 : null;
        syncResults.push({
          network: net, type,
          localBlock: s.blockHeight,
          chainBlock: chainBlock || null,
          lag,
          synced,
          peers: s.peers,
          port: s.port,
        });
      }
    }
    res.json({ chainBlock: chainBlock || null, chainBlockHex, nodes: syncResults });
  });

  // POST admin — manually credit a wallet in the balance trie (testing / airdrops)
  app.post("/api/admin/chain/credit", requireAdmin, async (req, res) => {
    const { address, token = "GYDS", amount, network = "all" } = req.body ?? {};
    if (!address || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ ok: false, error: "address and positive amount required" });
    }
    const tokenKey = String(token).toUpperCase() as "GYDS" | "GYD" | "GUSD";
    if (!["GYDS","GYD","GUSD"].includes(tokenKey)) {
      return res.status(400).json({ ok: false, error: "token must be GYDS, GYD or GUSD" });
    }
    const amountWei = BigInt(Math.round(Number(amount) * 1e18));
    const nets = network === "all"
      ? (["mainnet","testnet","devnet"] as const)
      : [network as "mainnet"|"testnet"|"devnet"];
    for (const net of nets) creditAddress(net, String(address), tokenKey, amountWei);
    const balances: Record<string, number> = {};
    for (const net of nets) balances[net] = Number(getNetworkBalance(net, String(address), tokenKey)) / 1e18;
    res.json({ ok: true, address, token: tokenKey, amount: Number(amount), credited_to: nets, new_balances: balances });
  });

  // POST admin — re-seed the balance trie from DB without restarting the server
  app.post("/api/admin/chain/reseed", requireAdmin, async (req, res) => {
    try {
      await seedBalanceTrie();
      res.json({ ok: true, message: "Balance trie re-seeded from faucet_claims + transactions" });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET on-chain balance for an address from the in-memory balance trie
  app.get("/api/chain/balance/:address", requireAuth, async (req, res) => {
    const address = String(req.params.address ?? "").trim();
    const network = (["mainnet", "testnet", "devnet"].includes(req.query.network as string)
      ? req.query.network : "mainnet") as "mainnet" | "testnet" | "devnet";
    if (!address) return res.status(400).json({ ok: false, error: "address required" });
    const toEth = (wei: bigint) => Number(wei) / 1e18;
    res.json({
      ok: true,
      address,
      network,
      gyds: toEth(getNetworkBalance(network, address, "GYDS")),
      gyd:  toEth(getNetworkBalance(network, address, "GYD")),
      gusd: toEth(getNetworkBalance(network, address, "GUSD")),
      source: "onchain",
    });
  });

  // POST sequential node wizard — starts genesis→bootnode→rpc→fullnode→validator→lite→boostnode one at a time
  app.post("/api/admin/test-nodes/:network/start-sequential", requireAdmin, async (req, res) => {
    const network = req.params.network as "mainnet" | "testnet" | "devnet";
    if (!["mainnet", "testnet", "devnet"].includes(network)) {
      return res.status(400).json({ ok: false, error: "Invalid network" });
    }
    const steps: Array<{ step: number; type: string; ok: boolean; message: string }> = [];
    const result = await testNodeManager.startSequential(network, (step, _total, type, ok, message) => {
      steps.push({ step, type, ok, message });
    });
    res.json({ ok: result.ok, network, started: result.started, failed: result.failed, steps });
  });

  app.patch("/api/admin/test-nodes/:network/:type/bootup", requireAdmin, async (req, res) => {
    const network = req.params.network as ValidNetwork;
    const type    = req.params.type    as ValidNodeType;
    if (!VALID_NETWORKS.includes(network)) return res.status(400).json({ error: "Invalid network" });
    if (!VALID_NODE_TYPES.includes(type))  return res.status(400).json({ error: "Invalid node type" });
    const { shouldRun } = req.body;
    if (typeof shouldRun !== "boolean") return res.status(400).json({ error: "shouldRun (boolean) required" });
    await saveTestNodeState(network, type, shouldRun);
    res.json({ ok: true, network, type, shouldRun });
  });

  // ── Mining pool status — merges DB nodes + in-memory running test nodes ──────
  app.get("/api/mining/pool-status", requireAuth, async (req, res) => {
    // 1. DB-persisted online nodes
    const dbNodes: any[] = await storage.getAllNodes().catch(() => []);
    const onlineDb = dbNodes.filter((n: any) => n.isOnline || n.is_online);

    // 2. In-memory running test nodes (always up-to-date, no DB lag)
    const runningTestNodes = testNodeManager.getRunningNodes();
    const statuses = testNodeManager.status() as any;

    // Build synthetic node objects from in-memory state
    const testNodeObjects = runningTestNodes.map(({ network, type, port }) => {
      const s = statuses[network]?.[type] ?? {};
      const key = `${network}:${type}`;
      const dbId = testNodeDbIds.get(key);
      // Skip if already covered by the DB record
      const alreadyInDb = dbId && onlineDb.some((n: any) => n.id === dbId);
      if (alreadyInDb) return null;
      return {
        id: `test:${key}`,
        nodeType: type,
        network,
        isOnline: true,
        isApproved: true,
        isSynced: true,
        hashRate: type === 'boostnode' ? 2_500_000 : type === 'fullnode' ? 1_200_000 : 800_000,
        peerCount: s.peers ?? 0,
        lastBlockHeight: s.blockHeight ?? 0,
        syncProgress: 100,
        totalRewards: 0,
        validShares: Math.floor((s.blockHeight ?? 0) / 10),
        errorCount: 0,
        lastHeartbeat: new Date().toISOString(),
        wireguardPublicKey: `LOCAL:${port}:${network}`,
        port,
      };
    }).filter(Boolean);

    const allOnline = [...onlineDb, ...testNodeObjects];
    const connected = allOnline.length > 0;

    // Aggregate pool stats
    const totalHashRate = allOnline.reduce((s: number, n: any) => s + (n.hashRate || 0), 0);
    const totalRewards  = allOnline.reduce((s: number, n: any) => s + (n.totalRewards || 0), 0);
    const totalShares   = allOnline.reduce((s: number, n: any) => s + Number(n.validShares || 0), 0);
    const maxBlock      = allOnline.reduce((m: number, n: any) => Math.max(m, n.lastBlockHeight || 0), 0);

    res.json({
      connected,
      nodes: allOnline,
      stats: {
        totalHashRate,
        activeMiners: allOnline.length,
        blocksFound: Math.floor(totalShares / 100),
        lastBlockHeight: maxBlock,
        poolFee: 1.0,
        minPayout: 0.0001,
        pendingRewards: totalRewards * 0.1,
        totalPaid: totalRewards * 0.9,
        difficulty: 1_000_000,
        luck: 100,
      },
    });
  });

  // ── Mining Pool RPC — self-contained pool server (no node required) ────────
  // Public endpoint (no requireAuth): standalone miners connect from remote
  // servers with no browser session. Protected by rpcLimiter only.
  app.post("/api/mining/rpc", rpcLimiter, async (req, res) => {
    const { handleMiningRpc } = await import("./miningPool");
    const body = req.body ?? {};
    const method = String(body.method ?? "");
    const params = body.params ?? {};
    const id = body.id ?? null;

    const out = handleMiningRpc(method, params);

    // asyncFn means a reward DB write is needed; fire-and-forget
    if (out.asyncFn) out.asyncFn().catch(() => {});

    if (out.error) return res.json({ jsonrpc: "2.0", id, error: out.error });
    return res.json({ jsonrpc: "2.0", id, result: out.result });
  });

  // ── Mining pool stats (for Admin dashboard + /mining page) ─────────────────
  app.get("/api/mining/pool-stats", async (_req, res) => {
    const { getPoolStats } = await import("./miningPool");
    res.json(getPoolStats());
  });

  // ── Mining leaderboard — top earners from mining rewards ───────────────────
  app.get("/api/mining/leaderboard", async (_req, res) => {
    const { pool: pgPool } = await import("./db");
    try {
      const { rows } = await pgPool.query(`
        SELECT
          wallet_address,
          SUM(amount)   AS total_earned,
          COUNT(*)      AS share_count,
          MAX(created_at) AS last_seen
        FROM token_operations
        WHERE operation_type = 'mining_reward'
          AND status = 'confirmed'
        GROUP BY wallet_address
        ORDER BY total_earned DESC
        LIMIT 25
      `);
      res.json(rows.map((r: any, i: number) => ({
        rank:         i + 1,
        address:      r.wallet_address,
        totalEarned:  Number(r.total_earned),
        shareCount:   Number(r.share_count),
        lastSeen:     r.last_seen,
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Genesis JSON builder — reads ALL confirmed balances from DB ─────────────
  // Public so the install script can curl it; sensitive fields excluded.
  app.get("/api/chain/genesis.json", async (req, res) => {
    const { pool: pgPool } = await import("./db");
    const chainId = 13370;
    const FOUNDER = (process.env.FOUNDER_WALLET ?? '0xd43455e4ef3E472d81aaA848046FF9a55285F5Fc').toLowerCase();

    try {
      // Aggregate all confirmed on-chain token balances by EVM address.
      // Skip gyd:/gusd: prefix entries — those are stable-coin ledger entries
      // that live in the DB, not on the base EVM layer.
      const { rows } = await pgPool.query(`
        SELECT wallet_address, SUM(amount) AS total
        FROM token_operations
        WHERE status = 'confirmed'
          AND wallet_address NOT LIKE '%:%'
          AND wallet_address ~* '^0x[0-9a-fA-F]{40}$'
        GROUP BY wallet_address
        HAVING SUM(amount) > 0
      `);

      const alloc: Record<string, { balance: string }> = {};

      // Always include founder with at least the specified allocation
      alloc[FOUNDER] = { balance: '0x' + (BigInt('1000000000') * BigInt('1000000000000000000')).toString(16) };

      for (const row of rows) {
        const addr = row.wallet_address.toLowerCase();
        const wei  = BigInt(Math.floor(Number(row.total))) * BigInt('1000000000000000000');
        if (alloc[addr]) {
          // Merge with founder override (take max)
          const existing = BigInt(alloc[addr].balance);
          alloc[addr] = { balance: '0x' + (existing > wei ? existing : wei).toString(16) };
        } else {
          alloc[addr] = { balance: '0x' + wei.toString(16) };
        }
      }

      const genesis = {
        config: {
          chainId,
          homesteadBlock: 0,
          eip150Block: 0,
          eip155Block: 0,
          eip158Block: 0,
          byzantiumBlock: 0,
          constantinopleBlock: 0,
          petersburgBlock: 0,
          istanbulBlock: 0,
          berlinBlock: 0,
          londonBlock: 0,
          clique: { period: 120, epoch: 30000 },
        },
        difficulty: '1',
        gasLimit: '0x47b760',
        // Clique: 32-byte vanity + 20-byte sealer address + 65-byte seal
        extradata: '0x' + '0'.repeat(64) + FOUNDER.slice(2) + '0'.repeat(130),
        alloc,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="genesis.json"');
      res.json(genesis);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Install scripts — served as plain text for curl | bash usage ───────────
  app.get("/scripts/:scriptName", (req, res) => {
    const allowed = [
      'install-gyds-node.sh', 'install-fullnode.sh', 'install-litenode.sh',
      'install-rpcnode.sh', 'install-genesis.sh', 'setup-server.sh',
      'install-all-nodes.sh', 'setup-wireguard-mesh.sh',
    ];
    const name = req.params.scriptName;
    if (!allowed.includes(name)) return res.status(404).send('Script not found\n');
    const scriptPath = path.join(process.cwd(), 'public', 'scripts', name);
    if (!fs.existsSync(scriptPath)) return res.status(404).send(`${name} not found\n`);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.sendFile(scriptPath);
  });

  // ── Server-side balance endpoint ──────────────────────────────────────────
  app.get("/api/user/balance", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { pool: pgPool } = await import("./db");
    try {
      const walletsRes = await pgPool.query(`SELECT address FROM wallets WHERE user_id=$1`, [user.id]).catch(() => ({ rows: [] }));
      const addresses: string[] = walletsRes.rows.map((r: any) => r.address.toLowerCase());

      let gyds = 0, gyd = 0, gusd = 0;

      if (addresses.length > 0) {
        const addrList = addresses.map((_: any, i: number) => `$${i + 1}`).join(",");
        const ops = await pgPool.query(
          `SELECT operation_type, amount, wallet_address FROM token_operations WHERE status='confirmed' AND LOWER(wallet_address) = ANY(ARRAY[${addrList}])`,
          addresses
        ).catch(() => ({ rows: [] }));

        for (const op of ops.rows) {
          const amt = Number(op.amount ?? 0);
          const t = op.operation_type ?? "";
          if (t === "mint_gyds" || t === "premine_gyds") gyds += amt;
          else if (t === "mint_gyd" || t === "premine_gyd") gyd += amt;
          else if (t === "mint_gusd" || t === "premine_gusd") gusd += amt;
          else if (t === "burn_gyds" || t === "burn") gyds -= amt;
          else if (t === "burn_gyd") gyd -= amt;
          else if (t === "burn_gusd") gusd -= amt;
        }

        const txRes = await pgPool.query(
          `SELECT from_address, to_address, token_symbol, amount, fee FROM transactions WHERE status='confirmed' AND (LOWER(from_address) = ANY(ARRAY[${addrList}]) OR LOWER(to_address) = ANY(ARRAY[${addrList}]))`,
          addresses
        ).catch(() => ({ rows: [] }));

        for (const tx of txRes.rows) {
          const amt = Number(tx.amount ?? 0);
          const fee = Number(tx.fee ?? 0);
          const sym = (tx.token_symbol ?? "GYDS").toUpperCase();
          const fromMe = addresses.includes((tx.from_address ?? "").toLowerCase());
          const toMe   = addresses.includes((tx.to_address   ?? "").toLowerCase());
          if (sym === "GYDS") { if (fromMe) gyds -= amt + fee; if (toMe) gyds += amt; }
          else if (sym === "GYD") { if (fromMe) gyd -= amt + fee; if (toMe) gyd += amt; }
          else if (sym === "GUSD") { if (fromMe) gusd -= amt + fee; if (toMe) gusd += amt; }
        }
      }

      res.json({ gyds: Math.max(0, gyds), gyd: Math.max(0, gyd), gusd: Math.max(0, gusd), addresses });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── RPC Status: per-network running nodes ──────────────────────────────────
  app.get("/api/nodes/rpc-status", (_req, res) => {
    const all = testNodeManager.status() as any;
    const prioritized = ["rpc", "fullnode", "boostnode", "lite", "validator"];
    const externalUrls: Record<string, string> = {
      mainnet: "https://rpc.netlifegy.com",
      testnet: "https://testnet-rpc.netlifegy.com",
      devnet:  "https://devnet-rpc.netlifegy.com",
    };
    const result: any = { externalUrls };
    for (const network of VALID_NETWORKS) {
      const netStatus = all[network] ?? {};
      const running = VALID_NODE_TYPES
        .filter(t => netStatus[t]?.running)
        .map(t => ({ type: t, port: netStatus[t].port, blockHeight: netStatus[t].blockHeight, peers: netStatus[t].peers }))
        .sort((a, b) => prioritized.indexOf(a.type) - prioritized.indexOf(b.type));
      result[network] = {
        hasLocal: running.length > 0, running,
        proxyUrl: running.length > 0 ? `/api/rpc?network=${network}` : null,
        bestType: running[0]?.type ?? null,
        externalUrl: externalUrls[network],
      };
    }
    res.json(result);
  });

  // ── RPC Proxy: forward JSON-RPC to best running node for a network ─────────
  // ── Built-in JSON-RPC endpoint (/rpc) ────────────────────────────────────
  // Wallets (MetaMask, Trust Wallet, Coinbase) validate an RPC URL by calling
  // eth_chainId on it before adding the network. This endpoint always responds
  // correctly so wallet_addEthereumChain succeeds even without a running node.
  // It also tries to proxy to a local test node when one is running.
  app.all("/rpc", async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);

    const body = (req.method === 'GET' ? {} : req.body) ?? {};
    const { method, params = [], id = 1 } = body;

    const ok = (result: any) => res.json({ jsonrpc: '2.0', result, id });
    const err = (code: number, msg: string) =>
      res.json({ jsonrpc: '2.0', error: { code, message: msg }, id });

    // Try to proxy to a running local test node first
    const allNodes = testNodeManager.status() as any;
    const mainnet = allNodes['mainnet'] ?? {};
    const tryTypes = ['rpc', 'fullnode', 'boostnode', 'lite', 'validator'] as const;
    let livePort: number | null = null;
    for (const t of tryTypes) {
      if (mainnet[t]?.running) { livePort = mainnet[t].port; break; }
    }
    if (livePort && method) {
      try {
        const upstream = await fetch(`http://localhost:${livePort}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method, params, id }),
          signal: AbortSignal.timeout(4000),
        });
        return res.json(await upstream.json());
      } catch { /* fall through to built-in */ }
    }

    // Built-in responses — always work, no node needed
    const CHAIN_ID_HEX = '0x343A'; // 13370
    const NETWORK_ID   = '13370';

    // Get latest block height from DB for a realistic eth_blockNumber
    const blkRow = await pgPool.query(
      `SELECT MAX(block_number::bigint) AS h FROM transactions WHERE block_number ~ '^[0-9]+$'`
    ).catch(() => ({ rows: [{ h: null }] }));
    const blockHex = '0x' + (Number(blkRow.rows[0]?.h ?? 0)).toString(16);

    if (!method) return ok(null);

    switch (method) {
      case 'eth_chainId':               return ok(CHAIN_ID_HEX);
      case 'net_version':              return ok(NETWORK_ID);
      case 'eth_blockNumber':          return ok(blockHex || '0x0');
      case 'web3_clientVersion':       return ok('GYDSchain/v1.0.0/linux-amd64/go1.21.0');
      case 'net_listening':            return ok(true);
      case 'net_peerCount':            return ok('0x0');
      case 'eth_protocolVersion':      return ok('0x41');
      case 'eth_syncing':              return ok(false);
      case 'eth_gasPrice':             return ok('0x3B9ACA00');       // 1 gwei
      case 'eth_maxPriorityFeePerGas': return ok('0x59682F00');       // 1.5 gwei
      case 'eth_estimateGas':          return ok('0x5208');           // 21000
      case 'eth_getCode':              return ok('0x');
      case 'eth_call':                 return ok('0x');
      case 'eth_getTransactionCount':  return ok('0x0');
      case 'eth_getBalance': {
        const addr = (params[0] || '').toLowerCase();
        const row = await pgPool.query(
          `SELECT gyds_balance FROM wallets WHERE LOWER(address)=$1 LIMIT 1`, [addr]
        ).catch(() => ({ rows: [] }));
        const bal = Number(row.rows[0]?.gyds_balance ?? 0);
        const wei = '0x' + BigInt(Math.floor(bal * 1e18)).toString(16);
        return ok(wei);
      }
      case 'eth_getBlockByNumber':
      case 'eth_getBlockByHash':
        return ok(null);
      default:
        return err(-32601, `Method ${method} not supported`);
    }
  });

  app.post("/api/rpc", rpcLimiter, async (req, res) => {
    const network = ((req.query.network as string) || req.body?._network || "mainnet") as ValidNetwork;
    const all = testNodeManager.status() as any;
    const netStatus = all[VALID_NETWORKS.includes(network) ? network : "mainnet"] ?? {};
    const prioritized = ["rpc", "fullnode", "boostnode", "lite", "validator"] as const;
    let targetPort: number | null = null;
    for (const t of prioritized) {
      if (netStatus[t]?.running) { targetPort = netStatus[t].port; break; }
    }
    if (!targetPort) {
      return res.status(503).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: `No ${network} test nodes running. Start a node in Admin → Test Nodes.` },
        id: req.body?.id ?? null,
      });
    }
    try {
      const upstream = await fetch(`http://localhost:${targetPort}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(10000),
      });
      const data = await upstream.json();
      res.json(data);
    } catch (e: any) {
      res.status(502).json({ jsonrpc: "2.0", error: { code: -32603, message: `RPC proxy error: ${e.message}` }, id: req.body?.id ?? null });
    }
  });

  // ── Live Explorer: fetch real blocks from a running test node ────────────
  app.get("/api/explorer/live-blocks", async (req, res) => {
    const count = Math.min(parseInt((req.query.count as string) || "20", 10), 50);
    const all = testNodeManager.status() as any;
    // Try each network for any running node
    let targetPort: number | null = null;
    const networksToTry = ["mainnet", "testnet", "devnet"];
    const prioritized = ["rpc", "fullnode", "boostnode", "lite", "validator"] as const;
    outer: for (const net of networksToTry) {
      const netStatus = all[net] ?? {};
      for (const t of prioritized) {
        if (netStatus[t]?.running) { targetPort = netStatus[t].port; break outer; }
      }
    }
    if (!targetPort) {
      return res.json({ ok: false, error: "No test nodes running", blocks: [], blockHeight: 0, online: false });
    }
    try {
      const rpcBase = `http://localhost:${targetPort}`;
      const rpc = async (method: string, params: any[]) => {
        const r = await fetch(rpcBase, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
          signal: AbortSignal.timeout(5000),
        });
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        return j.result;
      };

      const latestHex: string = await rpc("eth_blockNumber", []);
      const latest = parseInt(latestHex, 16);

      // Fetch last `count` blocks in parallel (batched)
      const heights = Array.from({ length: Math.min(count, latest + 1) }, (_, i) => latest - i);
      const blockResults = await Promise.all(
        heights.map(h => rpc("eth_getBlockByNumber", [`0x${h.toString(16)}`, true]).catch(() => null))
      );

      const blocks = blockResults
        .filter(Boolean)
        .map((b: any) => ({
          height: parseInt(b.number, 16),
          hash: b.hash,
          previousHash: b.parentHash,
          timestamp: parseInt(b.timestamp, 16) * 1000,
          miner: b.miner,
          gasUsed: parseInt(b.gasUsed, 16),
          gasLimit: parseInt(b.gasLimit, 16),
          txCount: Array.isArray(b.transactions) ? b.transactions.length : 0,
          transactions: (Array.isArray(b.transactions) ? b.transactions : []).map((tx: any) =>
            typeof tx === "string"
              ? { id: tx, from: "", to: "", amount: 0, fee: 0, nonce: 0, timestamp: parseInt(b.timestamp, 16) * 1000, status: "confirmed" }
              : { id: tx.hash, from: tx.from || "", to: tx.to || "", amount: Number(BigInt(tx.value || "0x0")) / 1e18, fee: 0, nonce: parseInt(tx.nonce || "0x0", 16), timestamp: parseInt(b.timestamp, 16) * 1000, status: "confirmed" }
          ),
          validator: b.miner || "0x0000000000000000000000000000000000000000",
          validatorStake: 100000,
          miningRewards: [],
          signature: b.extraData || "0x",
          finalized: true,
          size: parseInt(b.size || "0x0", 16),
          difficulty: b.difficulty,
          extraData: b.extraData,
        }));

      res.json({ ok: true, online: true, blockHeight: latest, blocks, rpcPort: targetPort });
    } catch (e: any) {
      res.json({ ok: false, error: e.message, blocks: [], blockHeight: 0, online: false });
    }
  });

  // ── Node Ping: admin manually tests a node's RPC via its VPN IP ──────────
  app.post("/api/nodes/:id/ping", requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const rows = await pgPool.query(
        `SELECT id, ip_address, hostname, rpc_port, node_type FROM node_installations WHERE id=$1`, [id]
      );
      if (!rows.rows.length) return res.status(404).json({ error: 'Node not found' });
      const node = rows.rows[0];
      const host = node.ip_address || node.hostname;
      if (!host) return res.status(400).json({ error: 'Node has no IP address or hostname configured' });
      const port = node.rpc_port || 8545;
      const rpcUrl = `http://${host}:${port}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const rpcRes = await fetch(rpcUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
        });
        clearTimeout(timer);
        const rpcData = await rpcRes.json().catch(() => ({}));
        const blockHex = rpcData?.result;
        const blockHeight = blockHex ? parseInt(blockHex, 16) : undefined;
        const updates: Record<string, any> = { isOnline: true, lastHeartbeat: new Date() };
        if (blockHeight !== undefined) { updates.lastBlockHeight = blockHeight; updates.syncProgress = 100; updates.isSynced = true; }
        await storage.updateNode(id, updates);
        res.json({ ok: true, online: true, blockHeight, rpcUrl });
      } catch (fetchErr: any) {
        clearTimeout(timer);
        await storage.updateNode(id, { isOnline: false });
        res.json({ ok: false, online: false, error: fetchErr.name === 'AbortError' ? 'Timeout (5s)' : fetchErr.message, rpcUrl });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Node Heartbeat: deployed nodes call this to stay online ───────────────
  // Auth: admin/founder session OR derived token (SHA-256 of nodeId + secret)
  app.post("/api/nodes/:id/heartbeat", async (req, res) => {
    const { id } = req.params;
    const { blockHeight, peers, hashRate, syncProgress, token } = req.body ?? {};

    let authorized = req.isAuthenticated() && ((req.user as any)._isAdmin || (req.user as any)._isFounder);
    if (!authorized && token) {
      const expected = crypto.createHash('sha256')
        .update(id + (process.env.SESSION_SECRET ?? 'chaincore-secret'))
        .digest('hex').slice(0, 32);
      authorized = (token === expected);
    }
    if (!authorized) return res.status(401).json({ error: 'Unauthorized. Provide admin session or valid node token.' });

    try {
      const updates: Record<string, any> = { isOnline: true, lastHeartbeat: new Date() };
      if (blockHeight !== undefined) updates.lastBlockHeight = Number(blockHeight);
      if (peers !== undefined) updates.peerCount = Number(peers);
      if (hashRate !== undefined) updates.hashRate = Number(hashRate);
      if (syncProgress !== undefined) {
        updates.syncProgress = Number(syncProgress);
        updates.isSynced = Number(syncProgress) >= 100;
      }
      const node = await storage.updateNode(id, updates);
      if (!node) return res.status(404).json({ error: 'Node not found' });
      res.json({ ok: true, timestamp: new Date().toISOString() });
      broadcastActivity({ type: 'node_heartbeat', title: 'Node Heartbeat', detail: `${(node as any).nodeType ?? 'node'} · block ${blockHeight ?? '?'} · ${peers ?? '?'} peers`, meta: { id } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Node Token: get the heartbeat auth token for a specific node ───────────
  app.get("/api/nodes/:id/token", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      const rows = await pgPool.query(`SELECT user_id FROM node_installations WHERE id=$1`, [req.params.id]);
      if (!rows.rows.length) return res.status(404).json({ error: 'Node not found' });
      const nodeOwnerId = rows.rows[0].user_id;
      if (!user._isAdmin && !user._isFounder && nodeOwnerId !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const token = crypto.createHash('sha256')
        .update(req.params.id + (process.env.SESSION_SECRET ?? 'chaincore-secret'))
        .digest('hex').slice(0, 32);
      res.json({ token, nodeId: req.params.id, heartbeatUrl: `/api/nodes/${req.params.id}/heartbeat` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Leaderboard ─────────────────────────────────────────────────────────────
  app.get("/api/leaderboard/xp", async (_req, res) => {
    res.json(await storage.getXpLeaderboard(20));
  });

  app.get("/api/leaderboard/transactions", async (_req, res) => {
    res.json(await storage.getTxLeaderboard(20));
  });

  app.get("/api/leaderboard/tokens", async (_req, res) => {
    res.json(await storage.getTokenLeaderboard(20));
  });

  app.get("/api/leaderboard/my-xp", requireAuth, async (req, res) => {
    const user = req.user as any;
    res.json(await storage.getMyXpRank(user.id));
  });

  app.post("/api/xp/award", requireAdmin, async (req, res) => {
    const { userId, eventType, xpAwarded, description } = req.body;
    if (!userId || !eventType || typeof xpAwarded !== "number") {
      res.status(400).json({ ok: false, message: "Missing required fields" });
      return;
    }
    await storage.awardXp(userId, eventType, xpAwarded, description ?? null);
    res.json({ ok: true });
  });

  // ── Achievements ───────────────────────────────────────────────────────────
  app.get("/api/achievements", requireAuth, async (req, res) => {
    const user = req.user as any;
    const data = await storage.getUserAchievements(user.id);
    res.json(data);
  });

  app.post("/api/achievements/:id/unlock", requireAdmin, async (req, res) => {
    const { userId } = req.body;
    if (!userId) { res.status(400).json({ ok: false, message: "userId required" }); return; }
    const ok = await storage.unlockAchievement(userId, req.params.id);
    res.json({ ok, message: ok ? "Achievement unlocked" : "Already earned" });
  });

  // ── Referral ───────────────────────────────────────────────────────────────
  app.get("/api/referral", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      const data = await storage.getReferralStats(user.id);
      res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/referral/use", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { code } = req.body;
    if (!code) return res.status(400).json({ ok: false, message: "Code required" });
    const result = await storage.useReferralCode(code, user.id);
    res.json(result);
  });

  app.get("/api/referral/leaderboard", async (_req, res) => {
    try {
      const result = await pgPool.query(`
        SELECT r.user_id, u.username, r.referred_count, r.total_earned
        FROM referrals r
        LEFT JOIN users u ON u.id::text = r.user_id
        ORDER BY r.referred_count DESC, r.total_earned DESC
        LIMIT 50
      `);
      res.json(result.rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Governance Treasury + Voting Power ────────────────────────────────────
  app.get("/api/governance/treasury", async (_req, res) => {
    try { res.json(await storage.getGovernanceTreasury()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/governance/treasury/spending", async (_req, res) => {
    try { res.json(await storage.getTreasurySpending()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/governance/treasury/:coin", requireAdmin, async (req, res) => {
    const { balance, usd_value } = req.body;
    await storage.updateTreasuryBalance(req.params.coin, balance, usd_value);
    res.json({ ok: true });
  });

  app.get("/api/governance/voting-power", requireAuth, async (req, res) => {
    const user = req.user as any;
    try { res.json(await storage.getUserVotingPower(user.id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Developer API Keys ────────────────────────────────────────────────────
  app.get("/api/developer/keys", requireAuth, async (req, res) => {
    const user = req.user as any;
    try { res.json(await storage.getUserApiKeys(user.id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/developer/keys", requireAuth, apiLimiter, async (req, res) => {
    const user = req.user as any;
    const { name, scopes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const existing = await storage.getUserApiKeys(user.id);
    if (existing.length >= 10) return res.status(400).json({ error: "Max 10 API keys per account" });
    const key = await storage.createApiKey(user.id, name.trim(), scopes ?? ['read:chain']);
    res.json(key);
  });

  app.get("/api/developer/usage", requireAuth, async (req, res) => {
    try { res.json(await storage.getApiUsageStats((req.user as any).id.toString())); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/developer/keys/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    await storage.revokeApiKey(user.id, req.params.id);
    res.json({ ok: true });
  });

  // ── Admin: users list + all achievements ──────────────────────────────────
  app.get("/api/admin/users-basic", requireAdmin, async (_req, res) => {
    try { res.json(await storage.getAllUsersBasic()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/achievements-all", requireAdmin, async (_req, res) => {
    try { res.json(await storage.getAllAchievements()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── NFT ────────────────────────────────────────────────────────────────────
  app.get("/api/nft/collections", async (_req, res) => {
    try { res.json(await storage.getNftCollections()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/nft/tokens", async (req, res) => {
    try {
      const { search = '', collectionId = '' } = req.query as Record<string, string>;
      res.json(await storage.getNftTokens(search, collectionId));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/nfts", async (req, res) => {
    try {
      const { search = '', collectionId = '', limit } = req.query as Record<string, string>;
      const tokens = await storage.getNftTokens(search, collectionId);
      res.json(limit ? tokens.slice(0, Number(limit)) : tokens);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/nft/mint", requireAuth, async (req, res) => {
    try {
      const uid = (req.user as any).id;
      const { name, collectionId, rarity, imageEmoji, description, royaltyPercent, attributes } = req.body;
      if (!name) return res.status(400).json({ error: "name required" });
      const token = await storage.mintNftToken(uid, { name, collectionId, rarity, imageEmoji, description, royaltyPercent, attributes });
      res.json(token);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/nft/my-tokens", requireAuth, async (req, res) => {
    try { res.json(await storage.getMyNftTokens((req.user as any).id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/nft/buy/:tokenId", requireAuth, async (req, res) => {
    try {
      const result = await storage.buyNftToken((req.user as any).id, req.params.tokenId);
      res.json(result);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/nft/list/:tokenId", requireAuth, async (req, res) => {
    try {
      const { price } = req.body;
      if (!price || Number(price) <= 0) return res.status(400).json({ error: "valid price required" });
      const result = await storage.listNftToken((req.user as any).id, req.params.tokenId, Number(price));
      res.json(result);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/nft/delist/:tokenId", requireAuth, async (req, res) => {
    try {
      const result = await storage.delistNftToken((req.user as any).id, req.params.tokenId);
      res.json(result);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/nft/batch-mint", requireAuth, async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "items array required" });
      if (items.length > 10) return res.status(400).json({ error: "max 10 NFTs per batch" });
      const results = await storage.batchMintNftTokens((req.user as any).id, items);
      res.json(results);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Governance Delegation ──────────────────────────────────────────────────
  app.get("/api/governance/delegations", requireAuth, async (req, res) => {
    try { res.json(await storage.getMyDelegations((req.user as any).id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/governance/delegate", requireAuth, async (req, res) => {
    try {
      const { delegateAddress, delegateUsername, powerDelegated } = req.body;
      if (!delegateAddress) return res.status(400).json({ error: "delegateAddress required" });
      const d = await storage.delegateVotingPower((req.user as any).id, delegateAddress, delegateUsername, Number(powerDelegated) || 100);
      res.json(d);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/governance/delegation/:id", requireAuth, async (req, res) => {
    try {
      await storage.revokeDelegation((req.user as any).id, req.params.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Social Verifications ───────────────────────────────────────────────────
  app.get("/api/identity/social", requireAuth, async (req, res) => {
    try { res.json(await storage.getUserSocialVerifications((req.user as any).id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/identity/social/challenge", requireAuth, async (req, res) => {
    try {
      const { platform, handle } = req.body;
      if (!platform || !handle) return res.status(400).json({ error: "platform and handle required" });
      const code = await storage.generateSocialChallenge((req.user as any).id, platform, handle);
      res.json({ code, platform, handle });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/identity/social/verify", requireAuth, async (req, res) => {
    try {
      const { platform } = req.body;
      if (!platform) return res.status(400).json({ error: "platform required" });
      const result = await storage.verifySocialChallenge((req.user as any).id, platform);
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Bridge Transfers ───────────────────────────────────────────────────────
  app.get("/api/bridge/history", requireAuth, async (req, res) => {
    try { res.json(await storage.getUserBridgeTransfers((req.user as any).id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/bridge/transfer", requireAuth, async (req, res) => {
    try {
      const { fromChain, toChain, fromToken, toToken, amount, fee, txHash } = req.body;
      if (!fromChain || !toChain || !amount) return res.status(400).json({ error: "fromChain, toChain, amount required" });
      const transfer = await storage.createBridgeTransfer((req.user as any).id, {
        fromChain, toChain, fromToken: fromToken ?? 'GYDS', toToken: toToken ?? 'GYDS',
        amount: Number(amount), fee: Number(fee) || 0, txHash
      });
      res.json(transfer);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/bridge/transfer/:id", requireAuth, async (req, res) => {
    try {
      const { status, destTxHash } = req.body;
      const result = await storage.updateBridgeTransferStatus(req.params.id, status, destTxHash);
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Insurance Protocol ─────────────────────────────────────────────────────
  app.get("/api/insurance/pools", async (_req, res) => {
    try { res.json(await storage.getInsurancePools()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/insurance/buy", requireAuth, async (req, res) => {
    try {
      const { poolId, coverageAmount, durationDays } = req.body;
      if (!poolId || !coverageAmount) return res.status(400).json({ error: "poolId and coverageAmount required" });
      const policy = await storage.buyInsurancePolicy(
        (req.user as any).id, poolId, Number(coverageAmount), Number(durationDays) || 30
      );
      res.json(policy);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/insurance/my-policies", requireAuth, async (req, res) => {
    try { res.json(await storage.getUserInsurancePolicies((req.user as any).id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/insurance/claim/:policyId", requireAuth, async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ error: "reason required" });
      const result = await storage.submitInsuranceClaim((req.user as any).id, req.params.policyId, reason);
      res.json(result);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // ── Underwriter Staking ────────────────────────────────────────────────────
  app.get("/api/insurance/stakes", requireAuth, async (req, res) => {
    try {
      const stakes = await pgPool.query(
        `SELECT us.*, ip.name as pool_name, ip.premium_rate
         FROM underwriter_stakes us
         JOIN insurance_pools ip ON ip.id = us.pool_id
         WHERE us.user_id = $1 ORDER BY us.created_at DESC`,
        [(req.user as any).id]
      ).catch(() => ({ rows: [] }));
      res.json(stakes.rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/insurance/stake", requireAuth, async (req, res) => {
    try {
      const { poolId, amount } = req.body;
      if (!poolId || !amount || Number(amount) <= 0) return res.status(400).json({ error: "poolId and amount required" });
      const userId = (req.user as any).id;
      await pgPool.query(
        `CREATE TABLE IF NOT EXISTS underwriter_stakes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL, pool_id UUID NOT NULL,
          amount NUMERIC(20,6) NOT NULL, status TEXT NOT NULL DEFAULT 'active',
          earned NUMERIC(20,6) NOT NULL DEFAULT 0,
          staked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );
      const [row] = (await pgPool.query(
        `INSERT INTO underwriter_stakes (user_id, pool_id, amount) VALUES ($1,$2,$3) RETURNING *`,
        [userId, poolId, Number(amount)]
      )).rows;
      await pgPool.query(
        `UPDATE insurance_pools SET total_staked = total_staked + $1 WHERE id = $2`,
        [Number(amount), poolId]
      ).catch(() => {});
      (storage as any).createNotification(userId.toString(), 'stake', '🛡️ Underwriting active', `You staked ${Number(amount).toLocaleString()} GYDS as an underwriter. You will earn premium proportional to your share.`, '/insurance').catch(() => {});
      res.json(row);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/insurance/stake/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const row = (await pgPool.query(
        `UPDATE underwriter_stakes SET status='withdrawn' WHERE id=$1 AND user_id=$2 AND status='active' RETURNING *`,
        [req.params.id, userId]
      )).rows[0];
      if (!row) return res.status(404).json({ error: "Stake not found" });
      await pgPool.query(`UPDATE insurance_pools SET total_staked = GREATEST(total_staked - $1, 0) WHERE id = $2`, [row.amount, row.pool_id]).catch(() => {});
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Analytics: price history ───────────────────────────────────────────────
  app.get("/api/analytics/price-history/:coin", async (req, res) => {
    try {
      const days = Math.min(Number(req.query.days) || 30, 90);
      res.json(await storage.getPriceHistory(req.params.coin.toUpperCase(), days));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Webhooks ────────────────────────────────────────────────────────────────
  app.get("/api/webhooks", requireAuth, async (req, res) => {
    try { res.json(await storage.getUserWebhooks((req.user as any).id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/webhooks", requireAuth, async (req, res) => {
    try {
      const { url, events } = req.body;
      if (!url) return res.status(400).json({ error: "url required" });
      const wh = await storage.createWebhook((req.user as any).id, url, events ?? ['tx.confirmed', 'block.new']);
      res.json(wh);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/webhooks/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteWebhook((req.user as any).id, req.params.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/webhooks/:id", requireAuth, async (req, res) => {
    try {
      await storage.toggleWebhook((req.user as any).id, req.params.id, !!req.body.active);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Multi-Sig ─────────────────────────────────────────────────────────────
  app.get("/api/multisig/wallets", requireAuth, async (req, res) => {
    try { res.json(await storage.getUserMultisigWallets((req.user as any).id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/multisig/wallets", requireAuth, async (req, res) => {
    try {
      const { name, threshold, signers } = req.body;
      if (!name || !threshold || !signers?.length) return res.status(400).json({ error: "name, threshold, signers required" });
      const w = await storage.createMultisigWallet((req.user as any).id, name, parseInt(threshold), signers);
      res.json(w);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/multisig/wallets/:id/transactions", requireAuth, async (req, res) => {
    try { res.json(await storage.getMultisigTransactions(req.params.id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/multisig/transactions", requireAuth, async (req, res) => {
    try {
      const { walletId, toAddress, amount, symbol = 'GYDS', description = '' } = req.body;
      if (!walletId || !toAddress || !amount) return res.status(400).json({ error: "walletId, toAddress, amount required" });
      const tx = await storage.proposeMultisigTx((req.user as any).id, walletId, toAddress, parseFloat(amount), symbol, description);
      res.json(tx);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/multisig/transactions/:id/sign", requireAuth, async (req, res) => {
    try {
      const { action } = req.body;
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: "action must be approve or reject" });
      const tx = await storage.signMultisigTx((req.user as any).id, req.params.id, action as 'approve' | 'reject');
      res.json(tx);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Real-World Assets ─────────────────────────────────────────────────────
  app.get("/api/rwa/assets", async (_req, res) => {
    try { res.json(await storage.getRwaAssets()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/rwa/invest", requireAuth, async (req, res) => {
    try {
      const { assetId, amount } = req.body;
      if (!assetId || !amount) return res.status(400).json({ error: "assetId and amount required" });
      const result = await storage.investRwa((req.user as any).id, assetId, parseFloat(amount));
      res.json(result);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/rwa/holdings", requireAuth, async (req, res) => {
    try { res.json(await storage.getUserRwaHoldings((req.user as any).id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Network Snapshots ──────────────────────────────────────────────────────
  app.get("/api/analytics/network-history", async (req, res) => {
    try {
      const hours = parseInt(String(req.query.hours ?? '24'));
      res.json(await storage.getNetworkHistory(Math.min(hours, 168)));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Identity ───────────────────────────────────────────────────────────────
  app.get("/api/identity/did", requireAuth, async (req, res) => {
    try {
      const u = req.user as any;
      res.json(await storage.getOrCreateDID(u.id, u.email));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/identity/kyc", requireAuth, async (req, res) => {
    try { res.json(await storage.getUserKYC((req.user as any).id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/identity/reputation", requireAuth, async (req, res) => {
    try { res.json(await storage.getUserReputation((req.user as any).id)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Public REST API v1 ─────────────────────────────────────────────────────
  app.get("/v1/network/stats", async (_req, res) => {
    try {
      const stats = await storage.getNetworkStats();
      res.json({ tps: 1250, chain_id: 13370, block_time: 120, block_time_ms: 120000, ...stats });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/v1/tokens", async (_req, res) => {
    try {
      const tokens = await storage.getAllTokens?.() ?? [];
      res.json(tokens);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/v1/validators", async (_req, res) => {
    try {
      const validators = await storage.getValidators?.() ?? [];
      res.json(validators);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/v1/oracle/prices", async (_req, res) => {
    const ph = await storage.getPriceHistory("GYDS", 1).catch(() => []);
    const latest = ph[ph.length - 1];
    res.json({
      GYDS: latest?.close ?? 0.0000001,
      GYD: 1.0,
      BTC: 65000,
      ETH: 3400,
      updated_at: new Date().toISOString(),
    });
  });

  // ── Trade History ──────────────────────────────────────────────────────────
  app.get("/api/trades", async (req, res) => {
    try {
      const pair  = (req.query.pair as string) || 'GYDS/USDT';
      const limit = Math.min(parseInt(req.query.limit as string) || 40, 100);
      const trades = await (storage as any).getTradeHistory(pair, limit);
      res.json(trades);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/v1/address/:address/balance", async (req, res) => {
    try {
      const { address } = req.params;
      const wallet = await storage.getWalletByAddress?.(address);
      if (!wallet) return res.status(404).json({ error: "address not found" });
      res.json({ address, balance: wallet.balance, coin: "GYDS" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── In-App Notifications ───────────────────────────────────────────────────
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try { res.json(await (storage as any).getUserNotifications((req.user as any).id.toString())); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/notifications", requireAdmin, async (req, res) => {
    try {
      const { userId, type = 'announcement', title, body, link } = req.body;
      if (!userId || !title || !body) return res.status(400).json({ error: "userId, title, body required" });
      res.json(await (storage as any).createNotification(userId, type, title, body, link));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/notifications/broadcast", requireAdmin, async (req, res) => {
    try {
      const { type = 'announcement', title, body, link } = req.body;
      if (!title || !body) return res.status(400).json({ error: "title and body required" });
      const users = await storage.getAllUsersBasic();
      await Promise.all(users.map((u: any) =>
        (storage as any).createNotification(u.id?.toString() ?? u.user_id, type, title, body, link).catch(() => {})
      ));
      res.json({ ok: true, sent: users.length });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await (storage as any).markNotificationRead((req.user as any).id.toString(), req.params.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      await (storage as any).markAllNotificationsRead((req.user as any).id.toString());
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/notifications/:id", requireAuth, async (req, res) => {
    try {
      await (storage as any).dismissNotification((req.user as any).id.toString(), req.params.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Webhook Deliveries + Retry ─────────────────────────────────────────────
  app.get("/api/webhooks/:id/deliveries", requireAuth, async (req, res) => {
    try {
      res.json(await (storage as any).getWebhookDeliveries((req.user as any).id.toString(), req.params.id));
    } catch (e: any) { res.status(404).json({ error: e.message }); }
  });

  // Redeliver a specific delivery (fire the webhook again with the original event)
  app.post("/api/webhooks/:id/deliveries/:deliveryId/retry", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      // Get webhook (ownership check)
      const whRows = await pgPool.query(
        `SELECT * FROM webhook_endpoints WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]
      );
      if (!whRows.rows.length) return res.status(404).json({ error: "webhook not found" });
      const wh = whRows.rows[0];

      // Get original delivery
      const delRows = await pgPool.query(
        `SELECT * FROM webhook_deliveries WHERE id=$1 AND webhook_id=$2`, [req.params.deliveryId, req.params.id]
      );
      if (!delRows.rows.length) return res.status(404).json({ error: "delivery not found" });
      const delivery = delRows.rows[0];

      const payload = JSON.stringify({ event: delivery.event, retried: true, originalDelivery: delivery.id });
      const start = Date.now();
      let responseStatus = 0;
      let success = false;
      try {
        const resp = await fetch(wh.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-ChainCore-Secret": wh.secret ?? "" },
          body: payload,
          signal: AbortSignal.timeout(10000),
        });
        responseStatus = resp.status;
        success = resp.ok;
      } catch {}
      const duration = Date.now() - start;

      await pgPool.query(
        `INSERT INTO webhook_deliveries (webhook_id, event, response_status, success, duration_ms) VALUES ($1,$2,$3,$4,$5)`,
        [wh.id, delivery.event, responseStatus, success, duration]
      );
      res.json({ ok: true, success, responseStatus, durationMs: duration });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Test-fire a webhook with a synthetic ping event
  app.post("/api/webhooks/:id/test", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      const whRows = await pgPool.query(
        `SELECT * FROM webhook_endpoints WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]
      );
      if (!whRows.rows.length) return res.status(404).json({ error: "webhook not found" });
      const wh = whRows.rows[0];
      const payload = JSON.stringify({ event: "ping", timestamp: new Date().toISOString(), chain: "GYDSchain" });
      const start = Date.now();
      let responseStatus = 0; let success = false;
      try {
        const resp = await fetch(wh.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-ChainCore-Secret": wh.secret ?? "" },
          body: payload,
          signal: AbortSignal.timeout(10000),
        });
        responseStatus = resp.status; success = resp.ok;
      } catch {}
      const duration = Date.now() - start;
      await pgPool.query(
        `INSERT INTO webhook_deliveries (webhook_id, event, response_status, success, duration_ms) VALUES ($1,$2,$3,$4,$5)`,
        [wh.id, "ping", responseStatus, success, duration]
      );
      res.json({ ok: true, success, responseStatus, durationMs: duration });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Oracle Admin ────────────────────────────────────────────────────────────
  app.get("/api/oracle/feeds", async (_req, res) => {
    try { res.json(await (storage as any).getOracleFeeds()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/admin/oracle/feeds/:feedId", requireAdmin, async (req, res) => {
    try {
      const { value } = req.body;
      if (value === undefined) return res.status(400).json({ error: "value required" });
      res.json(await (storage as any).updateOracleFeed(req.params.feedId, parseFloat(value)));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/oracle/feeds/:feedId/submissions", async (req, res) => {
    try { res.json(await (storage as any).getOracleSubmissions(req.params.feedId)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Bridge Fee Config ───────────────────────────────────────────────────────
  app.get("/api/admin/bridge-fee-config", requireAdmin, async (_req, res) => {
    try {
      const feePercent = await (storage as any).getAdminConfig('bridge_fee_percent') ?? '0.3';
      const minFeeUsd  = await (storage as any).getAdminConfig('bridge_min_fee_usd')  ?? '1.0';
      const maxFeeUsd  = await (storage as any).getAdminConfig('bridge_max_fee_usd')  ?? '100.0';
      res.json({ feePercent: parseFloat(feePercent), minFeeUsd: parseFloat(minFeeUsd), maxFeeUsd: parseFloat(maxFeeUsd) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/admin/bridge-fee-config", requireAdmin, async (req, res) => {
    try {
      const { feePercent, minFeeUsd, maxFeeUsd } = req.body;
      if (feePercent !== undefined) await (storage as any).setAdminConfig('bridge_fee_percent', String(feePercent));
      if (minFeeUsd   !== undefined) await (storage as any).setAdminConfig('bridge_min_fee_usd',  String(minFeeUsd));
      if (maxFeeUsd   !== undefined) await (storage as any).setAdminConfig('bridge_max_fee_usd',  String(maxFeeUsd));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: Monthly Leaderboard Reset ───────────────────────────────────────
  app.post("/api/admin/leaderboard/reset", requireAdmin, async (_req, res) => {
    try { res.json(await (storage as any).resetLeaderboard()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: Token Launch Visibility ─────────────────────────────────────────
  app.get("/api/admin/launches", requireAdmin, async (_req, res) => {
    try { res.json(await (storage as any).getPendingLaunches()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/admin/launches/:id", requireAdmin, async (req, res) => {
    try {
      const { visible } = req.body;
      res.json(await (storage as any).updateLaunchVisibility(req.params.id, !!visible));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── KYC Tier Upgrade ───────────────────────────────────────────────────────
  app.post("/api/identity/kyc/upgrade", requireAuth, async (req, res) => {
    try {
      const { tier } = req.body;
      if (![1,2,3].includes(tier)) return res.status(400).json({ error: "tier must be 1, 2, or 3" });
      res.json(await (storage as any).upgradeKycTier((req.user as any).id, tier));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── RWA Yield Dashboard ────────────────────────────────────────────────────
  app.get("/api/rwa/yield", requireAuth, async (req, res) => {
    try { res.json(await (storage as any).getRwaYieldStats((req.user as any).id.toString())); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── REST API v1: Missing Endpoints ─────────────────────────────────────────
  app.get("/v1/blocks/:height", async (req, res) => {
    try {
      const height = parseInt(req.params.height);
      if (isNaN(height) || height < 1) return res.status(400).json({ error: "invalid block height" });
      const block = await (storage as any).getBlockByHeight(height);
      if (!block) return res.status(404).json({ error: "block not found" });
      res.json(block);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/v1/tx/:hash", async (req, res) => {
    try {
      const tx = await (storage as any).getTxByHash(req.params.hash);
      if (!tx) return res.status(404).json({ error: "transaction not found" });
      res.json(tx);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/v1/transactions/submit", async (req, res) => {
    try {
      const { signed_tx, raw } = req.body;
      const tx = signed_tx || raw;
      if (!tx) return res.status(400).json({ error: "signed_tx required" });
      res.json(await (storage as any).submitTransaction(tx));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/v1/pools", async (_req, res) => {
    try {
      const pools = await storage.getLiquidityPools?.() ?? [];
      res.json(pools);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Health Check ───────────────────────────────────────────────────────────
  // ── Admin Monitoring (Validator + Explorer + System) ──────────────────────
  app.get("/api/admin/monitoring", requireAdmin, async (_req, res) => {
    try {
      const [validatorRows, nodeRows, rpcHealth] = await Promise.all([
        storage.getValidators?.().catch(() => [] as any[]),
        pgPool?.query(`SELECT COUNT(*) as total, SUM(CASE WHEN is_synced THEN 1 ELSE 0 END) as synced FROM node_installations`).catch(() => ({ rows: [{ total: 0, synced: 0 }] })),
        (async () => {
          const rpcEndpoints = ["https://rpc.netlifegy.com", "https://rpc2.netlifegy.com", "https://rpc3.netlifegy.com"];
          return Promise.all(rpcEndpoints.map(async url => {
            try {
              const ctrl = new AbortController();
              const t = setTimeout(() => ctrl.abort(), 4000);
              const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }), signal: ctrl.signal });
              clearTimeout(t);
              const d: any = await r.json();
              return { url, reachable: !!d.result, blockNumber: d.result };
            } catch (e: any) { return { url, reachable: false, error: e.message }; }
          }));
        })(),
      ]);
      const validators = Array.isArray(validatorRows) ? validatorRows : [];
      const nodeSummary = nodeRows?.rows?.[0] ?? { total: 0, synced: 0 };
      let dbOk = false;
      try { await pgPool?.query('SELECT 1'); dbOk = true; } catch { dbOk = false; }
      res.json({
        timestamp: new Date().toISOString(),
        validators: { total: validators.length, active: validators.filter((v: any) => v.status === 'active').length },
        nodes: { total: Number(nodeSummary.total ?? 0), synced: Number(nodeSummary.synced ?? 0) },
        rpc: rpcHealth,
        db: dbOk,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/health", async (_req, res) => {
    const rpcEndpoints = ["https://rpc.netlifegy.com", "https://rpc2.netlifegy.com", "https://rpc3.netlifegy.com"];
    const checkRpc = async (url: string) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }), signal: ctrl.signal });
        clearTimeout(t);
        const d: any = await r.json();
        return { url, reachable: !!d.result, blockNumber: d.result };
      } catch (e: any) { return { url, reachable: false, error: e.message }; }
    };
    const rpcChecks = await Promise.all(rpcEndpoints.map(checkRpc));
    const allRpcOk = rpcChecks.some((r: any) => r.reachable);
    res.json({ status: allRpcOk ? "healthy" : "degraded", timestamp: new Date().toISOString(), chain_id: 13370, components: { rpc: rpcChecks } });
  });

  // ── Full infrastructure health check (replaces Supabase Edge Function) ──────
  app.get("/api/health/full", async (_req, res) => {
    const rpcEndpoints = ["https://rpc.netlifegy.com", "https://rpc2.netlifegy.com", "https://rpc3.netlifegy.com"];

    const checkEndpoint = async (url: string, timeout = 5000) => {
      const start = Date.now();
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeout);
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        return { reachable: r.ok || r.status < 500, latency: Date.now() - start };
      } catch (e: any) { return { reachable: false, latency: Date.now() - start, error: e.message }; }
    };

    const checkRpc = async (url: string) => {
      const start = Date.now();
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }), signal: ctrl.signal });
        clearTimeout(t);
        const d: any = await r.json();
        return { url, reachable: !!d.result, latency: Date.now() - start, blockNumber: d.result };
      } catch (e: any) { return { url, reachable: false, latency: Date.now() - start, error: e.message }; }
    };

    const dbStart = Date.now();
    let dbCheck = { reachable: false, latency: 0, error: "No pool" };
    try {
      await pgPool.query("SELECT 1");
      dbCheck = { reachable: true, latency: Date.now() - dbStart, error: '' };
    } catch (e: any) { dbCheck = { reachable: false, latency: Date.now() - dbStart, error: e.message }; }

    const [rpcChecks, wsCheck, explorerCheck, vpnCheck, testnetCheck] = await Promise.all([
      Promise.all(rpcEndpoints.map(checkRpc)),
      checkEndpoint("https://ws.netlifegy.com"),
      checkEndpoint("https://explorer.netlifegy.com"),
      checkEndpoint("https://vpn.netlifegy.com", 3000),
      checkRpc("https://testnet-rpc.netlifegy.com"),
    ]);

    const allRpcOk = rpcChecks.some((r: any) => r.reachable);
    const overallHealthy = dbCheck.reachable && allRpcOk;

    res.status(overallHealthy ? 200 : 503).json({
      status: overallHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      chain_id: 13370,
      components: {
        database: dbCheck,
        rpc: rpcChecks,
        websocket: { url: "wss://ws.netlifegy.com", ...wsCheck },
        explorer: { url: "https://explorer.netlifegy.com", ...explorerCheck },
        vpn: { url: "vpn.netlifegy.com", ...vpnCheck },
        testnet: { url: "https://testnet-rpc.netlifegy.com", ...testnetCheck },
      },
    });
  });

  // ── Push Notifications ─────────────────────────────────────────────────────
  app.get("/api/push/vapid-key", async (_req, res) => {
    const key = await getVapidPublicKey();
    res.json({ publicKey: key });
  });

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { subscription } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: "subscription required" });
    try {
      await pgPool.query(
        `INSERT INTO push_subscriptions (user_id, subscription)
         VALUES ($1, $2)
         ON CONFLICT (user_id, (subscription->>'endpoint')) DO UPDATE SET subscription = $2`,
        [user.id, JSON.stringify(subscription)]
      );
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/push/subscribe", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { endpoint } = req.body;
    if (endpoint) {
      await pgPool.query(
        `DELETE FROM push_subscriptions WHERE user_id=$1 AND subscription->>'endpoint'=$2`,
        [user.id, endpoint]
      ).catch(() => {});
    } else {
      await pgPool.query(`DELETE FROM push_subscriptions WHERE user_id=$1`, [user.id]).catch(() => {});
    }
    res.json({ ok: true });
  });

  app.post("/api/push/test", requireAuth, async (req, res) => {
    const user = req.user as any;
    await sendPushToUser(user.id, {
      title: "🔔 ChainCore Test Push",
      body: "Push notifications are working!",
      url: "/",
    });
    res.json({ ok: true });
  });

  // ── Price Alerts CRUD ──────────────────────────────────────────────────────
  app.get("/api/price-alerts", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      const alerts = await storage.getUserAlerts(user.id);
      res.json(alerts);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/price-alerts", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { tokenId, targetPrice, direction } = req.body;
    if (!tokenId || targetPrice == null || !direction) return res.status(400).json({ error: "tokenId, targetPrice, direction required" });
    if (!["above", "below"].includes(direction)) return res.status(400).json({ error: "direction must be above or below" });
    const tp = parseFloat(targetPrice);
    if (isNaN(tp) || tp <= 0) return res.status(400).json({ error: "targetPrice must be a positive number" });
    try {
      const alert = await storage.insertAlert({ userId: user.id, tokenId, targetPrice: tp.toString(), direction });
      res.json(alert);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/price-alerts/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      await storage.deleteAlert(req.params.id, user.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/price-alerts/:id/reset", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      await pgPool.query(
        `UPDATE token_price_alerts SET is_triggered = false, triggered_at = NULL WHERE id = $1 AND user_id = $2`,
        [req.params.id, user.id]
      );
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Price Alert NOTIFY trigger (internal) ──────────────────────────────────
  app.post("/api/price-alerts/notify", requireAdmin, async (req, res) => {
    const { userId, email, symbol, price, target, direction } = req.body;
    if (!symbol || !price || !target || !direction) return res.status(400).json({ error: "symbol, price, target, direction required" });
    try {
      await pgPool.query(
        `SELECT pg_notify('price_alert_trigger', $1)`,
        [JSON.stringify({ userId, email, symbol, price, target, direction })]
      );
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Wallet Encryption Key status ───────────────────────────────────────────
  app.get("/api/wallet-encryption/status", requireAdmin, (_req, res) => {
    const keySet = !!process.env.WALLET_ENCRYPTION_KEY && process.env.WALLET_ENCRYPTION_KEY.length === 64;
    res.json({ enabled: keySet, algorithm: "AES-256-GCM" });
  });

  // ── Cash Out requests ──────────────────────────────────────────────────────
  app.post("/api/wallet/cashout", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { asset, amount, destination, note, payment_method } = req.body;
    if (!asset || !amount || !destination) return res.status(400).json({ error: "asset, amount, destination required" });
    try {
      const reference = `CO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await pgPool.query(
        `CREATE TABLE IF NOT EXISTS cashout_requests (
          id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, asset TEXT NOT NULL,
          amount NUMERIC NOT NULL, destination TEXT NOT NULL, note TEXT,
          reference TEXT UNIQUE NOT NULL, status TEXT DEFAULT 'pending',
          created_at TIMESTAMPTZ DEFAULT NOW(), processed_at TIMESTAMPTZ
        )`
      );
      // Ensure payment_method column exists
      await pgPool.query(`ALTER TABLE cashout_requests ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT ''`).catch(() => {});
      await pgPool.query(
        `INSERT INTO cashout_requests (user_id, asset, amount, destination, note, reference, payment_method) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [user.id, asset, amount, destination, note || '', reference, payment_method || '']
      );
      res.json({ ok: true, reference, status: 'pending', message: 'Cash out request submitted. Processing: 1–3 business days.' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/wallet/cashouts", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      const { rows } = await pgPool.query(
        `SELECT * FROM cashout_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [user.id]
      );
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/cashouts", requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pgPool.query(
        `SELECT cr.*, u.username FROM cashout_requests cr LEFT JOIN users u ON u.id::text=cr.user_id ORDER BY cr.created_at DESC LIMIT 200`
      );
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/admin/cashouts/:id", requireAdmin, async (req, res) => {
    const { status, notes } = req.body;
    try {
      const { rows } = await pgPool.query(
        `UPDATE cashout_requests SET status=$1, processed_at=NOW() WHERE id=$2 RETURNING *`,
        [status, String(req.params.id)]
      );
      const cashout = rows[0];
      if (cashout && (status === 'approved' || status === 'rejected' || status === 'completed')) {
        // Fetch user info for notifications
        const userRes = await pgPool.query(
          `SELECT id, email, telegram_chat_id FROM users WHERE id::text=$1`,
          [cashout.user_id]
        ).catch(() => ({ rows: [] }));
        const u = userRes.rows[0];
        if (u) {
          const isApproved = status === 'approved' || status === 'completed';
          const emoji = isApproved ? '✅' : '❌';
          const notifTitle = isApproved ? `${emoji} Cash Out Approved` : `${emoji} Cash Out Rejected`;
          const notifBody = isApproved
            ? `Your cash out of ${Number(cashout.amount).toLocaleString()} ${cashout.asset} via ${cashout.payment_method || 'bank'} has been approved.`
            : `Your cash out of ${Number(cashout.amount).toLocaleString()} ${cashout.asset} was rejected.${notes ? ` Reason: ${notes}` : ''}`;
          // In-app notification
          (storage as any).createNotification(u.id.toString(), 'cashout', notifTitle, notifBody, '/wallet').catch(() => {});
          // Email
          if (u.email) {
            sendCashoutStatusEmail(u.email, {
              status,
              reference: cashout.reference,
              amount: Number(cashout.amount).toLocaleString(),
              asset: cashout.asset,
              paymentMethod: cashout.payment_method || 'bank',
              destination: cashout.destination,
              adminNote: notes,
            }).catch(() => {});
          }
          // Telegram
          if (u.telegram_chat_id) {
            sendTelegramMessage(u.telegram_chat_id, `${notifTitle}\n${notifBody}\nRef: ${cashout.reference}`).catch(() => {});
          }
        }
      }
      res.json(cashout || {});
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Cron Job Management ────────────────────────────────────────────────────
  interface CronJobState {
    id: string; name: string; description: string;
    schedule: string; intervalMs: number; enabled: boolean;
    lastRun: Date | null; nextRun: Date | null;
    lastStatus: 'success' | 'error' | 'running' | 'never';
    lastDuration: number | null; lastOutput: string | null;
    runCount: number; errorCount: number;
    timer: ReturnType<typeof setInterval> | null;
    fn: () => Promise<string>;
  }

  const cronJobs = new Map<string, CronJobState>();

  const scheduleToMs = (expr: string): number => {
    const presets: Record<string, number> = {
      '* * * * *': 60_000, '*/5 * * * *': 300_000, '*/15 * * * *': 900_000,
      '*/30 * * * *': 1_800_000, '0 * * * *': 3_600_000, '0 */6 * * *': 21_600_000,
      '0 */12 * * *': 43_200_000, '0 0 * * *': 86_400_000, '0 3 * * *': 86_400_000,
      '0 0 * * 0': 604_800_000,
    };
    return presets[expr] ?? 3_600_000;
  };

  const startCronTimer = (job: CronJobState) => {
    if (job.timer) { clearInterval(job.timer); job.timer = null; }
    if (!job.enabled) return;
    job.nextRun = new Date(Date.now() + job.intervalMs);
    job.timer = setInterval(async () => {
      if (!job.enabled) return;
      job.lastStatus = 'running';
      const start = Date.now();
      try {
        const out = await job.fn();
        job.lastStatus = 'success'; job.lastOutput = out;
        job.runCount++;
      } catch (e: any) {
        job.lastStatus = 'error'; job.errorCount++; job.lastOutput = String(e?.message || e);
      }
      job.lastRun = new Date(); job.lastDuration = Date.now() - start;
      job.nextRun = new Date(Date.now() + job.intervalMs);
    }, job.intervalMs);
  };

  const defineJob = (def: Omit<CronJobState, 'timer' | 'lastRun' | 'nextRun' | 'lastStatus' | 'lastDuration' | 'lastOutput' | 'runCount' | 'errorCount'>) => {
    const job: CronJobState = { ...def, timer: null, lastRun: null, nextRun: null, lastStatus: 'never', lastDuration: null, lastOutput: null, runCount: 0, errorCount: 0 };
    cronJobs.set(job.id, job);
    startCronTimer(job);
    return job;
  };

  defineJob({ id: 'db-pruner', name: 'DB Pruner', description: 'Prunes old network snapshots, expired tokens, stale API logs, and webhook deliveries', schedule: '0 3 * * *', intervalMs: 86_400_000, enabled: true,
    fn: async () => {
      const results: string[] = [];
      const prune = async (label: string, sql: string) => { try { const r = await pgPool.query(sql); results.push(`${label}: ${r.rowCount ?? 0} rows`); } catch (e: any) { results.push(`${label}: ERROR ${e.message}`); } };
      await prune('network_snapshots', `DELETE FROM network_snapshots WHERE created_at < NOW() - INTERVAL '30 days'`);
      await prune('api_usage_logs', `DELETE FROM api_usage_logs WHERE created_at < NOW() - INTERVAL '7 days'`);
      await prune('webhook_deliveries', `DELETE FROM webhook_deliveries WHERE delivered_at < NOW() - INTERVAL '14 days'`);
      await prune('xp_events', `DELETE FROM xp_events WHERE created_at < NOW() - INTERVAL '90 days'`);
      await prune('email_tokens', `DELETE FROM email_verification_tokens WHERE expires_at < NOW()`);
      return results.join('\n');
    }
  });

  defineJob({ id: 'session-cleanup', name: 'Session Cleanup', description: 'Removes expired user sessions from the database', schedule: '0 */6 * * *', intervalMs: 21_600_000, enabled: true,
    fn: async () => {
      const r = await pgPool.query(`DELETE FROM session WHERE expire < NOW()`).catch(() => ({ rowCount: 0 }));
      return `Removed ${r.rowCount ?? 0} expired sessions`;
    }
  });

  defineJob({ id: 'network-snapshot', name: 'Network Snapshot', description: 'Captures a point-in-time snapshot of network metrics (TPS, block height, validators)', schedule: '*/15 * * * *', intervalMs: 900_000, enabled: true,
    fn: async () => {
      const stats = await storage.getNetworkStats().catch(() => null);
      if (!stats) return 'No stats available';
      await pgPool.query(
        `INSERT INTO network_snapshots (block_height, tps, active_validators, total_stake, timestamp) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT DO NOTHING`,
        [stats.blockHeight || 0, stats.tps || 0, stats.activeValidators || 0, stats.totalStake || '0']
      ).catch(() => {});
      return `Snapshot at block ${stats.blockHeight || 'unknown'}`;
    }
  });

  defineJob({ id: 'webhook-retry', name: 'Webhook Retry', description: 'Retries failed webhook deliveries (up to 3 attempts per event)', schedule: '*/5 * * * *', intervalMs: 300_000, enabled: true,
    fn: async () => {
      const { rows } = await pgPool.query(
        `SELECT wd.*, w.url, w.secret FROM webhook_deliveries wd JOIN webhooks w ON w.id=wd.webhook_id WHERE wd.status='failed' AND wd.attempts < 3 LIMIT 20`
      ).catch(() => ({ rows: [] }));
      let retried = 0;
      for (const row of rows) {
        try {
          const payload = typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload);
          const r = await fetch(row.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': row.secret || '' }, body: payload, signal: AbortSignal.timeout(8000) });
          const status = r.ok ? 'delivered' : 'failed';
          await pgPool.query(`UPDATE webhook_deliveries SET status=$1, attempts=attempts+1, delivered_at=NOW() WHERE id=$2`, [status, row.id]);
          retried++;
        } catch { await pgPool.query(`UPDATE webhook_deliveries SET attempts=attempts+1 WHERE id=$1`, [row.id]); }
      }
      return `Retried ${retried} of ${rows.length} failed deliveries`;
    }
  });

  defineJob({ id: 'price-feed', name: 'Price Feed Update', description: 'Refreshes cached token prices and checks user price alert thresholds', schedule: '*/5 * * * *', intervalMs: 300_000, enabled: true,
    fn: async () => {
      const { rows } = await pgPool.query(
        `SELECT * FROM price_alerts WHERE enabled=true AND triggered=false`
      ).catch(() => ({ rows: [] }));
      let triggered = 0;
      for (const alert of rows) {
        const price = Math.random() * 2 + (alert.asset === 'GYD' ? 0.98 : 0.8);
        const hit = (alert.condition === 'above' && price >= parseFloat(alert.threshold)) || (alert.condition === 'below' && price <= parseFloat(alert.threshold));
        if (hit) {
          await pgPool.query(`UPDATE price_alerts SET triggered=true, triggered_at=NOW() WHERE id=$1`, [alert.id]).catch(() => {});
          triggered++;
        }
      }
      return `Checked ${rows.length} alerts, triggered ${triggered}`;
    }
  });

  defineJob({ id: 'health-check', name: 'Health Check Ping', description: 'Pings all configured RPC endpoints and logs availability metrics', schedule: '*/15 * * * *', intervalMs: 900_000, enabled: true,
    fn: async () => {
      const endpoints = ['http://localhost:5001/api/health/rpc'];
      const results: string[] = [];
      for (const url of endpoints) {
        try {
          const start = Date.now();
          const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
          results.push(`${url}: ${r.status} (${Date.now() - start}ms)`);
        } catch (e: any) { results.push(`${url}: FAIL ${e.message}`); }
      }
      return results.join('\n');
    }
  });

  defineJob({ id: 'email-token-cleanup', name: 'Email Token Cleanup', description: 'Removes expired email verification tokens', schedule: '0 * * * *', intervalMs: 3_600_000, enabled: true,
    fn: async () => {
      const r = await pgPool.query(`DELETE FROM email_verification_tokens WHERE expires_at < NOW()`).catch(() => ({ rowCount: 0 }));
      return `Removed ${r.rowCount ?? 0} expired tokens`;
    }
  });

  defineJob({ id: 'node-autopinger', name: 'Node Auto-Pinger', description: 'Pings all approved remote nodes every 5 minutes, sends push alert + in-app notification when a node goes offline or recovers', schedule: '*/5 * * * *', intervalMs: 300_000, enabled: true,
    fn: async () => {
      const { rows: nodes } = await pgPool.query(
        `SELECT id, node_type, ip_address, hostname, rpc_port, is_online FROM node_installations WHERE is_approved=true AND (ip_address IS NOT NULL OR hostname IS NOT NULL)`
      ).catch(() => ({ rows: [] as any[] }));
      if (!nodes.length) return 'No approved remote nodes to ping';

      const results: string[] = [];
      const alertLines: string[] = [];

      await Promise.all(nodes.map(async (node: any) => {
        const host = node.ip_address || node.hostname;
        const port = node.rpc_port || 8545;
        const rpcUrl = `http://${host}:${port}`;
        const wasOnline = Boolean(node.is_online);
        let nowOnline = false;
        let blockHeight: number | undefined;

        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5000);
          const rpcRes = await fetch(rpcUrl, {
            method: 'POST', signal: ctrl.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
          });
          clearTimeout(timer);
          const rpcData = await rpcRes.json().catch(() => ({}));
          const bh = rpcData?.result ? parseInt(rpcData.result, 16) : undefined;
          blockHeight = bh;
          nowOnline = true;
          const upd: Record<string, any> = { isOnline: true, lastHeartbeat: new Date() };
          if (bh !== undefined) { upd.lastBlockHeight = bh; upd.isSynced = true; upd.syncProgress = 100; }
          await storage.updateNode(String(node.id), upd).catch(() => {});
        } catch {
          nowOnline = false;
          await storage.updateNode(String(node.id), { isOnline: false }).catch(() => {});
        }

        const label = `${node.node_type} @ ${host}`;
        results.push(`${label}: ${nowOnline ? `✓ block #${blockHeight ?? '?'}` : '✗ unreachable'}`);

        // Alert on status change
        if (wasOnline && !nowOnline) {
          alertLines.push(label);
          const msg = `🔴 Node offline: ${label}`;
          // in-app notifications for all admins/founders
          const { rows: admins } = await pgPool.query(
            `SELECT id FROM users WHERE role IN ('admin','founder')`
          ).catch(() => ({ rows: [] as any[] }));
          await Promise.all(admins.map((u: any) =>
            pgPool.query(
              `INSERT INTO user_notifications (user_id, type, title, message, created_at) VALUES ($1,'node_alert','Node Offline',$2,NOW())`,
              [u.id, `${label} has gone offline.`]
            ).catch(() => {})
          ));
          await broadcastPush({ title: '🔴 Node Offline', body: `${label} is not responding`, url: '/admin' });
        } else if (!wasOnline && nowOnline) {
          const msg = `🟢 Node recovered: ${label}`;
          const { rows: admins } = await pgPool.query(
            `SELECT id FROM users WHERE role IN ('admin','founder')`
          ).catch(() => ({ rows: [] as any[] }));
          await Promise.all(admins.map((u: any) =>
            pgPool.query(
              `INSERT INTO user_notifications (user_id, type, title, message, created_at) VALUES ($1,'node_alert','Node Recovered',$2,NOW())`,
              [u.id, `${label} is back online at block #${blockHeight ?? '?'}.`]
            ).catch(() => {})
          ));
          await broadcastPush({ title: '🟢 Node Recovered', body: `${label} is back online`, url: '/admin' });
        }
      }));

      return results.join('\n') + (alertLines.length ? `\n⚠ Alerts sent for: ${alertLines.join(', ')}` : '');
    }
  });

  const serializeCron = (j: CronJobState) => ({
    id: j.id, name: j.name, description: j.description, schedule: j.schedule,
    enabled: j.enabled, lastRun: j.lastRun, nextRun: j.nextRun,
    lastStatus: j.lastStatus, lastDuration: j.lastDuration, lastOutput: j.lastOutput,
    runCount: j.runCount, errorCount: j.errorCount,
  });

  app.get("/api/admin/cron-jobs", requireAdmin, (_req, res) => {
    res.json(Array.from(cronJobs.values()).map(serializeCron));
  });

  app.patch("/api/admin/cron-jobs/:id", requireAdmin, (req, res) => {
    const job = cronJobs.get(String(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (typeof req.body.enabled === 'boolean') job.enabled = req.body.enabled;
    if (typeof req.body.schedule === 'string') {
      job.schedule = req.body.schedule;
      job.intervalMs = scheduleToMs(req.body.schedule);
    }
    startCronTimer(job);
    res.json(serializeCron(job));
  });

  app.post("/api/admin/cron-jobs/:id/run", requireAdmin, async (req, res) => {
    const job = cronJobs.get(String(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.lastStatus === 'running') return res.status(409).json({ error: 'Job already running' });
    res.json({ ok: true, message: 'Job triggered' });
    job.lastStatus = 'running';
    const start = Date.now();
    try {
      const out = await job.fn();
      job.lastStatus = 'success'; job.lastOutput = out; job.runCount++;
    } catch (e: any) {
      job.lastStatus = 'error'; job.errorCount++; job.lastOutput = String(e?.message || e);
    }
    job.lastRun = new Date(); job.lastDuration = Date.now() - start;
  });

  // ── GitHub Webhook Receiver ─────────────────────────────────────────────────
  // This endpoint is called by GitHub when any of the node repos receive a push.
  // Set up: GitHub repo → Settings → Webhooks → Payload URL: https://<your-domain>/api/webhooks/github
  // Content type: application/json | Secret: value of GITHUB_WEBHOOK_SECRET env var
  app.post("/api/webhooks/github",
    (req, _res, next) => {
      // Buffer the raw body for HMAC verification
      let data = Buffer.alloc(0);
      req.on('data', (chunk: Buffer) => { data = Buffer.concat([data, chunk]); });
      req.on('end', () => { (req as any).rawBody = data; next(); });
    },
    async (req: Request, res: Response) => {
      try {
        const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body));
        const sig = req.headers['x-hub-signature-256'] as string | undefined;
        const secret = process.env.GITHUB_WEBHOOK_SECRET;
        let verified = false;

        if (secret && sig) {
          const hmac = crypto.createHmac('sha256', secret);
          hmac.update(rawBody);
          const expected = `sha256=${hmac.digest('hex')}`;
          try {
            verified = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
          } catch { verified = false; }
          if (!verified) {
            return res.status(401).json({ error: 'Invalid webhook signature' });
          }
        } else {
          // No secret configured — accept but mark as unverified (dev mode)
          verified = false;
        }

        const eventType = req.headers['x-github-event'] as string ?? 'unknown';
        const deliveryId = req.headers['x-github-delivery'] as string ?? crypto.randomUUID();
        let payload: any = {};
        try { payload = JSON.parse(rawBody.toString()); } catch { payload = req.body ?? {}; }

        const repoFullName: string = payload.repository?.full_name ?? 'unknown/unknown';
        const pusherName: string = payload.pusher?.name ?? payload.sender?.login ?? undefined;
        const branch: string = payload.ref ? payload.ref.replace('refs/heads/', '') : undefined;
        const commits: any[] = payload.commits ?? [];
        const headSha: string = payload.head_commit?.id?.slice(0, 7) ?? undefined;

        const event: GithubWebhookEvent = {
          id: deliveryId,
          event: eventType,
          repo: repoFullName,
          pusher: pusherName,
          branch,
          commitCount: commits.length || undefined,
          headCommit: headSha,
          timestamp: new Date().toISOString(),
          verified,
        };

        // Store (keep last 100)
        githubWebhookEvents.push(event);
        if (githubWebhookEvents.length > 100) githubWebhookEvents.shift();

        // Flag repos that node repos need a recheck
        const NODE_REPOS = ['hc172808/fullnode', 'hc172808/genesis', 'hc172808/rpcnode', 'hc172808/boostnode', 'hc172808/validatornode'];
        if (NODE_REPOS.includes(repoFullName) && eventType === 'push') {
          githubPendingRecheck.add(repoFullName);
          console.log(`[GitHub Webhook] Push to ${repoFullName} by ${pusherName} — NodeRepoSync recheck flagged`);
        }

        res.json({ ok: true, received: event.id });
      } catch (err: any) {
        console.error('[GitHub Webhook] Error:', err);
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    }
  );

  // Get recent GitHub webhook events (admin only)
  app.get("/api/admin/github-webhook/events", requireAdmin, (_req, res) => {
    res.json({
      events: githubWebhookEvents.slice().reverse(), // newest first
      pendingRecheck: Array.from(githubPendingRecheck),
      webhookUrl: `${process.env.APP_URL ?? 'https://app.netlifegy.com'}/api/webhooks/github`,
      secretConfigured: !!process.env.GITHUB_WEBHOOK_SECRET,
    });
  });

  // Acknowledge recheck (called by NodeRepoSync after it finishes checking)
  app.post("/api/admin/github-webhook/ack", requireAdmin, (req, res) => {
    const { repo } = req.body;
    if (repo) githubPendingRecheck.delete(repo);
    else githubPendingRecheck.clear();
    res.json({ ok: true });
  });

  // ── User Feature Grants ────────────────────────────────────────────────────
  // List all known features (static — same as frontend)
  app.get("/api/admin/feature-definitions", requireAdmin, async (_req, res) => {
    const definitions = [
      { key: 'defi.swap',        label: 'DeFi: Swap',             group: 'DeFi' },
      { key: 'defi.crosschain',  label: 'DeFi: Cross-Chain Bridge', group: 'DeFi' },
      { key: 'defi.stake',       label: 'DeFi: Staking',          group: 'DeFi' },
      { key: 'defi.pools',       label: 'DeFi: Liquidity Pools',  group: 'DeFi' },
      { key: 'defi.farm',        label: 'DeFi: LP Farming',       group: 'DeFi' },
      { key: 'defi.launchpad',   label: 'DeFi: Launchpad',        group: 'DeFi' },
      { key: 'defi.portfolio',   label: 'DeFi: Portfolio',        group: 'DeFi' },
      { key: 'defi.vaults',      label: 'DeFi: Yield Vaults',     group: 'DeFi' },
      { key: 'defi.orderbook',   label: 'DeFi: Orderbook',        group: 'DeFi' },
      { key: 'defi.perps',       label: 'DeFi: Perpetuals',       group: 'DeFi' },
      { key: 'defi.predict',     label: 'DeFi: Prediction',       group: 'DeFi' },
      { key: 'defi.stable',      label: 'DeFi: Stablecoin',         group: 'DeFi' },
      { key: 'defi.ilcalc',      label: 'DeFi: IL Calculator',    group: 'DeFi' },
      { key: 'wallet.faucet',    label: 'Wallet: Faucet',         group: 'Wallet' },
      { key: 'wallet.create',    label: 'Wallet: Create',         group: 'Wallet' },
      { key: 'wallet.ledger',    label: 'Wallet: Ledger',         group: 'Wallet' },
      { key: 'mining.dashboard', label: 'Mining Dashboard',       group: 'Mining' },
      { key: 'tokens.create',    label: 'Tokens: Create',       group: 'Tokens' },
      { key: 'tokens.list',      label: 'Tokens: Public List',   group: 'Tokens' },
      { key: 'explorer.search',  label: 'Explorer: Search',       group: 'Explorer' },
      { key: 'governance.vote',  label: 'Governance: Vote',       group: 'Governance' },
      { key: 'governance.propose', label: 'Governance: Propose', group: 'Governance' },
      { key: 'governance.treasury', label: 'Governance: Treasury', group: 'Governance' },
      { key: 'nft.mint',         label: 'NFT: Mint',              group: 'NFT' },
      { key: 'nft.market',       label: 'NFT: Marketplace',       group: 'NFT' },
      { key: 'identity.did',     label: 'Identity: DID',          group: 'Identity' },
      { key: 'rwa.invest',       label: 'RWA: Invest',           group: 'RWA' },
      { key: 'community.post',   label: 'Community: Post',        group: 'Community' },
      { key: 'developer.api',    label: 'Developer: API',         group: 'Developer' },
      { key: 'developer.sdk',    label: 'Developer: SDK',         group: 'Developer' },
      { key: 'insurance.buy',    label: 'Insurance: Buy',         group: 'Insurance' },
      { key: 'multisig.create',  label: 'Multi-Sig: Create',      group: 'Multi-Sig' },
      { key: 'analytics.view',   label: 'Analytics: View',        group: 'Analytics' },
      { key: 'leaderboard.view', label: 'Leaderboard: View',      group: 'Leaderboard' },
      { key: 'referrals.view',   label: 'Referrals: View',        group: 'Referrals' },
      { key: 'docs.cli',         label: 'Docs: CLI Reference',    group: 'Docs' },
      { key: 'network.validators', label: 'Network: Validators',  group: 'Network' },
      { key: 'network.nodes',    label: 'Network: Nodes',         group: 'Network' },
      { key: 'mobile.biometric', label: 'Mobile: Biometric',    group: 'Mobile' },
      { key: 'mobile.push',      label: 'Mobile: Push',          group: 'Mobile' },
      { key: 'mobile.qrpay',     label: 'Mobile: QR Pay',        group: 'Mobile' },
    ];
    res.json(definitions);
  });

  // Get a user's feature grants
  app.get("/api/admin/user-features/:userId", requireAdmin, async (req, res) => {
    const rows = await storage.getUserFeaturesWithAll(req.params.userId);
    res.json(rows);
  });

  // Set a feature for a user
  app.post("/api/admin/user-features/:userId", requireAdmin, async (req, res) => {
    const admin = req.user as any;
    const { featureKey, enabled } = req.body;
    await storage.setUserFeature(req.params.userId, featureKey, enabled, admin.id);
    res.json({ ok: true });
  });

  // Grant all features to a user
  app.post("/api/admin/user-features/:userId/grant-all", requireAdmin, async (req, res) => {
    const admin = req.user as any;
    const keys = [
      'defi.swap','defi.crosschain','defi.stake','defi.pools','defi.farm','defi.launchpad',
      'defi.portfolio','defi.vaults','defi.orderbook','defi.perps','defi.predict','defi.stable','defi.ilcalc',
      'wallet.faucet','wallet.create','wallet.ledger',
      'mining.dashboard','tokens.create','tokens.list','explorer.search',
      'governance.vote','governance.propose','governance.treasury',
      'nft.mint','nft.market','identity.did','rwa.invest','community.post',
      'developer.api','developer.sdk','insurance.buy','multisig.create',
      'analytics.view','leaderboard.view','referrals.view','docs.cli',
      'network.validators','network.nodes','mobile.biometric','mobile.push','mobile.qrpay',
    ];
    await storage.grantAllUserFeatures(req.params.userId, admin.id, keys);
    res.json({ ok: true });
  });

  // Revoke all features from a user
  app.post("/api/admin/user-features/:userId/revoke-all", requireAdmin, async (req, res) => {
    await storage.revokeAllUserFeatures(req.params.userId);
    res.json({ ok: true });
  });

  // Get my own features (for non-admin users)
  app.get("/api/me/features", requireAuth, async (req, res) => {
    const user = req.user as any;
    const rows = await storage.getUserFeatures(user.id);
    res.json(rows.map((r: any) => r.feature_key));
  });

  // ── Payment Methods ────────────────────────────────────────────────────────
  async function ensurePaymentTables() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        instructions TEXT,
        icon TEXT,
        is_enabled BOOLEAN DEFAULT true,
        config_json TEXT DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS buy_requests (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        payment_method_id INTEGER,
        payment_method_name TEXT NOT NULL,
        token_symbol TEXT NOT NULL DEFAULT 'GYD',
        token_amount NUMERIC NOT NULL,
        fiat_amount NUMERIC,
        fiat_currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'pending',
        reference TEXT UNIQUE NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      )
    `);
    // Create cashout_requests if it doesn't exist yet
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS cashout_requests (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        asset TEXT NOT NULL DEFAULT 'GYDS',
        amount NUMERIC NOT NULL,
        destination TEXT NOT NULL,
        note TEXT,
        reference TEXT UNIQUE NOT NULL,
        payment_method TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      )
    `);
    // Ensure payment_method column exists (migration guard)
    await pgPool.query(`
      ALTER TABLE cashout_requests ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT ''
    `).catch(() => {});
    // Seed default payment methods if empty
    const { rows: existing } = await pgPool.query(`SELECT id FROM payment_methods LIMIT 1`);
    if (existing.length === 0) {
      const defaults = [
        { name: 'PayPal', type: 'paypal', description: 'Pay with PayPal balance or linked card', instructions: 'Send payment to the PayPal address provided by admin. Include your reference number in the note.', icon: 'paypal' },
        { name: 'MMG Guyana', type: 'mmg', description: 'Mobile Money Guyana (MMG) mobile wallet', instructions: 'Transfer via MMG to the number provided. Use your reference as the transfer note.', icon: 'phone' },
        { name: 'Bank Transfer (Guyana)', type: 'bank_gy', description: 'Local bank transfer in Guyana (GYD)', instructions: 'Transfer to the bank account details provided. Processing takes 1-2 business days.', icon: 'building' },
        { name: 'VISA / Mastercard', type: 'card', description: 'Pay with debit or credit card', instructions: 'Card payment link will be provided after submission. Funds credited within minutes.', icon: 'credit-card' },
        { name: 'Crypto (USDT/USDC)', type: 'crypto', description: 'Pay with USDT or USDC on any network', instructions: 'Send USDT or USDC to the wallet address provided. Include your reference as memo/tag.', icon: 'coins' },
      ];
      for (const m of defaults) {
        await pgPool.query(
          `INSERT INTO payment_methods (name, type, description, instructions, icon) VALUES ($1,$2,$3,$4,$5)`,
          [m.name, m.type, m.description, m.instructions, m.icon]
        );
      }
    }
  }
  ensurePaymentTables().catch(console.error);

  // Ensure wallet_releases table exists (platform: android/ios/windows/mac)
  pgPool.query(`
    CREATE TABLE IF NOT EXISTS wallet_releases (
      id SERIAL PRIMARY KEY,
      platform TEXT NOT NULL,
      version TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_size BIGINT NOT NULL DEFAULT 0,
      notes TEXT,
      download_count INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).then(() =>
    // Drop any legacy CHECK constraint that used 'macos' instead of 'mac'
    pgPool.query(`
      ALTER TABLE wallet_releases
        DROP CONSTRAINT IF EXISTS wallet_releases_platform_check
    `)
  ).catch(console.error);

  app.get("/api/payment-methods", async (_req, res) => {
    try {
      const { rows } = await pgPool.query(`SELECT * FROM payment_methods WHERE is_enabled=true ORDER BY id`);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/payment-methods", requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pgPool.query(`SELECT * FROM payment_methods ORDER BY id`);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/payment-methods", requireAdmin, async (req, res) => {
    const { name, type, description, instructions, icon } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type required' });
    try {
      const { rows } = await pgPool.query(
        `INSERT INTO payment_methods (name, type, description, instructions, icon) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [name, type || 'custom', description || '', instructions || '', icon || 'credit-card']
      );
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/admin/payment-methods/:id", requireAdmin, async (req, res) => {
    const { name, description, instructions, icon, is_enabled, config_json } = req.body;
    try {
      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (name !== undefined) { fields.push(`name=$${idx++}`); vals.push(name); }
      if (description !== undefined) { fields.push(`description=$${idx++}`); vals.push(description); }
      if (instructions !== undefined) { fields.push(`instructions=$${idx++}`); vals.push(instructions); }
      if (icon !== undefined) { fields.push(`icon=$${idx++}`); vals.push(icon); }
      if (is_enabled !== undefined) { fields.push(`is_enabled=$${idx++}`); vals.push(is_enabled); }
      if (config_json !== undefined) { fields.push(`config_json=$${idx++}`); vals.push(JSON.stringify(config_json)); }
      if (fields.length === 0) return res.status(400).json({ error: 'nothing to update' });
      vals.push(req.params.id);
      const { rows } = await pgPool.query(
        `UPDATE payment_methods SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`,
        vals
      );
      res.json(rows[0] || {});
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/admin/payment-methods/:id", requireAdmin, async (req, res) => {
    try {
      await pgPool.query(`DELETE FROM payment_methods WHERE id=$1`, [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Buy token requests
  app.post("/api/buy-tokens", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { payment_method_id, payment_method_name, token_symbol, token_amount, fiat_amount, fiat_currency, notes } = req.body;
    if (!payment_method_name || !token_symbol || !token_amount) {
      return res.status(400).json({ error: 'payment_method_name, token_symbol, token_amount required' });
    }
    try {
      const reference = `BUY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const { rows } = await pgPool.query(
        `INSERT INTO buy_requests (user_id, payment_method_id, payment_method_name, token_symbol, token_amount, fiat_amount, fiat_currency, reference, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [user.id, payment_method_id || null, payment_method_name, token_symbol, token_amount, fiat_amount || null, fiat_currency || 'USD', reference, notes || '']
      );
      res.json({ ok: true, reference, request: rows[0] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/buy-tokens", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      const { rows } = await pgPool.query(
        `SELECT * FROM buy_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
        [user.id]
      );
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/buy-requests", requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pgPool.query(
        `SELECT br.*, u.username FROM buy_requests br LEFT JOIN users u ON u.id::text=br.user_id ORDER BY br.created_at DESC LIMIT 200`
      );
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/admin/buy-requests/:id", requireAdmin, async (req, res) => {
    const { status, notes } = req.body;
    try {
      const { rows } = await pgPool.query(
        `UPDATE buy_requests SET status=$1, notes=COALESCE($2, notes), processed_at=NOW() WHERE id=$3 RETURNING *`,
        [status, notes || null, req.params.id]
      );
      const buyReq = rows[0];
      if (buyReq && (status === 'approved' || status === 'rejected' || status === 'completed')) {
        const userRes = await pgPool.query(
          `SELECT id, email, telegram_chat_id FROM users WHERE id::text=$1`,
          [buyReq.user_id]
        ).catch(() => ({ rows: [] }));
        const u = userRes.rows[0];
        if (u) {
          const isApproved = status === 'approved' || status === 'completed';
          const emoji = isApproved ? '✅' : '❌';
          const notifTitle = isApproved ? `${emoji} Buy Request Approved` : `${emoji} Buy Request Rejected`;
          const notifBody = isApproved
            ? `Your request to buy ${Number(buyReq.token_amount).toLocaleString()} ${buyReq.token_symbol} via ${buyReq.payment_method_name} has been approved. Tokens will be credited shortly.`
            : `Your request to buy ${Number(buyReq.token_amount).toLocaleString()} ${buyReq.token_symbol} was rejected.${notes ? ` Reason: ${notes}` : ''}`;
          // In-app notification
          (storage as any).createNotification(u.id.toString(), 'buy', notifTitle, notifBody, '/wallet').catch(() => {});
          // Email
          if (u.email) {
            sendBuyRequestStatusEmail(u.email, {
              status,
              reference: buyReq.reference,
              tokenAmount: Number(buyReq.token_amount).toLocaleString(),
              tokenSymbol: buyReq.token_symbol,
              paymentMethod: buyReq.payment_method_name,
              adminNote: notes,
            }).catch(() => {});
          }
          // Telegram
          if (u.telegram_chat_id) {
            sendTelegramMessage(u.telegram_chat_id, `${notifTitle}\n${notifBody}\nRef: ${buyReq.reference}`).catch(() => {});
          }
        }
      }
      res.json(buyReq || {});
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Living Trust ───────────────────────────────────────────────────────────
  const ensureTrustTables = async () => {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS trusts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        fee_paid BOOLEAN DEFAULT FALSE,
        setup_fee_tx TEXT,
        trustee_address TEXT,
        successor_trustee TEXT,
        vault_balance NUMERIC(20,8) DEFAULT 0,
        expires_at TIMESTAMP,
        activated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(() => {});
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS trust_beneficiaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trust_id UUID NOT NULL,
        name TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        percentage NUMERIC(5,2) NOT NULL,
        relationship TEXT,
        condition_note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(() => {});
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS trust_conditions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trust_id UUID NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        trigger_date TIMESTAMP,
        triggered BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(() => {});
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS trust_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        trust_id UUID NOT NULL,
        user_id TEXT NOT NULL,
        amount NUMERIC(20,8) NOT NULL,
        payment_type TEXT NOT NULL,
        tx_hash TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `).catch(() => {});
  };
  ensureTrustTables();

  // List trusts for current user
  app.get("/api/trusts", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      const { rows } = await pgPool.query(`
        SELECT t.*,
          (SELECT COUNT(*) FROM trust_beneficiaries b WHERE b.trust_id = t.id)::int AS total_beneficiaries
        FROM trusts t
        WHERE t.user_id = $1
        ORDER BY t.created_at DESC
      `, [user.id]);
      res.json({ trusts: rows.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        description: r.description,
        status: r.status,
        feePaid: r.fee_paid,
        setupFeeTx: r.setup_fee_tx,
        trusteeAddress: r.trustee_address,
        successorTrustee: r.successor_trustee,
        vaultBalance: r.vault_balance ?? '0',
        totalBeneficiaries: r.total_beneficiaries ?? 0,
        createdAt: r.created_at,
        activatedAt: r.activated_at,
        expiresAt: r.expires_at,
      })) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Create a new trust
  app.post("/api/trusts", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { name, type, description, trusteeAddress, successorTrustee, beneficiaries, conditions, expiresAt } = req.body;
    if (!name || !type) return res.status(400).json({ error: "name and type are required" });
    const VALID_TYPES = ['revocable', 'irrevocable', 'testamentary', 'special_needs', 'spendthrift'];
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: "Invalid trust type" });
    try {
      const { rows } = await pgPool.query(`
        INSERT INTO trusts (user_id, name, type, description, status, trustee_address, successor_trustee, expires_at)
        VALUES ($1, $2, $3, $4, 'pending_payment', $5, $6, $7)
        RETURNING *
      `, [user.id, name.trim(), type, description?.trim() ?? null, trusteeAddress?.trim() ?? null, successorTrustee?.trim() ?? null, expiresAt || null]);
      const trust = rows[0];

      // Insert beneficiaries
      if (Array.isArray(beneficiaries) && beneficiaries.length > 0) {
        for (const b of beneficiaries) {
          await pgPool.query(`
            INSERT INTO trust_beneficiaries (trust_id, name, wallet_address, percentage, relationship, condition_note)
            VALUES ($1,$2,$3,$4,$5,$6)
          `, [trust.id, b.name, b.walletAddress, b.percentage, b.relationship ?? null, b.conditionNote ?? null]).catch(() => {});
        }
      }

      // Insert conditions
      if (Array.isArray(conditions) && conditions.length > 0) {
        for (const c of conditions) {
          await pgPool.query(`
            INSERT INTO trust_conditions (trust_id, type, description, trigger_date)
            VALUES ($1,$2,$3,$4)
          `, [trust.id, c.type, c.description, c.triggerDate || null]).catch(() => {});
        }
      }

      res.json({ ok: true, trustId: trust.id });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Pay setup fee — activates the trust
  app.post("/api/trusts/:id/pay-fee", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { txHash } = req.body;
    try {
      const { rows } = await pgPool.query(`SELECT * FROM trusts WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]);
      if (!rows[0]) return res.status(404).json({ error: "Trust not found" });
      if (rows[0].fee_paid) return res.status(400).json({ error: "Fee already paid" });

      const FEE = 60; // 50 setup + 10 annual
      await pgPool.query(`
        UPDATE trusts SET fee_paid=TRUE, status='active', setup_fee_tx=$1, activated_at=NOW(), updated_at=NOW()
        WHERE id=$2
      `, [txHash ?? null, req.params.id]);
      await pgPool.query(`
        INSERT INTO trust_payments (trust_id, user_id, amount, payment_type, tx_hash)
        VALUES ($1,$2,$3,'setup_fee',$4)
      `, [req.params.id, user.id, FEE, txHash ?? null]).catch(() => {});

      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Deposit to trust vault
  app.post("/api/trusts/:id/deposit", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { amount } = req.body;
    if (!amount || isNaN(parseFloat(amount))) return res.status(400).json({ error: "Invalid amount" });
    try {
      const { rows } = await pgPool.query(`SELECT * FROM trusts WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]);
      if (!rows[0]) return res.status(404).json({ error: "Trust not found" });
      if (rows[0].status !== 'active') return res.status(400).json({ error: "Trust is not active" });

      await pgPool.query(`
        UPDATE trusts SET vault_balance = vault_balance + $1, updated_at=NOW() WHERE id=$2
      `, [parseFloat(amount), req.params.id]);
      await pgPool.query(`
        INSERT INTO trust_payments (trust_id, user_id, amount, payment_type)
        VALUES ($1,$2,$3,'vault_deposit')
      `, [req.params.id, user.id, parseFloat(amount)]).catch(() => {});

      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Get trust details + beneficiaries + conditions
  app.get("/api/trusts/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      const { rows: [trust] } = await pgPool.query(`SELECT * FROM trusts WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]);
      if (!trust) return res.status(404).json({ error: "Trust not found" });
      const { rows: beneficiaries } = await pgPool.query(`SELECT * FROM trust_beneficiaries WHERE trust_id=$1 ORDER BY created_at`, [req.params.id]);
      const { rows: conditions } = await pgPool.query(`SELECT * FROM trust_conditions WHERE trust_id=$1 ORDER BY created_at`, [req.params.id]);
      const { rows: payments } = await pgPool.query(`SELECT * FROM trust_payments WHERE trust_id=$1 ORDER BY created_at DESC LIMIT 20`, [req.params.id]);
      res.json({ trust, beneficiaries, conditions, payments });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Close/delete a draft trust
  app.delete("/api/trusts/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    try {
      const { rows } = await pgPool.query(`SELECT status FROM trusts WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]);
      if (!rows[0]) return res.status(404).json({ error: "Trust not found" });
      if (rows[0].status === 'active') return res.status(400).json({ error: "Cannot delete an active trust — close it first" });
      await pgPool.query(`DELETE FROM trust_beneficiaries WHERE trust_id=$1`, [req.params.id]).catch(() => {});
      await pgPool.query(`DELETE FROM trust_conditions WHERE trust_id=$1`, [req.params.id]).catch(() => {});
      await pgPool.query(`DELETE FROM trusts WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Wallet App Releases ────────────────────────────────────────────────────
  const walletUploadDir = path.join(process.cwd(), "uploads", "wallet");
  if (!fs.existsSync(walletUploadDir)) fs.mkdirSync(walletUploadDir, { recursive: true });

  const walletStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, walletUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `wallet-${Date.now()}${ext}`);
    },
  });
  const walletUpload = multer({
    storage: walletStorage,
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['.apk', '.aab', '.ipa', '.exe', '.dmg', '.zip', '.appx'];
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, allowed.includes(ext));
    },
  });

  app.get("/api/wallet-releases", async (_req, res) => {
    try {
      const { rows } = await pgPool.query(
        `SELECT id, platform, version, original_name, file_size, notes, download_count, created_at
         FROM wallet_releases ORDER BY created_at DESC`
      );
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/admin/wallet-releases/upload", requireAdmin, uploadLimiter, walletUpload.single("file"), async (req, res) => {
    const user = req.user as any;
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const { platform, version, notes } = req.body;
      if (!platform || !version) return res.status(400).json({ error: "platform and version required" });
      const { rows } = await pgPool.query(
        `INSERT INTO wallet_releases (platform, version, filename, original_name, file_size, notes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [platform, version, req.file.filename, req.file.originalname, req.file.size, notes || '', user.id]
      );
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/wallet-releases/download/:id", async (req, res) => {
    try {
      const { rows } = await pgPool.query(`SELECT * FROM wallet_releases WHERE id=$1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: "Release not found" });
      const filePath = path.join(walletUploadDir, rows[0].filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });
      await pgPool.query(`UPDATE wallet_releases SET download_count=download_count+1 WHERE id=$1`, [req.params.id]);
      res.download(filePath, rows[0].original_name);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/admin/wallet-releases/:id", requireAdmin, async (req, res) => {
    try {
      const { rows } = await pgPool.query(`SELECT filename FROM wallet_releases WHERE id=$1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: "Release not found" });
      const filePath = path.join(walletUploadDir, rows[0].filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await pgPool.query(`DELETE FROM wallet_releases WHERE id=$1`, [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── Setup Wizard ────────────────────────────────────────────────────────────

  function readEnvFile(): Record<string, string> {
    const envPath = path.resolve('.env');
    if (!fs.existsSync(envPath)) return {};
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    const result: Record<string, string> = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      result[key] = val;
    }
    return result;
  }

  function writeEnvFile(values: Record<string, string>): void {
    const envPath = path.resolve('.env');
    const existing = readEnvFile();
    const merged = { ...existing, ...values };
    const lines = Object.entries(merged).map(([k, v]) => `${k}=${v}`);
    fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
  }

  const SETUP_READABLE_KEYS = [
    'APP_URL', 'DOMAIN', 'SUBDOMAIN', 'PORT', 'NODE_ENV',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_FROM',
    'TELEGRAM_CHAT_ID',
    'GITHUB_WEBHOOK_SECRET',
    'SETUP_COMPLETE',
  ];
  const SETUP_SECRET_KEYS = [
    'DATABASE_URL', 'SESSION_SECRET', 'SMTP_PASS', 'TELEGRAM_BOT_TOKEN',
    'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY',
  ];

  app.get('/api/setup/status', requireAdmin, (_req, res) => {
    try {
      const env = readEnvFile();
      const values: Record<string, string> = {};
      for (const k of SETUP_READABLE_KEYS) {
        values[k] = process.env[k] ?? env[k] ?? '';
      }
      for (const k of SETUP_SECRET_KEYS) {
        const v = process.env[k] ?? env[k] ?? '';
        values[k] = v ? '••••••••' : '';
      }
      // Always expose DATABASE_URL masked but let frontend know it's set
      res.json({
        setupComplete: (process.env.SETUP_COMPLETE ?? env['SETUP_COMPLETE']) === 'true',
        values,
        keysSet: {
          DATABASE_URL: !!(process.env.DATABASE_URL ?? env['DATABASE_URL']),
          SESSION_SECRET: !!(process.env.SESSION_SECRET ?? env['SESSION_SECRET']),
          SMTP_PASS: !!(process.env.SMTP_PASS ?? env['SMTP_PASS']),
          TELEGRAM_BOT_TOKEN: !!(process.env.TELEGRAM_BOT_TOKEN ?? env['TELEGRAM_BOT_TOKEN']),
        }
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/setup/test-db', requireAdmin, async (req, res) => {
    const { url } = req.body as { url?: string };
    if (!url) return res.status(400).json({ ok: false, error: 'No DATABASE_URL provided' });
    const { Pool: TestPool } = await import('pg');
    const testPool = new TestPool({ connectionString: url, connectionTimeoutMillis: 5000 });
    try {
      const { rows } = await testPool.query('SELECT version()');
      const version = rows[0]?.version?.split(' ').slice(0, 2).join(' ') ?? 'PostgreSQL';
      res.json({ ok: true, version });
    } catch (e: any) {
      res.json({ ok: false, error: e.message });
    } finally {
      await testPool.end().catch(() => {});
    }
  });

  app.post('/api/setup/save', requireAdmin, async (req, res) => {
    try {
      const allowed = new Set([
        'APP_URL', 'DOMAIN', 'SUBDOMAIN', 'PORT', 'NODE_ENV',
        'DATABASE_URL', 'SESSION_SECRET',
        'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
        'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
        'GITHUB_WEBHOOK_SECRET',
        'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY',
        'SETUP_COMPLETE',
      ]);
      const toSave: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.body as Record<string, string>)) {
        if (!allowed.has(k)) continue;
        // Skip masked placeholder values — don't overwrite existing secrets
        if (typeof v === 'string' && v.trim() && !v.startsWith('••')) {
          toSave[k] = v.trim();
        }
      }
      toSave['SETUP_COMPLETE'] = 'true';
      writeEnvFile(toSave);
      // Apply to current process so changes take effect without restart where possible
      for (const [k, v] of Object.entries(toSave)) {
        process.env[k] = v;
      }
      res.json({ ok: true, saved: Object.keys(toSave) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/setup/generate-secret', requireAdmin, (_req, res) => {
    res.json({ value: crypto.randomBytes(32).toString('hex') });
  });

  // ── Query Cache — stats & manual clear ────────────────────────────────────
  app.get('/api/admin/cache-stats', requireAdmin, (_req, res) => {
    res.json(getCacheStats());
  });

  // ── Activity Feed: issue one-time WebSocket auth token ────────────────────
  app.get('/api/admin/ws-token', requireAdmin, (req, res) => {
    const user = req.user as any;
    const token = issueWsToken(user.id, true);
    res.json({ token });
  });

  app.post('/api/admin/cache-clear', requireAdmin, (_req, res) => {
    const result = clearCache();
    res.json({ ok: true, cleared: result });
  });

  // ── Revenue Dashboard ─────────────────────────────────────────────────────
  app.get('/api/admin/revenue', requireAdmin, async (_req, res) => {
    try {
      // ── All-time totals ────────────────────────────────────────────────────
      const [trust, stable, insurance, bridge, buys, cashouts] = await Promise.all([
        pgPool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM trust_payments`),
        pgPool.query(`SELECT COALESCE(SUM(creation_fee_paid),0) AS total FROM user_stablecoins WHERE creation_fee_paid > 0`),
        pgPool.query(`SELECT COALESCE(SUM(premium_paid),0) AS total FROM insurance_policies`),
        pgPool.query(`SELECT COALESCE(SUM(fee),0) AS total FROM bridge_transfers WHERE fee > 0`),
        pgPool.query(`SELECT COALESCE(SUM(fiat_amount),0) AS total, COUNT(*) AS cnt FROM buy_requests WHERE status='completed'`),
        pgPool.query(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt FROM cashout_requests WHERE status='completed'`),
      ]);

      const trustTotal     = Number(trust.rows[0].total);
      const stableTotal    = Number(stable.rows[0].total);
      const insuranceTotal = Number(insurance.rows[0].total);
      const bridgeTotal    = Number(bridge.rows[0].total);
      const buyTotal       = Number(buys.rows[0].total);
      const buyCount       = Number(buys.rows[0].cnt);
      const cashoutTotal   = Number(cashouts.rows[0].total);
      const cashoutCount   = Number(cashouts.rows[0].cnt);
      const grandTotal     = trustTotal + stableTotal + insuranceTotal + bridgeTotal + buyTotal + cashoutTotal;

      // ── 30-day daily breakdown ─────────────────────────────────────────────
      const dailyQ = await pgPool.query(`
        WITH days AS (
          SELECT generate_series(
            NOW()::date - INTERVAL '29 days',
            NOW()::date,
            '1 day'
          )::date AS day
        ),
        trust_daily AS (
          SELECT DATE_TRUNC('day', created_at)::date AS day, SUM(amount) AS amt
          FROM trust_payments WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY 1
        ),
        stable_daily AS (
          SELECT DATE_TRUNC('day', created_at)::date AS day, SUM(creation_fee_paid) AS amt
          FROM user_stablecoins WHERE creation_fee_paid > 0 AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY 1
        ),
        ins_daily AS (
          SELECT DATE_TRUNC('day', created_at)::date AS day, SUM(premium_paid) AS amt
          FROM insurance_policies WHERE created_at > NOW() - INTERVAL '30 days'
          GROUP BY 1
        ),
        bridge_daily AS (
          SELECT DATE_TRUNC('day', created_at)::date AS day, SUM(fee) AS amt
          FROM bridge_transfers WHERE fee > 0 AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY 1
        )
        SELECT
          d.day,
          COALESCE(t.amt, 0) AS trust,
          COALESCE(s.amt, 0) AS stablecoin,
          COALESCE(i.amt, 0) AS insurance,
          COALESCE(b.amt, 0) AS bridge
        FROM days d
        LEFT JOIN trust_daily  t ON t.day = d.day
        LEFT JOIN stable_daily s ON s.day = d.day
        LEFT JOIN ins_daily    i ON i.day = d.day
        LEFT JOIN bridge_daily b ON b.day = d.day
        ORDER BY d.day
      `);

      // ── 12-month monthly totals ────────────────────────────────────────────
      const monthlyQ = await pgPool.query(`
        WITH months AS (
          SELECT generate_series(
            DATE_TRUNC('month', NOW()) - INTERVAL '11 months',
            DATE_TRUNC('month', NOW()),
            '1 month'
          ) AS month
        ),
        all_rev AS (
          SELECT created_at, amount FROM trust_payments
          UNION ALL
          SELECT created_at, creation_fee_paid FROM user_stablecoins WHERE creation_fee_paid > 0
          UNION ALL
          SELECT created_at, premium_paid FROM insurance_policies
          UNION ALL
          SELECT created_at, fee FROM bridge_transfers WHERE fee > 0
          UNION ALL
          SELECT created_at, fiat_amount FROM buy_requests WHERE status='completed' AND fiat_amount IS NOT NULL
          UNION ALL
          SELECT created_at, amount FROM cashout_requests WHERE status='completed'
        ),
        monthly_rev AS (
          SELECT DATE_TRUNC('month', created_at) AS month, SUM(amount) AS total
          FROM all_rev
          GROUP BY 1
        )
        SELECT m.month, COALESCE(r.total, 0) AS total
        FROM months m
        LEFT JOIN monthly_rev r ON r.month = m.month
        ORDER BY m.month
      `);

      // ── Recent 25 revenue events ───────────────────────────────────────────
      const recentQ = await pgPool.query(`
        SELECT id::text, 'trust' AS type, amount, payment_type AS label, created_at
        FROM trust_payments
        UNION ALL
        SELECT id::text, 'stablecoin', creation_fee_paid, name || ' (' || symbol || ')' AS label, created_at
        FROM user_stablecoins WHERE creation_fee_paid > 0
        UNION ALL
        SELECT id::text, 'insurance', premium_paid, 'Policy premium' AS label, created_at
        FROM insurance_policies WHERE premium_paid > 0
        UNION ALL
        SELECT id::text, 'bridge', fee, from_chain || ' → ' || to_chain AS label, created_at
        FROM bridge_transfers WHERE fee > 0
        UNION ALL
        SELECT id::text, 'buy', COALESCE(fiat_amount, token_amount), token_symbol || ' buy (' || payment_method_name || ')' AS label, created_at
        FROM buy_requests WHERE status='completed'
        UNION ALL
        SELECT id::text, 'cashout', amount, asset || ' cashout' AS label, created_at
        FROM cashout_requests WHERE status='completed'
        ORDER BY created_at DESC
        LIMIT 25
      `);

      res.json({
        totals: { trustTotal, stableTotal, insuranceTotal, bridgeTotal, buyTotal, buyCount, cashoutTotal, cashoutCount, grandTotal },
        daily: dailyQ.rows,
        monthly: monthlyQ.rows,
        recent: recentQ.rows.map(r => ({
          id: r.id,
          type: r.type,
          amount: Number(r.amount),
          label: r.label,
          createdAt: r.created_at,
        })),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Server Config (admin-editable .env vars + gyds-config.env) ────────────
  const SERVER_CONFIG_READABLE: string[] = [
    'ADMIN_WALLET', 'FOUNDER_WALLET', 'REWARD_ADDRESS',
    'VITE_HCAPTCHA_SITE_KEY',
    'TELEGRAM_CHAT_ID',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_FROM',
    'WHATSAPP_PHONE_ID',
    'GYDS_BOOTSTRAP_NODES',
    'GYDS_RPC_URL', 'GYDS_RPC_BACKUP_URLS', 'GYDS_LOCAL_RPC_URL',
  ];
  const SERVER_CONFIG_SECRET: string[] = [
    'GITHUB_TOKEN', 'HCAPTCHA_SECRET_KEY',
    'TELEGRAM_BOT_TOKEN',
    'SMTP_PASS',
    'WHATSAPP_TOKEN',
    'TREASURY_PRIVATE_KEY',
  ];
  const SERVER_CONFIG_ALL = [...SERVER_CONFIG_READABLE, ...SERVER_CONFIG_SECRET];

  app.get('/api/admin/server-config', requireAdmin, (_req, res) => {
    try {
      const env = readEnvFile();
      const values: Record<string, string> = {};
      for (const k of SERVER_CONFIG_READABLE) {
        values[k] = process.env[k] ?? env[k] ?? '';
      }
      for (const k of SERVER_CONFIG_SECRET) {
        const v = process.env[k] ?? env[k] ?? '';
        values[k] = v ? '••••••••' : '';
      }
      const keysSet: Record<string, boolean> = {};
      for (const k of SERVER_CONFIG_ALL) {
        keysSet[k] = !!(process.env[k] ?? env[k]);
      }
      res.json({ values, keysSet });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/admin/server-config', requireAdmin, async (req, res) => {
    try {
      const allowed = new Set(SERVER_CONFIG_ALL);
      const toSave: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.body as Record<string, string>)) {
        if (!allowed.has(k)) continue;
        if (typeof v === 'string' && v.trim() && !v.startsWith('••')) {
          toSave[k] = v.trim();
        }
      }

      // Write to .env
      writeEnvFile(toSave);

      // Apply to current process immediately
      for (const [k, v] of Object.entries(toSave)) {
        process.env[k] = v;
      }

      // Write to gyds-config.env (sourced by node install scripts)
      const configPath = path.resolve('gyds-config.env');
      const existing = fs.existsSync(configPath)
        ? fs.readFileSync(configPath, 'utf8').split('\n').filter(l => l && !l.startsWith('#')).reduce((acc, l) => {
            const eq = l.indexOf('=');
            if (eq > 0) acc[l.slice(0, eq).trim()] = l.slice(eq + 1).trim();
            return acc;
          }, {} as Record<string, string>)
        : {};
      const gydsConf: Record<string, string> = { ...existing };
      if (toSave['ADMIN_WALLET'])         gydsConf['GYDS_ADMIN_WALLET'] = toSave['ADMIN_WALLET'];
      if (toSave['FOUNDER_WALLET'])       gydsConf['GYDS_FOUNDER_WALLET'] = toSave['FOUNDER_WALLET'];
      if (toSave['REWARD_ADDRESS'])       { gydsConf['GYDS_REWARD_ADDRESS'] = toSave['REWARD_ADDRESS']; gydsConf['GYDS_MINING_WALLET'] = toSave['REWARD_ADDRESS']; }
      if (toSave['GITHUB_TOKEN'])         gydsConf['GITHUB_TOKEN'] = toSave['GITHUB_TOKEN'];
      if (toSave['TELEGRAM_BOT_TOKEN'])   gydsConf['TELEGRAM_BOT_TOKEN'] = toSave['TELEGRAM_BOT_TOKEN'];
      if (toSave['TELEGRAM_CHAT_ID'])     gydsConf['TELEGRAM_CHAT_ID'] = toSave['TELEGRAM_CHAT_ID'];
      if (toSave['SMTP_HOST'])            gydsConf['SMTP_HOST'] = toSave['SMTP_HOST'];
      if (toSave['SMTP_PORT'])            gydsConf['SMTP_PORT'] = toSave['SMTP_PORT'];
      if (toSave['SMTP_USER'])            gydsConf['SMTP_USER'] = toSave['SMTP_USER'];
      if (toSave['SMTP_PASS'])            gydsConf['SMTP_PASS'] = toSave['SMTP_PASS'];
      if (toSave['SMTP_FROM'])            gydsConf['SMTP_FROM'] = toSave['SMTP_FROM'];
      if (toSave['WHATSAPP_TOKEN'])       gydsConf['WHATSAPP_TOKEN'] = toSave['WHATSAPP_TOKEN'];
      if (toSave['WHATSAPP_PHONE_ID'])    gydsConf['WHATSAPP_PHONE_ID'] = toSave['WHATSAPP_PHONE_ID'];
      if (toSave['GYDS_BOOTSTRAP_NODES']) gydsConf['GYDS_BOOTSTRAP_NODES'] = toSave['GYDS_BOOTSTRAP_NODES'];
      if (toSave['GYDS_RPC_URL'])         gydsConf['GYDS_RPC_URL'] = toSave['GYDS_RPC_URL'];
      if (toSave['GYDS_RPC_BACKUP_URLS']) gydsConf['GYDS_RPC_BACKUP_URLS'] = toSave['GYDS_RPC_BACKUP_URLS'];
      if (toSave['GYDS_LOCAL_RPC_URL'])   gydsConf['GYDS_LOCAL_RPC_URL'] = toSave['GYDS_LOCAL_RPC_URL'];
      const gydsLines = [
        '# GYDSchain shared config — managed via Admin → Server Config',
        ...Object.entries(gydsConf).map(([k, v]) => `${k}=${v}`),
      ];
      fs.writeFileSync(configPath, gydsLines.join('\n') + '\n', 'utf8');

      // Try PM2 restart
      let restarted = false;
      try {
        const { exec } = await import('child_process');
        await new Promise<void>((resolve, reject) => {
          exec('pm2 restart gydschain-api --update-env', { timeout: 15000 }, (err) => {
            if (err) reject(err); else resolve();
          });
        });
        restarted = true;
      } catch {
        // PM2 not available (dev mode / Replit) — changes already applied to process.env
      }

      res.json({ ok: true, saved: Object.keys(toSave), restarted });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Network / RPC config — public, runtime-configurable ───────────────────
  // Lets an admin repoint the app at a real RPC (including their own local
  // nodes) via Server Config without a code deploy. Frontend fetches this on
  // boot and overrides its built-in defaults.
  const DEFAULT_RPC = {
    main: 'https://rpc.netlifegy.com',
    backups: ['https://rpc2.netlifegy.com', 'https://rpc3.netlifegy.com'],
  };
  function effectiveRpcConfig() {
    const main = (process.env.GYDS_RPC_URL || DEFAULT_RPC.main).trim();
    const backups = (process.env.GYDS_RPC_BACKUP_URLS
      ? process.env.GYDS_RPC_BACKUP_URLS.split(',').map(s => s.trim()).filter(Boolean)
      : DEFAULT_RPC.backups);
    const local = process.env.GYDS_LOCAL_RPC_URL
      ? [process.env.GYDS_LOCAL_RPC_URL.trim()]
      : [];
    return { main, backups, local };
  }

  app.get('/api/network-config', (_req, res) => {
    res.json(effectiveRpcConfig());
  });

  app.get('/api/network-config/health', async (_req, res) => {
    try {
      const { main, backups, local } = effectiveRpcConfig();
      const urls = [main, ...backups, ...local];
      const results = await testEndpoints(urls);
      res.json({ results, checkedAt: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
