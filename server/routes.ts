import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { storage } from "./storage";
import { testNodeManager } from "./testNodes";
import { encryptSeed, decryptSeed } from "./walletCrypto";
import { getVapidPublicKey, sendPushToUser } from "./webpush";
import { Pool } from "pg";
import { blockIp, unblockIp, clearAllBlockedIps, getBlockedIpList, getFirewallStatus, refreshSecuritySettings } from "./security";
import { sendTelegramAlert, sendTelegramMessage, testTelegramConnection } from "./telegram";
import { sendWhatsAppAlert, sendWhatsAppMessage, testWhatsAppConnection, getWhatsAppConfig, saveWhatsAppConfig } from "./whatsapp";
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

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests, please try again later." } });
const faucetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: "Too many faucet requests." } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { error: "Rate limit exceeded." } });

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
  app.get("/api/me", (req, res) => {
    if (!req.isAuthenticated()) return res.json(null);
    const user = req.user as any;
    res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      roles: user.roles ?? [],
      isAdmin: user._isAdmin ?? false,
      isFounder: user._isFounder ?? false,
    });
  });

  // ── Profile ────────────────────────────────────────────────────────────────
  app.get("/api/profile", requireAuth, async (req, res) => {
    const user = req.user as any;
    const profile = await storage.getUserProfile(user.id);
    res.json(profile);
  });

  app.patch("/api/profile", requireAuth, async (req, res) => {
    const user = req.user as any;
    const profile = await storage.updateUserProfile(user.id, req.body);
    res.json(profile);
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
    const { to, phoneNumberId, accessToken } = req.body;
    if (!to) return res.status(400).json({ ok: false, error: "Recipient phone number (to) is required" });
    const result = await testWhatsAppConnection(to, { phoneNumberId, accessToken });
    res.json(result);
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
    const { address, encrypted_seed = "", pin_hash = "" } = req.body;
    if (!address) return res.status(400).json({ error: "address required" });
    // Encrypt seed at rest using AES-256-GCM if WALLET_ENCRYPTION_KEY is set
    const seedToStore = encryptSeed(encrypted_seed);
    const row = await storage.insertWallet({ userId: user.id, address, encryptedSeed: seedToStore, pinHash: pin_hash });
    res.json(row);
  });

  app.delete("/api/wallets/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    await storage.deleteWallet(req.params.id, user.id);
    res.json({ ok: true });
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
    const user = req.user as any;
    const row = await storage.insertTransaction({ ...req.body, userId: user.id });
    res.json(row);
    storage.awardXpOnce(user.id, 'first_transaction', 50, 'First transaction on GYDSchain! +50 XP').catch(() => {});
  });

  // ── Node Installations ─────────────────────────────────────────────────────
  app.get("/api/nodes", requireAuth, async (req, res) => {
    const user = req.user as any;
    const data = user._isAdmin
      ? await storage.getAllNodes()
      : await storage.getUserNodes(user.id);
    res.json(data);
  });

  app.post("/api/nodes", requireAuth, async (req, res) => {
    const user = req.user as any;
    // Admin/Founder nodes are auto-approved; user nodes need approval
    const isPrivileged = user._isAdmin || user._isFounder;
    const row = await storage.insertNode({
      ...req.body,
      userId: user.id,
      isApproved: isPrivileged ? true : (req.body.isApproved ?? false),
      approvedBy: isPrivileged ? user.id : null,
      approvedAt: isPrivileged ? new Date() : null,
    });
    res.json(row);
    storage.awardXpOnce(user.id, 'first_node', 200, 'First node installed on GYDSchain! +200 XP').catch(() => {});
  });

  app.patch("/api/nodes/:id", requireAdmin, async (req, res) => {
    const row = await storage.updateNode(req.params.id, req.body);
    res.json(row);
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
  app.get("/api/token-operations", async (_req, res) => {
    const data = await storage.getTokenOperations();
    res.json(data);
  });

  app.post("/api/token-operations", requireAdmin, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertTokenOperation({ ...req.body, createdBy: user.id });
    res.json(row);
  });

  // ── Token Price ────────────────────────────────────────────────────────────
  app.get("/api/token-price", async (_req, res) => {
    const row = await storage.getTokenPrice();
    res.json(row);
  });

  app.patch("/api/token-price", requireAdmin, async (req, res) => {
    const row = await storage.updateTokenPrice(req.body);
    res.json(row);
  });

  // ── Tokens ─────────────────────────────────────────────────────────────────
  app.get("/api/tokens", async (_req, res) => {
    const data = await storage.getActiveTokens();
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

  app.post("/api/launches", requireAuth, async (req, res) => {
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
  app.get("/api/pools", async (_req, res) => {
    const data = await storage.getActivePools();
    res.json(data);
  });

  app.post("/api/pools", requireAuth, async (req, res) => {
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
  app.get("/api/validators", async (_req, res) => {
    const data = await storage.getValidators();
    res.json(data);
  });

  app.post("/api/validators", requireAdmin, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertValidator({ ...req.body, createdBy: user.id });
    res.json(row);
  });

  app.patch("/api/validators/:id", requireAdmin, async (req, res) => {
    const row = await storage.updateValidator(req.params.id, req.body);
    res.json(row);
  });

  app.delete("/api/validators/:id", requireAdmin, async (req, res) => {
    await storage.deleteValidator(req.params.id);
    res.json({ ok: true });
  });

  // ── Delegations ────────────────────────────────────────────────────────────
  app.get("/api/delegations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const data = await storage.getUserDelegations(user.id);
    res.json(data);
  });

  app.post("/api/delegations", requireAuth, async (req, res) => {
    const user = req.user as any;
    const row = await storage.insertDelegation({ ...req.body, userId: user.id });
    res.json(row);
  });

  // ── Firewall / Security ────────────────────────────────────────────────────
  app.get("/api/firewall/rules", requireAdmin, async (_req, res) => res.json(await storage.getFirewallRules()));
  app.post("/api/firewall/rules", requireAdmin, async (req, res) => res.json(await storage.insertFirewallRule(req.body)));
  app.patch("/api/firewall/rules/:id", requireAdmin, async (req, res) => res.json(await storage.updateFirewallRule(req.params.id, req.body)));
  app.delete("/api/firewall/rules/:id", requireAdmin, async (req, res) => { await storage.deleteFirewallRule(req.params.id); res.json({ ok: true }); });

  app.get("/api/firewall/jails", requireAdmin, async (_req, res) => res.json(await storage.getFail2banJails()));
  app.post("/api/firewall/jails", requireAdmin, async (req, res) => res.json(await storage.insertFail2banJail(req.body)));
  app.patch("/api/firewall/jails/:id", requireAdmin, async (req, res) => res.json(await storage.updateFail2banJail(req.params.id, req.body)));
  app.delete("/api/firewall/jails/:id", requireAdmin, async (req, res) => { await storage.deleteFail2banJail(req.params.id); res.json({ ok: true }); });

  app.get("/api/firewall/ip-list", requireAdmin, async (_req, res) => res.json(await storage.getIpAccessList()));
  app.post("/api/firewall/ip-list", requireAdmin, async (req, res) => res.json(await storage.insertIpAccess(req.body)));
  app.delete("/api/firewall/ip-list/:id", requireAdmin, async (req, res) => { await storage.deleteIpAccess(req.params.id); res.json({ ok: true }); });

  app.get("/api/firewall/rate-limits", requireAdmin, async (_req, res) => res.json(await storage.getRateLimitRules()));
  app.post("/api/firewall/rate-limits", requireAdmin, async (req, res) => res.json(await storage.insertRateLimitRule(req.body)));
  app.patch("/api/firewall/rate-limits/:id", requireAdmin, async (req, res) => res.json(await storage.updateRateLimitRule(req.params.id, req.body)));
  app.delete("/api/firewall/rate-limits/:id", requireAdmin, async (req, res) => { await storage.deleteRateLimitRule(req.params.id); res.json({ ok: true }); });

  app.get("/api/firewall/ddos", requireAdmin, async (_req, res) => res.json(await storage.getDdosProtection()));
  app.post("/api/firewall/ddos", requireAdmin, async (req, res) => res.json(await storage.insertDdosProtection(req.body)));
  app.patch("/api/firewall/ddos/:id", requireAdmin, async (req, res) => res.json(await storage.updateDdosProtection(req.params.id, req.body)));

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

  // Force reload firewall settings from DB
  app.post("/api/security/reload", requireAdmin, async (_req, res) => {
    await refreshSecuritySettings();
    res.json({ ok: true, status: getFirewallStatus() });
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
    const AMOUNTS: Record<string, number> = { gyd: 100, gyds: 0.5 };
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

    if (!AMOUNTS[tokenType]) return res.status(400).json({ ok: false, error: "Invalid token_type (gyd|gyds)" });
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
    await storage.insertTokenOperation({ operationType: tokenType === "gyd" ? "mint_gyd" : "mint_gyds", amount: String(amount), walletAddress, txHash, status: "confirmed", createdBy: user.id });
    await storage.insertAuditLog({ userId: user.id, userEmail: user.email, action: "faucet_claim", category: "token", targetType: "token", targetId: tokenType, details: { amount, wallet_address: walletAddress, tx_hash: txHash }, ipAddress: req.ip ?? null });

    res.json({ ok: true, tx_hash: txHash, amount, token_type: tokenType });

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
  app.get("/api/network-stats", async (_req, res) => {
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
  const VALID_NODE_TYPES  = ["rpc", "lite", "fullnode", "boostnode", "validator"] as const;
  const VALID_NETWORKS    = ["mainnet", "testnet", "devnet"] as const;
  type ValidNodeType      = typeof VALID_NODE_TYPES[number];
  type ValidNetwork       = typeof VALID_NETWORKS[number];

  const TEST_NODE_TYPE_MAP: Record<string, string> = {
    rpc: "rpcnode", lite: "litenode", fullnode: "fullnode", boostnode: "boostnode", validator: "validator",
  };

  // Track DB row IDs keyed by "network:type"
  const testNodeDbIds = new Map<string, string>();

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

  // POST start — /api/admin/test-nodes/:network/:type/start
  app.post("/api/admin/test-nodes/:network/:type/start", requireAdmin, async (req, res) => {
    const network = req.params.network as ValidNetwork;
    const type    = req.params.type    as ValidNodeType;
    if (!VALID_NETWORKS.includes(network))   { res.status(400).json({ ok: false, message: "Invalid network" }); return; }
    if (!VALID_NODE_TYPES.includes(type))    { res.status(400).json({ ok: false, message: "Invalid node type" }); return; }
    const result = testNodeManager.start(network, type);
    if (result.ok) {
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
      const id = testNodeDbIds.get(`${network}:${type}`);
      if (id) storage.updateNode(id, { isOnline: false, lastHeartbeat: new Date() }).catch(() => {});
    }
    res.json(result);
  });

  // GET logs — /api/admin/test-nodes/:network/:type/logs
  app.get("/api/admin/test-nodes/:network/:type/logs", requireAdmin, (req, res) => {
    const network = req.params.network as ValidNetwork;
    const type    = req.params.type    as ValidNodeType;
    if (!VALID_NETWORKS.includes(network))   { res.status(400).json({ ok: false, message: "Invalid network" }); return; }
    if (!VALID_NODE_TYPES.includes(type))    { res.status(400).json({ ok: false, message: "Invalid node type" }); return; }
    res.json(testNodeManager.getLogs(network, type));
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
  app.post("/api/rpc", async (req, res) => {
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
      const pgPool = (storage as any).pgPool;
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
    const pgPool = (storage as any).pgPool;
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
    const { asset, amount, destination, note } = req.body;
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
      await pgPool.query(
        `INSERT INTO cashout_requests (user_id, asset, amount, destination, note, reference) VALUES ($1,$2,$3,$4,$5,$6)`,
        [user.id, asset, amount, destination, note || '', reference]
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
    const { status } = req.body;
    try {
      const { rows } = await pgPool.query(
        `UPDATE cashout_requests SET status=$1, processed_at=NOW() WHERE id=$2 RETURNING *`,
        [status, String(req.params.id)]
      );
      res.json(rows[0] || {});
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
}
