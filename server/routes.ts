import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { testNodeManager } from "./testNodes";

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
    res.json(data);
  });

  app.post("/api/wallets", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { address, encrypted_seed = "", pin_hash = "" } = req.body;
    if (!address) return res.status(400).json({ error: "address required" });
    const row = await storage.insertWallet({ userId: user.id, address, encryptedSeed: encrypted_seed, pinHash: pin_hash });
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
    const row = await storage.insertNode({ ...req.body, userId: user.id });
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
    const { token_type, wallet_address } = req.body;
    const tokenType = String(token_type ?? "").toLowerCase();
    const walletAddress = String(wallet_address ?? "").trim();

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

  // ── Test Nodes (admin/founder only) ────────────────────────────────────────
  app.get("/api/admin/test-nodes/status", requireAdmin, (_req, res) => {
    res.json(testNodeManager.status());
  });

  const VALID_NODE_TYPES = ["rpc", "lite", "fullnode", "boostnode"] as const;
  type ValidNodeType = typeof VALID_NODE_TYPES[number];

  app.post("/api/admin/test-nodes/:type/start", requireAdmin, (req, res) => {
    const type = req.params.type as ValidNodeType;
    if (!VALID_NODE_TYPES.includes(type)) { res.status(400).json({ ok: false, message: "Invalid node type" }); return; }
    const result = testNodeManager.start(type);
    res.json(result);
  });

  app.post("/api/admin/test-nodes/:type/stop", requireAdmin, (req, res) => {
    const type = req.params.type as ValidNodeType;
    if (!VALID_NODE_TYPES.includes(type)) { res.status(400).json({ ok: false, message: "Invalid node type" }); return; }
    const result = testNodeManager.stop(type);
    res.json(result);
  });

  app.get("/api/admin/test-nodes/:type/logs", requireAdmin, (req, res) => {
    const type = req.params.type as ValidNodeType;
    if (!VALID_NODE_TYPES.includes(type)) { res.status(400).json({ ok: false, message: "Invalid node type" }); return; }
    res.json(testNodeManager.getLogs(type));
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
      res.json({ tps: 1250, chain_id: 13370, ...stats });
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

  // ── Webhook Deliveries ──────────────────────────────────────────────────────
  app.get("/api/webhooks/:id/deliveries", requireAuth, async (req, res) => {
    try {
      res.json(await (storage as any).getWebhookDeliveries((req.user as any).id.toString(), req.params.id));
    } catch (e: any) { res.status(404).json({ error: e.message }); }
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
              const d = await r.json();
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
        const d = await r.json();
        return { url, reachable: !!d.result, blockNumber: d.result };
      } catch (e: any) { return { url, reachable: false, error: e.message }; }
    };
    const rpcChecks = await Promise.all(rpcEndpoints.map(checkRpc));
    const allRpcOk = rpcChecks.some((r: any) => r.reachable);
    res.json({ status: allRpcOk ? "healthy" : "degraded", timestamp: new Date().toISOString(), chain_id: 13370, components: { rpc: rpcChecks } });
  });
}
