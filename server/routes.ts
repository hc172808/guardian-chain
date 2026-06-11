import type { Express, Request, Response } from "express";
import { storage } from "./storage";

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

  app.post("/api/faucet/claim", requireAuth, async (req, res) => {
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

  // ── Health Check ───────────────────────────────────────────────────────────
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
