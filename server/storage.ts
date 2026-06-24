import { db } from "./db";
import { users, userRoles, profiles, wallets, nodeInstallations, transactions,
  documentation, adminConfig, tokenOperations, tokenPrice, tokens, tokenLaunches,
  liquidityPools, tokenWatchlist, tokenPriceAlerts, networkValidators,
  validatorDelegations, firewallRules, fail2banJails, ipAccessList,
  rateLimitRules, ddosProtection, auditLogs, faucetClaims, passwordResetTokens,
  orders, vaultPositions, userFeatures,
  governanceProposals, governanceVotes,
  communityPosts, communityComments, communityVotes } from "../shared/schema";
import { eq, and, gte, desc, sql, count, inArray } from "drizzle-orm";
import { Pool } from "pg";

const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

export const storage = {
  // ── Users ────────────────────────────────────────────────────────────────
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  },

  async upsertUser(data: { id: string; email?: string | null; firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null }) {
    const [user] = await db.insert(users).values({
      id: data.id,
      email: data.email ?? null,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      profileImageUrl: data.profileImageUrl ?? null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: users.id,
      set: { email: data.email ?? null, firstName: data.firstName ?? null, lastName: data.lastName ?? null, profileImageUrl: data.profileImageUrl ?? null, updatedAt: new Date() },
    }).returning();

    // Ensure profile exists
    await db.insert(profiles).values({ userId: data.id, email: data.email ?? null })
      .onConflictDoNothing();

    // Ensure default role
    await db.insert(userRoles).values({ userId: data.id, role: "user" })
      .onConflictDoNothing();

    return user;
  },

  async getUserByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user ?? null;
  },

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user ?? null;
  },

  async getUserByUsernameOrEmail(input: string) {
    const byUsername = await db.select().from(users).where(eq(users.username, input));
    if (byUsername[0]) return byUsername[0];
    const byEmail = await db.select().from(users).where(eq(users.email, input));
    return byEmail[0] ?? null;
  },

  async getUserByWallet(walletAddress: string) {
    const lower = walletAddress.toLowerCase();
    const rows = await db.execute(sql`SELECT * FROM users WHERE LOWER(wallet_address) = ${lower} LIMIT 1`);
    return (rows.rows[0] as any) ?? null;
  },

  async createLocalUser(data: { username: string; passwordHash: string; email?: string | null }) {
    const id = `local_${data.username}_${Date.now()}`;
    const [user] = await db.insert(users).values({
      id,
      username: data.username,
      passwordHash: data.passwordHash,
      email: data.email ?? null,
      updatedAt: new Date(),
    }).returning();
    await db.insert(profiles).values({ userId: id, email: data.email ?? null, username: data.username }).onConflictDoNothing();
    await db.insert(userRoles).values({ userId: id, role: "user" }).onConflictDoNothing();
    return user;
  },

  async createWalletUser(walletAddress: string) {
    const id = `web3_${walletAddress.slice(2, 10)}_${Date.now()}`;
    const shortAddr = `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;
    const [user] = await db.insert(users).values({
      id,
      walletAddress,
      firstName: shortAddr,
      updatedAt: new Date(),
    }).returning();
    await db.insert(profiles).values({ userId: id }).onConflictDoNothing();
    await db.insert(userRoles).values({ userId: id, role: "user" }).onConflictDoNothing();
    return user;
  },

  async setUserNonce(walletAddress: string, nonce: string) {
    // Upsert: update nonce if wallet user exists, otherwise just store in a temp record
    const existing = await db.select().from(users).where(eq(users.walletAddress, walletAddress));
    if (existing.length > 0) {
      await db.update(users).set({ authNonce: nonce }).where(eq(users.walletAddress, walletAddress));
    } else {
      // Pre-create a placeholder so nonce can be stored before first login
      const id = `web3_pending_${walletAddress.slice(2, 10)}_${Date.now()}`;
      await db.insert(users).values({ id, walletAddress, authNonce: nonce, updatedAt: new Date() })
        .onConflictDoUpdate({ target: users.walletAddress, set: { authNonce: nonce } });
    }
  },

  async getUserNonce(walletAddress: string) {
    const [user] = await db.select({ authNonce: users.authNonce }).from(users).where(eq(users.walletAddress, walletAddress));
    return user?.authNonce ?? null;
  },

  async clearUserNonce(walletAddress: string) {
    await db.update(users).set({ authNonce: null }).where(eq(users.walletAddress, walletAddress));
  },

  async updateUserPassword(userId: string, passwordHash: string) {
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
  },

  async getUserRoles(userId: string) {
    return db.select().from(userRoles).where(eq(userRoles.userId, userId));
  },

  async getAllUsersWithRoles() {
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    const allRoles = await db.select().from(userRoles);
    const roleMap: Record<string, string[]> = {};
    for (const r of allRoles) {
      if (!roleMap[r.userId]) roleMap[r.userId] = [];
      roleMap[r.userId].push(r.role);
    }
    return allUsers.map(u => ({
      id: u.id,
      email: u.email,
      username: u.username,
      walletAddress: u.walletAddress,
      firstName: u.firstName,
      lastName: u.lastName,
      isBanned: u.isBanned,
      totpEnabled: u.totpEnabled,
      createdAt: u.createdAt,
      roles: roleMap[u.id] ?? ["user"],
      primaryRole: (roleMap[u.id] ?? []).includes("founder") ? "founder"
        : (roleMap[u.id] ?? []).includes("admin") ? "admin" : "user",
    }));
  },

  async getUsersWithWhatsApp() {
    const res = await pgPool.query(
      `SELECT u.id, u.username, u.first_name, p.metadata->>'whatsapp_number' AS whatsapp_number
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE p.metadata->>'whatsapp_number' IS NOT NULL
       ORDER BY u.username`
    );
    return res.rows.map(r => ({
      id: r.id,
      username: r.username,
      display_name: r.first_name || r.username,
      whatsapp_number: r.whatsapp_number,
    }));
  },

  async getUserProfile(userId: string) {
    const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId));
    return row ?? null;
  },

  async updateUserProfile(userId: string, data: Record<string, unknown>) {
    const [row] = await db.update(profiles).set({ ...data, updatedAt: new Date() } as any)
      .where(eq(profiles.userId, userId)).returning();
    return row;
  },

  async getUserProfileByUsername(username: string) {
    const [row] = await db.select().from(profiles).where(eq(profiles.username as any, username));
    return row ?? null;
  },

  // ── Wallets ───────────────────────────────────────────────────────────────
  async getUserWallets(userId: string) {
    const res = await pgPool.query(
      `SELECT id, user_id AS "userId", address, encrypted_seed AS "encryptedSeed",
              pin_hash AS "pinHash", created_at AS "createdAt"
       FROM wallets WHERE user_id=$1
       ORDER BY created_at ASC`,
      [userId]
    );
    return res.rows;
  },

  async insertWallet(data: typeof wallets.$inferInsert) {
    const [row] = await db.insert(wallets).values(data).returning();
    return row;
  },

  async deleteWallet(id: string, userId: string) {
    await db.delete(wallets).where(and(eq(wallets.id, id), eq(wallets.userId, userId)));
  },

  async updateWallet(id: string, userId: string, data: { encryptedSeed?: string; pinHash?: string }) {
    const [row] = await db.update(wallets)
      .set(data)
      .where(and(eq(wallets.id, id), eq(wallets.userId, userId)))
      .returning();
    return row ?? null;
  },

  // ── Transactions ──────────────────────────────────────────────────────────
  async getUserTransactions(userId: string) {
    return db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.createdAt));
  },

  async getAllTransactions() {
    return db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(200);
  },

  async insertTransaction(data: typeof transactions.$inferInsert) {
    const [row] = await db.insert(transactions).values(data).returning();
    return row;
  },

  async countTransactions() {
    const [{ value }] = await db.select({ value: count() }).from(transactions);
    return Number(value);
  },

  // ── Node Installations ────────────────────────────────────────────────────
  async getUserNodes(userId: string) {
    return db.select().from(nodeInstallations).where(eq(nodeInstallations.userId, userId));
  },

  async getAllNodes() {
    return db.select().from(nodeInstallations).orderBy(desc(nodeInstallations.createdAt));
  },

  async insertNode(data: typeof nodeInstallations.$inferInsert) {
    const [row] = await db.insert(nodeInstallations).values(data).returning();
    return row;
  },

  async updateNode(id: string, data: Partial<typeof nodeInstallations.$inferInsert>) {
    const [row] = await db.update(nodeInstallations).set(data as any).where(eq(nodeInstallations.id, id)).returning();
    return row;
  },

  async deleteNode(id: string) {
    await db.delete(nodeInstallations).where(eq(nodeInstallations.id, id));
  },

  async countOnlineNodes() {
    const [{ value }] = await db.select({ value: count() }).from(nodeInstallations).where(eq(nodeInstallations.isOnline, true));
    return Number(value);
  },

  async getLiveNodes(cutoff: Date) {
    return db.select({ hashRate: nodeInstallations.hashRate, lastHeartbeat: nodeInstallations.lastHeartbeat })
      .from(nodeInstallations)
      .where(and(eq(nodeInstallations.isOnline, true), eq(nodeInstallations.isApproved, true), gte(nodeInstallations.lastHeartbeat, cutoff)));
  },

  // ── Documentation ─────────────────────────────────────────────────────────
  async getDoc(slug: string) {
    const [row] = await db.select().from(documentation).where(eq(documentation.slug, slug));
    return row ?? null;
  },

  async getAllDocs() {
    return db.select().from(documentation);
  },

  async upsertDoc(slug: string, data: Partial<typeof documentation.$inferInsert>) {
    const [row] = await db.insert(documentation).values({ slug, title: "", content: "", ...data })
      .onConflictDoUpdate({ target: documentation.slug, set: { ...data, updatedAt: new Date() } as any })
      .returning();
    return row;
  },

  // ── Admin Config ──────────────────────────────────────────────────────────
  async getConfig(key: string) {
    const [row] = await db.select().from(adminConfig).where(eq(adminConfig.configKey, key));
    return row ?? null;
  },

  async getAllConfigs() {
    return db.select().from(adminConfig);
  },

  async upsertConfig(key: string, value: unknown, updatedBy?: string) {
    const [row] = await db.insert(adminConfig).values({ configKey: key, configValue: value as any, updatedBy: updatedBy ?? null })
      .onConflictDoUpdate({ target: adminConfig.configKey, set: { configValue: value as any, updatedBy: updatedBy ?? null, updatedAt: new Date() } })
      .returning();
    return row;
  },

  // ── Token Operations ──────────────────────────────────────────────────────
  async getTokenOperations() {
    return db.select().from(tokenOperations).orderBy(desc(tokenOperations.createdAt));
  },

  async insertTokenOperation(data: typeof tokenOperations.$inferInsert) {
    const [row] = await db.insert(tokenOperations).values(data).returning();
    return row;
  },

  // ── Token Price ───────────────────────────────────────────────────────────
  async getTokenPrice() {
    const [row] = await db.select().from(tokenPrice).orderBy(desc(tokenPrice.updatedAt)).limit(1);
    return row ?? null;
  },

  async updateTokenPrice(data: Partial<typeof tokenPrice.$inferInsert>) {
    const existing = await this.getTokenPrice();
    if (existing) {
      const [row] = await db.update(tokenPrice).set({ ...data, updatedAt: new Date() } as any).where(eq(tokenPrice.id, existing.id)).returning();
      return row;
    } else {
      const [row] = await db.insert(tokenPrice).values(data as any).returning();
      return row;
    }
  },

  // ── Tokens ────────────────────────────────────────────────────────────────
  async getActiveTokens() {
    return db.select().from(tokens).where(eq(tokens.isActive, true)).orderBy(desc(tokens.createdAt));
  },

  async getToken(id: string) {
    const [row] = await db.select().from(tokens).where(eq(tokens.id, id));
    return row ?? null;
  },

  async getTokenByAddress(address: string) {
    const [row] = await db.select().from(tokens).where(eq(tokens.address, address));
    return row ?? null;
  },

  async insertToken(data: typeof tokens.$inferInsert) {
    const [row] = await db.insert(tokens).values(data).returning();
    return row;
  },

  async updateToken(id: string, data: Partial<typeof tokens.$inferInsert>) {
    const [row] = await db.update(tokens).set({ ...data, updatedAt: new Date() } as any).where(eq(tokens.id, id)).returning();
    return row;
  },

  async countTokens() {
    const [{ value }] = await db.select({ value: count() }).from(tokens);
    return Number(value);
  },

  // ── Token Launches ────────────────────────────────────────────────────────
  async getActiveLaunches() {
    return db.select().from(tokenLaunches)
      .where(inArray(tokenLaunches.status, ["live", "upcoming", "completed"]))
      .orderBy(desc(tokenLaunches.createdAt));
  },

  async insertLaunch(data: typeof tokenLaunches.$inferInsert) {
    const [row] = await db.insert(tokenLaunches).values(data).returning();
    return row;
  },

  // ── Liquidity Pools ───────────────────────────────────────────────────────
  async getActivePools() {
    return db.select().from(liquidityPools).where(eq(liquidityPools.isActive, true));
  },

  async insertPool(data: typeof liquidityPools.$inferInsert) {
    const [row] = await db.insert(liquidityPools).values(data).returning();
    return row;
  },

  // ── Token Watchlist ───────────────────────────────────────────────────────
  async getUserWatchlist(userId: string) {
    return db.select().from(tokenWatchlist).where(eq(tokenWatchlist.userId, userId));
  },

  async addToWatchlist(userId: string, tokenId: string) {
    const [row] = await db.insert(tokenWatchlist).values({ userId, tokenId }).onConflictDoNothing().returning();
    return row;
  },

  async removeFromWatchlist(userId: string, tokenId: string) {
    await db.delete(tokenWatchlist).where(and(eq(tokenWatchlist.userId, userId), eq(tokenWatchlist.tokenId, tokenId)));
  },

  // ── Token Price Alerts ────────────────────────────────────────────────────
  async getUserAlerts(userId: string) {
    return db.select().from(tokenPriceAlerts).where(eq(tokenPriceAlerts.userId, userId));
  },

  async insertAlert(data: typeof tokenPriceAlerts.$inferInsert) {
    const [row] = await db.insert(tokenPriceAlerts).values(data).returning();
    return row;
  },

  async deleteAlert(id: string, userId: string) {
    await db.delete(tokenPriceAlerts).where(and(eq(tokenPriceAlerts.id, id), eq(tokenPriceAlerts.userId, userId)));
  },

  // ── Network Validators ────────────────────────────────────────────────────
  async getValidators() {
    return db.select().from(networkValidators).orderBy(desc(networkValidators.stake));
  },

  async insertValidator(data: typeof networkValidators.$inferInsert) {
    const [row] = await db.insert(networkValidators).values(data).returning();
    return row;
  },

  async updateValidator(id: string, data: Partial<typeof networkValidators.$inferInsert>) {
    const [row] = await db.update(networkValidators).set({ ...data, updatedAt: new Date() } as any).where(eq(networkValidators.id, id)).returning();
    return row;
  },

  async deleteValidator(id: string) {
    await db.delete(networkValidators).where(eq(networkValidators.id, id));
  },

  async countActiveValidators() {
    const [{ value }] = await db.select({ value: count() }).from(networkValidators).where(eq(networkValidators.isActive, true));
    return Number(value);
  },

  // ── Delegations ───────────────────────────────────────────────────────────
  async getUserDelegations(userId: string) {
    return db.select().from(validatorDelegations).where(eq(validatorDelegations.userId, userId));
  },

  async insertDelegation(data: typeof validatorDelegations.$inferInsert) {
    const [row] = await db.insert(validatorDelegations).values(data).returning();
    return row;
  },

  // ── Firewall Rules ────────────────────────────────────────────────────────
  async getFirewallRules() { return db.select().from(firewallRules); },
  async insertFirewallRule(data: typeof firewallRules.$inferInsert) {
    const [row] = await db.insert(firewallRules).values(data).returning(); return row;
  },
  async updateFirewallRule(id: string, data: any) {
    const [row] = await db.update(firewallRules).set(data).where(eq(firewallRules.id, id)).returning(); return row;
  },
  async deleteFirewallRule(id: string) { await db.delete(firewallRules).where(eq(firewallRules.id, id)); },

  async getFail2banJails() { return db.select().from(fail2banJails); },
  async insertFail2banJail(data: typeof fail2banJails.$inferInsert) {
    const [row] = await db.insert(fail2banJails).values(data).returning(); return row;
  },
  async updateFail2banJail(id: string, data: any) {
    const [row] = await db.update(fail2banJails).set(data).where(eq(fail2banJails.id, id)).returning(); return row;
  },
  async deleteFail2banJail(id: string) { await db.delete(fail2banJails).where(eq(fail2banJails.id, id)); },

  async getIpAccessList() { return db.select().from(ipAccessList); },
  async insertIpAccess(data: typeof ipAccessList.$inferInsert) {
    const [row] = await db.insert(ipAccessList).values(data).returning(); return row;
  },
  async deleteIpAccess(id: string) { await db.delete(ipAccessList).where(eq(ipAccessList.id, id)); },

  async getRateLimitRules() { return db.select().from(rateLimitRules); },
  async insertRateLimitRule(data: typeof rateLimitRules.$inferInsert) {
    const [row] = await db.insert(rateLimitRules).values(data).returning(); return row;
  },
  async updateRateLimitRule(id: string, data: any) {
    const [row] = await db.update(rateLimitRules).set(data).where(eq(rateLimitRules.id, id)).returning(); return row;
  },
  async deleteRateLimitRule(id: string) { await db.delete(rateLimitRules).where(eq(rateLimitRules.id, id)); },

  async getDdosProtection() { return db.select().from(ddosProtection); },
  async insertDdosProtection(data: typeof ddosProtection.$inferInsert) {
    const [row] = await db.insert(ddosProtection).values(data).returning(); return row;
  },
  async updateDdosProtection(id: string, data: any) {
    const [row] = await db.update(ddosProtection).set(data).where(eq(ddosProtection.id, id)).returning(); return row;
  },

  // ── Audit Logs ────────────────────────────────────────────────────────────
  async getAuditLogs(userId?: string) {
    if (userId) {
      return db.select().from(auditLogs).where(eq(auditLogs.userId, userId)).orderBy(desc(auditLogs.createdAt)).limit(500);
    }
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(500);
  },

  async insertAuditLog(data: typeof auditLogs.$inferInsert) {
    const [row] = await db.insert(auditLogs).values(data).returning();
    return row;
  },

  // ── Faucet Claims ─────────────────────────────────────────────────────────
  async getRecentFaucetClaim(userId: string, tokenType: string, since: Date) {
    const rows = await db.select().from(faucetClaims)
      .where(and(eq(faucetClaims.userId, userId), eq(faucetClaims.tokenType, tokenType), gte(faucetClaims.createdAt, since)))
      .limit(1);
    return rows[0] ?? null;
  },

  async insertFaucetClaim(data: typeof faucetClaims.$inferInsert) {
    const [row] = await db.insert(faucetClaims).values(data).returning();
    return row;
  },

  // ── TOTP ──────────────────────────────────────────────────────────────────
  async setTotpSecret(userId: string, secret: string) {
    await db.update(users).set({ totpSecret: secret, updatedAt: new Date() }).where(eq(users.id, userId));
  },

  async enableTotp(userId: string) {
    await db.update(users).set({ totpEnabled: true, updatedAt: new Date() }).where(eq(users.id, userId));
  },

  async disableTotp(userId: string) {
    await db.update(users).set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() }).where(eq(users.id, userId));
  },

  async getUserTotp(userId: string) {
    const [row] = await db.select({ totpSecret: users.totpSecret, totpEnabled: users.totpEnabled }).from(users).where(eq(users.id, userId));
    return row ?? null;
  },

  // ── Password Reset Tokens ─────────────────────────────────────────────────
  async createPasswordResetToken(userId: string, token: string, expiresAt: Date) {
    const [row] = await db.insert(passwordResetTokens).values({ userId, token, expiresAt }).returning();
    return row;
  },

  async getPasswordResetToken(token: string) {
    const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
    return row ?? null;
  },

  async markPasswordResetTokenUsed(token: string) {
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.token, token));
  },

  async deleteExpiredPasswordResetTokens() {
    await db.delete(passwordResetTokens).where(sql`expires_at < now()`);
  },

  // ── Admin: Ban/Unban + Role management ────────────────────────────────────
  async setBanStatus(userId: string, banned: boolean) {
    await db.update(users).set({ isBanned: banned, updatedAt: new Date() }).where(eq(users.id, userId));
  },

  async setUserRole(userId: string, role: "user" | "admin" | "founder") {
    await db.delete(userRoles).where(and(eq(userRoles.userId, userId), sql`role != 'user'`));
    if (role !== "user") {
      await db.insert(userRoles).values({ userId, role }).onConflictDoNothing();
    }
    await db.insert(userRoles).values({ userId, role: "user" }).onConflictDoNothing();
  },

  async getRecentFaucetClaimsForUser(userId: string, since: Date) {
    return db.select().from(faucetClaims)
      .where(and(eq(faucetClaims.userId, userId), gte(faucetClaims.createdAt, since)))
      .orderBy(desc(faucetClaims.createdAt));
  },

  // ── Governance ────────────────────────────────────────────────────────────
  async getGovernanceProposals() {
    return db.select().from(governanceProposals).orderBy(desc(governanceProposals.createdAt));
  },

  async insertGovernanceProposal(data: typeof governanceProposals.$inferInsert) {
    const [row] = await db.insert(governanceProposals).values(data).returning();
    return row;
  },

  async getUserGovernanceVotes(userId: string) {
    return db.select().from(governanceVotes).where(eq(governanceVotes.userId, userId));
  },

  async getProposalVote(proposalId: string, userId: string) {
    const [row] = await db.select().from(governanceVotes)
      .where(and(eq(governanceVotes.proposalId, proposalId), eq(governanceVotes.userId, userId)));
    return row ?? null;
  },

  async insertGovernanceVote(data: typeof governanceVotes.$inferInsert) {
    const [row] = await db.insert(governanceVotes).values(data).returning();
    return row;
  },

  async incrementProposalVotes(proposalId: string, choice: 'for' | 'against' | 'abstain') {
    const col = choice === 'for' ? governanceProposals.votesFor
      : choice === 'against' ? governanceProposals.votesAgainst
      : governanceProposals.votesAbstain;
    await db.update(governanceProposals)
      .set({ [col.name]: sql`${col} + 1` })
      .where(eq(governanceProposals.id, proposalId));
  },

  // ── Community ─────────────────────────────────────────────────────────────
  async getCommunityPosts() {
    const rows = await db.select({
      id: communityPosts.id, userId: communityPosts.userId,
      title: communityPosts.title, body: communityPosts.body,
      postType: communityPosts.postType, upvotes: communityPosts.upvotes,
      downvotes: communityPosts.downvotes, replyCount: communityPosts.replyCount,
      pinned: communityPosts.pinned, createdAt: communityPosts.createdAt,
      authorEmail: users.email,
    }).from(communityPosts)
      .leftJoin(users, eq(communityPosts.userId, users.id))
      .orderBy(desc(communityPosts.pinned), desc(communityPosts.createdAt))
      .limit(200);
    return rows;
  },

  async insertCommunityPost(data: typeof communityPosts.$inferInsert) {
    const [row] = await db.insert(communityPosts).values(data).returning();
    return row;
  },

  async getCommunityComments(postId: string) {
    return db.select({
      id: communityComments.id, userId: communityComments.userId,
      body: communityComments.body, upvotes: communityComments.upvotes,
      createdAt: communityComments.createdAt, authorEmail: users.email,
    }).from(communityComments)
      .leftJoin(users, eq(communityComments.userId, users.id))
      .where(eq(communityComments.postId, postId))
      .orderBy(communityComments.createdAt);
  },

  async insertCommunityComment(data: typeof communityComments.$inferInsert) {
    const [row] = await db.insert(communityComments).values(data).returning();
    // bump reply count
    await db.update(communityPosts)
      .set({ replyCount: sql`${communityPosts.replyCount} + 1` })
      .where(eq(communityPosts.id, data.postId as string));
    return row;
  },

  async getCommunityVote(userId: string, targetId: string, targetType: string) {
    const [row] = await db.select().from(communityVotes)
      .where(and(eq(communityVotes.userId, userId), eq(communityVotes.targetId, targetId), eq(communityVotes.targetType, targetType)));
    return row ?? null;
  },

  async insertCommunityVote(data: typeof communityVotes.$inferInsert) {
    const [row] = await db.insert(communityVotes).values(data).returning();
    // bump upvotes/downvotes on the target
    if (data.targetType === 'post') {
      const col = data.direction === 'up' ? communityPosts.upvotes : communityPosts.downvotes;
      await db.update(communityPosts)
        .set({ [col.name]: sql`${col} + 1` })
        .where(eq(communityPosts.id, data.targetId as string));
    } else if (data.targetType === 'comment' && data.direction === 'up') {
      await db.update(communityComments)
        .set({ upvotes: sql`${communityComments.upvotes} + 1` })
        .where(eq(communityComments.id, data.targetId as string));
    }
    return row;
  },

  // ── Orders ────────────────────────────────────────────────────────────────
  async getUserOrders(userId: string) {
    return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)).limit(100);
  },

  async insertOrder(data: typeof orders.$inferInsert) {
    const [row] = await db.insert(orders).values(data).returning();
    return row;
  },

  async cancelOrder(id: string, userId: string) {
    const [row] = await db.update(orders).set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(orders.id, id), eq(orders.userId, userId))).returning();
    return row;
  },

  // ── Vault Positions ───────────────────────────────────────────────────────
  async getUserVaultPositions(userId: string) {
    return db.select().from(vaultPositions).where(and(eq(vaultPositions.userId, userId), eq(vaultPositions.status, "active"))).orderBy(desc(vaultPositions.depositedAt));
  },

  async insertVaultPosition(data: typeof vaultPositions.$inferInsert) {
    const [row] = await db.insert(vaultPositions).values(data).returning();
    return row;
  },

  async withdrawVaultPosition(id: string, userId: string) {
    const [row] = await db.update(vaultPositions).set({ status: "withdrawn", withdrawnAt: new Date() })
      .where(and(eq(vaultPositions.id, id), eq(vaultPositions.userId, userId))).returning();
    return row;
  },

  async toggleVaultAutoCompound(id: string, userId: string, enabled: boolean) {
    const [row] = await db.update(vaultPositions).set({ autoCompound: enabled })
      .where(and(eq(vaultPositions.id, id), eq(vaultPositions.userId, userId))).returning();
    return row;
  },

  // ── XP & Leaderboard ──────────────────────────────────────────────────────
  async awardXpOnce(userId: string, eventType: string, xpAwarded: number, description: string) {
    const existing = await pgPool.query(
      `SELECT 1 FROM xp_events WHERE user_id=$1 AND event_type=$2 LIMIT 1`,
      [userId, eventType]
    );
    if (existing.rows.length > 0) return false;
    await this.awardXp(userId, eventType, xpAwarded, description);
    return true;
  },

  async awardXp(userId: string, eventType: string, xpAwarded: number, description: string | null) {
    // Insert event
    await pgPool.query(
      `INSERT INTO xp_events (user_id, event_type, xp_awarded, description) VALUES ($1,$2,$3,$4)`,
      [userId, eventType, xpAwarded, description]
    );
    // Upsert user_xp and recalculate level
    await pgPool.query(`
      INSERT INTO user_xp (user_id, total_xp, level, updated_at)
      VALUES ($1, $2, greatest(1, floor(ln(greatest($2,1)+1)/ln(1.5))::int), now())
      ON CONFLICT (user_id) DO UPDATE SET
        total_xp = user_xp.total_xp + $2,
        level    = greatest(1, floor(ln(greatest(user_xp.total_xp + $2, 1)+1)/ln(1.5))::int),
        updated_at = now()
    `, [userId, xpAwarded]);
  },

  async getXpLeaderboard(limit = 20) {
    const res = await pgPool.query(`
      SELECT x.user_id AS "userId", u.email, x.total_xp AS "totalXp", x.level,
             row_number() OVER (ORDER BY x.total_xp DESC) AS rank
      FROM user_xp x
      JOIN users u ON u.id = x.user_id
      ORDER BY x.total_xp DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  },

  async getMyXpRank(userId: string) {
    const res = await pgPool.query(`
      WITH ranked AS (
        SELECT user_id AS "userId", total_xp AS "totalXp", level,
               row_number() OVER (ORDER BY total_xp DESC) AS rank
        FROM user_xp
      )
      SELECT r.*, u.email
      FROM ranked r JOIN users u ON u.id = r."userId"
      WHERE r."userId" = $1
    `, [userId]);
    return res.rows[0] ?? null;
  },

  async getTxLeaderboard(limit = 20) {
    const res = await pgPool.query(`
      SELECT t.user_id AS "userId", u.email,
             count(*) AS value,
             row_number() OVER (ORDER BY count(*) DESC) AS rank
      FROM transactions t
      JOIN users u ON u.id = t.user_id
      GROUP BY t.user_id, u.email
      ORDER BY value DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  },

  async getTokenLeaderboard(limit = 20) {
    const res = await pgPool.query(`
      SELECT t.creator_id AS "userId",
             coalesce(u.email, t.creator_id) AS email,
             count(*) AS value,
             row_number() OVER (ORDER BY count(*) DESC) AS rank
      FROM tokens t
      LEFT JOIN users u ON u.id = t.creator_id
      GROUP BY t.creator_id, u.email
      ORDER BY value DESC
      LIMIT $1
    `, [limit]);
    return res.rows;
  },

  // ── Achievements ──────────────────────────────────────────────────────────
  async seedAchievements() {
    const badges = [
      // Transactions
      { id: 'first_transaction',   title: 'First Transaction',    description: 'Sent your first transaction on GYDSchain',               xpReward: 50,   icon: '💸', category: 'transactions' },
      { id: 'ten_transactions',    title: 'Active Sender',        description: 'Completed 10 transactions on GYDSchain',                 xpReward: 100,  icon: '📤', category: 'transactions' },
      { id: 'speed_demon',         title: 'Speed Demon',          description: 'Submitted 10 transactions in a single session',          xpReward: 150,  icon: '⚡', category: 'transactions' },
      // Infrastructure
      { id: 'first_node',          title: 'Node Operator',        description: 'Installed your first blockchain node',                   xpReward: 200,  icon: '🖥️', category: 'infrastructure' },
      { id: 'multi_node',          title: 'Multi-Node Runner',    description: 'Running 3 or more active nodes simultaneously',         xpReward: 400,  icon: '🏗️', category: 'infrastructure' },
      { id: 'boost_tester',        title: 'Boost Tester',         description: 'Used the Boost Node for high-throughput MEV testing',   xpReward: 150,  icon: '🚀', category: 'infrastructure' },
      { id: 'validator',           title: 'Validator',            description: 'Became an active validator on GYDSchain',               xpReward: 500,  icon: '✅', category: 'infrastructure' },
      // Tokens & DeFi
      { id: 'first_token',         title: 'Token Creator',        description: 'Launched your first token on GYDSchain',                xpReward: 300,  icon: '🪙', category: 'defi' },
      { id: 'token_burner',        title: 'Token Burner',         description: 'Burned tokens on GYDSchain forever',                   xpReward: 100,  icon: '🔥', category: 'defi' },
      { id: 'liquidity_provider',  title: 'Liquidity Provider',   description: 'Added liquidity to a GydsSwap pool',                   xpReward: 200,  icon: '💧', category: 'defi' },
      { id: 'defi_trader',         title: 'DeFi Trader',          description: 'Executed your first swap on GydsSwap',                  xpReward: 100,  icon: '📊', category: 'defi' },
      // Governance
      { id: 'governance_voter',    title: 'Governance Voter',     description: 'Voted on your first governance proposal',               xpReward: 25,   icon: '🗳️', category: 'governance' },
      { id: 'proposal_creator',    title: 'Proposal Creator',     description: 'Created a governance proposal for the community',       xpReward: 200,  icon: '📜', category: 'governance' },
      { id: 'power_voter',         title: 'Power Voter',          description: 'Voted on 10 or more governance proposals',              xpReward: 250,  icon: '🏛️', category: 'governance' },
      // Special
      { id: 'early_adopter',       title: 'Early Adopter',        description: 'One of the first 100 users on GYDSchain',               xpReward: 500,  icon: '🌟', category: 'special' },
      { id: 'whale',               title: 'Whale',                description: 'Held over 100,000 GYDS at one time',                   xpReward: 1000, icon: '🐋', category: 'special' },
      { id: 'legend',              title: 'Legend',               description: 'Reached Level 8 (Legend) — the highest XP tier',       xpReward: 2000, icon: '👑', category: 'special' },
    ];
    for (const b of badges) {
      await pgPool.query(
        `INSERT INTO achievements (id, title, description, xp_reward, icon, category)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [b.id, b.title, b.description, b.xpReward, b.icon, b.category]
      );
    }
  },

  async getUserAchievements(userId: string) {
    const res = await pgPool.query(`
      SELECT a.id, a.title, a.description, a.xp_reward AS "xpReward",
             a.icon, a.category,
             ua.unlocked_at AS "unlockedAt"
      FROM achievements a
      LEFT JOIN user_achievements ua
        ON ua.achievement_id = a.id AND ua.user_id = $1
      ORDER BY a.category, a.id
    `, [userId]);
    return res.rows.map(r => ({ ...r, earned: r.unlockedAt !== null }));
  },

  async unlockAchievement(userId: string, achievementId: string) {
    const existing = await pgPool.query(
      `SELECT 1 FROM user_achievements WHERE user_id=$1 AND achievement_id=$2 LIMIT 1`,
      [userId, achievementId]
    );
    if (existing.rows.length > 0) return false;
    await pgPool.query(
      `INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1,$2)`,
      [userId, achievementId]
    );
    const ach = await pgPool.query(
      `SELECT xp_reward FROM achievements WHERE id=$1`, [achievementId]
    );
    if (ach.rows[0]) {
      await this.awardXp(userId, `achievement:${achievementId}`, ach.rows[0].xp_reward, `Achievement unlocked: ${achievementId}`);
    }
    return true;
  },

  // ── Referrals ─────────────────────────────────────────────────────────────
  async initReferralTables() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL UNIQUE,
        code text NOT NULL UNIQUE,
        referred_count integer NOT NULL DEFAULT 0,
        total_earned numeric NOT NULL DEFAULT 0,
        created_at timestamp DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS referral_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        referrer_id text NOT NULL,
        referee_id text NOT NULL UNIQUE,
        reward_amount numeric NOT NULL DEFAULT 500,
        created_at timestamp DEFAULT now()
      );
    `);
  },

  async ensureReferralCode(userId: string) {
    const existing = await pgPool.query(
      `SELECT code, referred_count, total_earned FROM referrals WHERE user_id=$1`, [userId]
    );
    if (existing.rows.length > 0) return existing.rows[0];
    const code = 'GYDS-' + userId.slice(0, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const res = await pgPool.query(
      `INSERT INTO referrals (user_id, code) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING code, referred_count, total_earned`,
      [userId, code]
    );
    return res.rows[0];
  },

  async getReferralStats(userId: string) {
    const row = await this.ensureReferralCode(userId);
    const events = await pgPool.query(
      `SELECT re.referee_id, re.reward_amount, re.created_at, u.email
       FROM referral_events re LEFT JOIN users u ON u.id=re.referee_id
       WHERE re.referrer_id=$1 ORDER BY re.created_at DESC LIMIT 20`, [userId]
    );
    return { ...row, events: events.rows };
  },

  async useReferralCode(code: string, newUserId: string) {
    const ref = await pgPool.query(`SELECT user_id FROM referrals WHERE code=$1`, [code]);
    if (!ref.rows.length) return { ok: false, message: 'Invalid referral code' };
    const referrerId = ref.rows[0].user_id;
    if (referrerId === newUserId) return { ok: false, message: 'Cannot use your own referral code' };
    const dup = await pgPool.query(`SELECT 1 FROM referral_events WHERE referee_id=$1`, [newUserId]);
    if (dup.rows.length) return { ok: false, message: 'Already used a referral code' };
    await pgPool.query(
      `INSERT INTO referral_events (referrer_id, referee_id, reward_amount) VALUES ($1,$2,500)`,
      [referrerId, newUserId]
    );
    await pgPool.query(
      `UPDATE referrals SET referred_count=referred_count+1, total_earned=total_earned+500 WHERE user_id=$1`,
      [referrerId]
    );
    await this.awardXp(referrerId, 'referral_success', 100, 'Referred a new user');
    return { ok: true };
  },

  // ── Governance Treasury ───────────────────────────────────────────────────
  async initGovernanceTreasury() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS governance_treasury (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        coin text NOT NULL UNIQUE,
        balance numeric NOT NULL DEFAULT 0,
        usd_value numeric,
        address text,
        updated_at timestamp DEFAULT now()
      );
    `);
    const seed = [
      { coin: 'GYDS', balance: 12500000, usd_value: 1250, address: '0xDAO000000000000000000000000000000000001' },
      { coin: 'GYD',  balance: 250000,   usd_value: 250000, address: '0xDAO000000000000000000000000000000000002' },
      { coin: 'ETH',  balance: 45.2,     usd_value: 144640, address: '0xDAO000000000000000000000000000000000003' },
    ];
    for (const s of seed) {
      await pgPool.query(
        `INSERT INTO governance_treasury (coin, balance, usd_value, address)
         VALUES ($1,$2,$3,$4) ON CONFLICT (coin) DO NOTHING`,
        [s.coin, s.balance, s.usd_value, s.address]
      );
    }
  },

  async getGovernanceTreasury() {
    const res = await pgPool.query(`SELECT * FROM governance_treasury ORDER BY usd_value DESC NULLS LAST`);
    return res.rows;
  },

  // ── Governance Delegation ──────────────────────────────────────────────────
  async initGovernanceDelegation() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS voting_delegations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delegator_id INTEGER NOT NULL,
        delegate_address TEXT NOT NULL,
        delegate_username TEXT,
        power_delegated INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        revoked_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS social_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        handle TEXT NOT NULL,
        challenge_code TEXT NOT NULL,
        verified BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        verified_at TIMESTAMPTZ,
        UNIQUE(user_id, platform)
      );
    `);
  },

  async delegateVotingPower(delegatorId: number, delegateAddress: string, delegateUsername: string | null, powerDelegated: number) {
    const res = await pgPool.query(
      `INSERT INTO voting_delegations (delegator_id, delegate_address, delegate_username, power_delegated)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [delegatorId, delegateAddress, delegateUsername, powerDelegated]
    );
    return res.rows[0];
  },

  async getMyDelegations(userId: string | number) {
    const res = await pgPool.query(
      `SELECT * FROM voting_delegations WHERE delegator_id=$1 ORDER BY created_at DESC`,
      [String(userId)]
    );
    return res.rows;
  },

  async revokeDelegation(userId: string | number, delegationId: string) {
    await pgPool.query(
      `UPDATE voting_delegations SET active=false, revoked_at=NOW() WHERE id=$1 AND delegator_id=$2`,
      [delegationId, String(userId)]
    );
  },

  async generateSocialChallenge(userId: string | number, platform: string, handle: string) {
    const { randomBytes } = await import('crypto');
    const code = 'GYDS-' + randomBytes(8).toString('hex').toUpperCase();
    await pgPool.query(
      `INSERT INTO social_verifications (user_id, platform, handle, challenge_code)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, platform) DO UPDATE SET handle=$3, challenge_code=$4, verified=false, verified_at=NULL`,
      [userId, platform, handle, code]
    );
    return code;
  },

  async verifySocialChallenge(userId: number, platform: string) {
    // In production would check Twitter/Telegram API; here we auto-verify for demo
    const res = await pgPool.query(
      `UPDATE social_verifications SET verified=true, verified_at=NOW()
       WHERE user_id=$1 AND platform=$2 RETURNING *`,
      [userId, platform]
    );
    return res.rows[0];
  },

  async getUserSocialVerifications(userId: string | number) {
    const res = await pgPool.query(
      `SELECT * FROM social_verifications WHERE user_id=$1`,
      [String(userId)]
    );
    return res.rows;
  },

  async updateTreasuryBalance(coin: string, balance: number, usdValue?: number) {
    await pgPool.query(
      `UPDATE governance_treasury SET balance=$2, usd_value=$3, updated_at=now() WHERE coin=$1`,
      [coin, balance, usdValue ?? null]
    );
  },

  async getTreasurySpending() {
    const res = await pgPool.query(`
      SELECT p.title AS what, p.description, p.created_at
      FROM governance_proposals p
      WHERE p.proposal_type='treasury' AND p.status='passed'
      ORDER BY p.created_at DESC LIMIT 5
    `);
    return res.rows;
  },

  // ── Voting Power ──────────────────────────────────────────────────────────
  async getUserVotingPower(userId: string) {
    const [nodeRes, xpRes, valRes] = await Promise.all([
      pgPool.query(`SELECT COUNT(*) as cnt FROM node_installations WHERE user_id=$1 AND is_approved=true`, [userId]),
      pgPool.query(`SELECT total_xp, level FROM user_xp WHERE user_id=$1`, [userId]),
      pgPool.query(`SELECT stake FROM network_validators WHERE address IN (SELECT address FROM wallets WHERE user_id=$1) LIMIT 1`, [userId]),
    ]);
    const nodes = parseInt(nodeRes.rows[0]?.cnt ?? '0');
    const xp = parseInt(xpRes.rows[0]?.total_xp ?? '0');
    const level = parseInt(xpRes.rows[0]?.level ?? '1');
    const stake = parseFloat(valRes.rows[0]?.stake ?? '0');
    const fromNodes = nodes * 1000;
    const fromXp = Math.floor(xp / 10);
    const fromStake = Math.floor(stake);
    const total = fromNodes + fromXp + fromStake + 100;
    return { total, fromNodes, fromXp, fromStake, fromBase: 100, nodes, xp, level, stake };
  },

  // ── API Keys ──────────────────────────────────────────────────────────────
  async initApiKeysTables() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        name text NOT NULL,
        key_prefix text NOT NULL,
        key_hash text NOT NULL,
        scopes text[] NOT NULL DEFAULT '{}',
        request_count integer NOT NULL DEFAULT 0,
        request_limit integer NOT NULL DEFAULT 10000,
        last_used_at timestamp,
        expires_at timestamp,
        revoked boolean NOT NULL DEFAULT false,
        created_at timestamp DEFAULT now()
      );
    `);
  },

  async createApiKey(userId: string, name: string, scopes: string[]) {
    const { createHash, randomBytes } = await import('crypto');
    const raw = 'gyds_live_' + randomBytes(20).toString('hex');
    const prefix = raw.slice(0, 18);
    const hash = createHash('sha256').update(raw).digest('hex');
    const res = await pgPool.query(
      `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, key_prefix, scopes, request_count, request_limit, created_at`,
      [userId, name, prefix, hash, scopes]
    );
    return { ...res.rows[0], fullKey: raw };
  },

  async getUserApiKeys(userId: string) {
    const res = await pgPool.query(
      `SELECT id, name, key_prefix, scopes, request_count, request_limit, last_used_at, created_at, revoked
       FROM api_keys WHERE user_id=$1 AND revoked=false ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows;
  },

  async revokeApiKey(userId: string, keyId: string) {
    await pgPool.query(
      `UPDATE api_keys SET revoked=true WHERE id=$1 AND user_id=$2`,
      [keyId, userId]
    );
  },

  // ── API Usage Logs ────────────────────────────────────────────────────────
  async initApiUsageLogs() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS api_usage_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key_id UUID NOT NULL,
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        latency_ms INTEGER DEFAULT 0,
        logged_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS api_usage_key_ts ON api_usage_logs(key_id, logged_at DESC);
    `);
  },

  async logApiUsage(keyId: string, userId: string, endpoint: string, method: string, statusCode: number, latencyMs: number) {
    await pgPool.query(
      `INSERT INTO api_usage_logs (key_id,user_id,endpoint,method,status_code,latency_ms) VALUES ($1,$2,$3,$4,$5,$6)`,
      [keyId, userId, endpoint, method, statusCode, latencyMs]
    );
    await pgPool.query(`UPDATE api_keys SET request_count=request_count+1, last_used_at=NOW() WHERE id=$1`, [keyId]);
  },

  async getApiUsageStats(userId: string) {
    const keys = await pgPool.query(
      `SELECT id, name, key_prefix, request_count, request_limit, last_used_at FROM api_keys WHERE user_id=$1 AND revoked=false`,
      [userId]
    );
    const stats: any[] = [];
    for (const key of keys.rows) {
      const daily = await pgPool.query(
        `SELECT date_trunc('day', logged_at) AS day, COUNT(*) AS count
         FROM api_usage_logs WHERE key_id=$1 AND logged_at > NOW()-INTERVAL '7 days'
         GROUP BY 1 ORDER BY 1`,
        [key.id]
      );
      const topEndpoints = await pgPool.query(
        `SELECT endpoint, COUNT(*) AS count FROM api_usage_logs WHERE key_id=$1 AND logged_at > NOW()-INTERVAL '30 days'
         GROUP BY endpoint ORDER BY count DESC LIMIT 5`,
        [key.id]
      );
      stats.push({
        ...key,
        daily_usage: daily.rows,
        top_endpoints: topEndpoints.rows,
        usage_pct: Math.round((key.request_count / key.request_limit) * 100),
      });
    }
    return stats;
  },

  // ── Bridge Transfers ──────────────────────────────────────────────────────
  async initBridgeTransferTable() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS bridge_transfers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL,
        from_chain TEXT NOT NULL,
        to_chain TEXT NOT NULL,
        from_token TEXT NOT NULL,
        to_token TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        received NUMERIC,
        fee NUMERIC DEFAULT 0,
        status TEXT DEFAULT 'pending',
        tx_hash TEXT,
        dest_tx_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  },

  async createBridgeTransfer(userId: number, data: {
    fromChain: string; toChain: string;
    fromToken: string; toToken: string;
    amount: number; fee: number; txHash?: string;
  }) {
    const received = data.amount - data.fee;
    const res = await pgPool.query(
      `INSERT INTO bridge_transfers (user_id,from_chain,to_chain,from_token,to_token,amount,received,fee,tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [userId, data.fromChain, data.toChain, data.fromToken, data.toToken, data.amount, received, data.fee, data.txHash ?? null]
    );
    return res.rows[0];
  },

  async getUserBridgeTransfers(userId: string | number) {
    const res = await pgPool.query(
      `SELECT * FROM bridge_transfers WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [String(userId)]
    );
    return res.rows;
  },

  async updateBridgeTransferStatus(transferId: string, status: string, destTxHash?: string) {
    const res = await pgPool.query(
      `UPDATE bridge_transfers SET status=$1, dest_tx_hash=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [status, destTxHash ?? null, transferId]
    );
    return res.rows[0];
  },

  // ── Admin: All Achievements ───────────────────────────────────────────────
  async getAllAchievements() {
    const res = await pgPool.query(`SELECT * FROM achievements ORDER BY category, id`);
    return res.rows;
  },

  async getAllUsersBasic() {
    const res = await pgPool.query(
      `SELECT u.id, u.email, u.username, u.created_at,
              COALESCE(ux.total_xp, 0) AS total_xp, COALESCE(ux.level,1) AS level,
              COUNT(ua.achievement_id) AS achievement_count
       FROM users u
       LEFT JOIN user_xp ux ON ux.user_id=u.id
       LEFT JOIN user_achievements ua ON ua.user_id=u.id
       GROUP BY u.id, u.email, u.username, u.created_at, ux.total_xp, ux.level
       ORDER BY u.created_at DESC LIMIT 100`
    );
    return res.rows;
  },

  // ── NFT Tables ────────────────────────────────────────────────────────────
  async initNftTables() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS nft_collections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL, symbol TEXT, description TEXT,
        floor_price NUMERIC DEFAULT 0, volume_24h NUMERIC DEFAULT 0,
        change_24h NUMERIC DEFAULT 0, total_items INTEGER DEFAULT 0,
        image_emoji TEXT DEFAULT '🖼️', creator_address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS nft_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_id UUID REFERENCES nft_collections(id) ON DELETE CASCADE,
        name TEXT NOT NULL, token_id INTEGER NOT NULL,
        owner_address TEXT DEFAULT '0x0000000000000000000000000000000000000000',
        price NUMERIC DEFAULT 0, last_sale NUMERIC DEFAULT 0,
        rarity TEXT DEFAULT 'Common', image_emoji TEXT DEFAULT '🖼️',
        listed BOOLEAN DEFAULT true, metadata JSONB DEFAULT '{}',
        minted_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    const count = await pgPool.query(`SELECT COUNT(*) FROM nft_collections`);
    if (parseInt(count.rows[0].count) === 0) {
      await pgPool.query(`
        INSERT INTO nft_collections (name,symbol,description,floor_price,volume_24h,change_24h,total_items,image_emoji) VALUES
        ('GYDSchain Genesis','GCG','The founding NFT collection of the GYDSchain network.',250000,4500000,12.5,1000,'🌐'),
        ('Validator Badges','VBG','Exclusive badges awarded to network validators.',100000,1200000,-3.2,500,'🛡️'),
        ('Node Operators','NOC','Commemorative NFTs for node operators.',500000,800000,5.8,250,'⚡'),
        ('DeFi Degens','DFD','For the most active DeFi users on GYDSchain.',50000,2100000,22.1,2000,'🔥')
        ON CONFLICT DO NOTHING
      `);
      const cols = await pgPool.query(`SELECT id, image_emoji FROM nft_collections ORDER BY created_at`);
      for (const col of cols.rows) {
        await pgPool.query(`
          INSERT INTO nft_tokens (collection_id,name,token_id,owner_address,price,last_sale,rarity,image_emoji) VALUES
          ($1,$2||' #001',1,'0x1234000000000000000000000000000000005678',$3,$4,'Legendary',$5),
          ($1,$2||' #042',42,'0xabcd000000000000000000000000000000ef1234',$6,$7,'Epic',$5),
          ($1,$2||' #099',99,'0x9876000000000000000000000000000000004321',$8,$9,'Common',$5)
        `, [
          col.id, col.image_emoji === '🌐' ? 'Genesis' : col.image_emoji === '🛡️' ? 'Validator' : col.image_emoji === '⚡' ? 'Node Op' : 'DeFi Degen',
          260000, 245000, col.image_emoji,
          255000, 240000,
          250000, 230000,
        ]);
      }
    }
  },

  async getNftCollections() {
    const res = await pgPool.query(`SELECT * FROM nft_collections ORDER BY volume_24h DESC`);
    return res.rows;
  },

  async getNftTokens(search = '', collectionId = '') {
    let q = `SELECT t.*, c.name AS collection_name FROM nft_tokens t
             JOIN nft_collections c ON c.id = t.collection_id WHERE t.listed = true`;
    const params: any[] = [];
    if (search) { params.push(`%${search}%`); q += ` AND (t.name ILIKE $${params.length} OR c.name ILIKE $${params.length})`; }
    if (collectionId) { params.push(collectionId); q += ` AND t.collection_id = $${params.length}`; }
    q += ` ORDER BY t.price DESC LIMIT 50`;
    const res = await pgPool.query(q, params);
    return res.rows;
  },

  async mintNftToken(userId: number, data: { name: string; collectionId: string; rarity?: string; imageEmoji?: string; description?: string; royaltyPercent?: number; attributes?: Record<string, string> }) {
    const collId = data.collectionId || (await pgPool.query(`SELECT id FROM nft_collections LIMIT 1`)).rows[0]?.id;
    const tokenId = Math.floor(Math.random() * 9000) + 1000;
    const metadata = { description: data.description ?? '', royaltyPercent: data.royaltyPercent ?? 5, attributes: data.attributes ?? {} };
    const res = await pgPool.query(
      `INSERT INTO nft_tokens (collection_id,name,token_id,owner_address,price,last_sale,rarity,image_emoji,listed,metadata)
       VALUES ($1,$2,$3,$4,100000,0,$5,$6,false,$7) RETURNING *`,
      [collId, data.name, tokenId, `0xUSER${userId}`, data.rarity ?? 'Common', data.imageEmoji ?? '🎨', JSON.stringify(metadata)]
    );
    return res.rows[0];
  },

  async getMyNftTokens(userId: number) {
    const userAddr = `0xUSER${userId}`;
    const res = await pgPool.query(
      `SELECT t.*, c.name AS collection_name FROM nft_tokens t
       JOIN nft_collections c ON c.id = t.collection_id
       WHERE t.owner_address = $1 ORDER BY t.minted_at DESC`,
      [userAddr]
    );
    return res.rows;
  },

  async buyNftToken(buyerId: number, tokenId: string) {
    const tok = await pgPool.query(`SELECT * FROM nft_tokens WHERE id=$1 AND listed=true`, [tokenId]);
    if (!tok.rows.length) throw new Error('NFT not available');
    const nft = tok.rows[0];
    const buyerAddr = `0xUSER${buyerId}`;
    if (nft.owner_address === buyerAddr) throw new Error('Cannot buy your own NFT');
    await pgPool.query(
      `UPDATE nft_tokens SET owner_address=$1, last_sale=price, listed=false WHERE id=$2`,
      [buyerAddr, tokenId]
    );
    await pgPool.query(
      `UPDATE nft_collections SET volume_24h=volume_24h+$1 WHERE id=$2`,
      [nft.price, nft.collection_id]
    );
    return { ok: true, price: nft.price, name: nft.name };
  },

  async listNftToken(userId: number, tokenId: string, price: number) {
    const userAddr = `0xUSER${userId}`;
    const res = await pgPool.query(
      `UPDATE nft_tokens SET listed=true, price=$1 WHERE id=$2 AND owner_address=$3 RETURNING *`,
      [price, tokenId, userAddr]
    );
    if (!res.rows.length) throw new Error('NFT not found or not owned by you');
    return res.rows[0];
  },

  async delistNftToken(userId: number, tokenId: string) {
    const userAddr = `0xUSER${userId}`;
    const res = await pgPool.query(
      `UPDATE nft_tokens SET listed=false WHERE id=$1 AND owner_address=$2 RETURNING *`,
      [tokenId, userAddr]
    );
    if (!res.rows.length) throw new Error('NFT not found or not owned by you');
    return res.rows[0];
  },

  async batchMintNftTokens(userId: number, items: Array<{ name: string; collectionId: string; rarity?: string; imageEmoji?: string }>) {
    const results = [];
    for (const item of items) {
      results.push(await this.mintNftToken(userId, item));
    }
    return results;
  },

  // ── Insurance Protocol ────────────────────────────────────────────────────
  async initInsuranceTables() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS insurance_pools (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        coverage_type TEXT NOT NULL,
        description TEXT,
        total_coverage NUMERIC DEFAULT 0,
        total_staked NUMERIC DEFAULT 0,
        premium_rate NUMERIC DEFAULT 0.02,
        claim_period INTEGER DEFAULT 30,
        min_coverage NUMERIC DEFAULT 1000,
        max_coverage NUMERIC DEFAULT 1000000,
        image_emoji TEXT DEFAULT '🛡️',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS insurance_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pool_id UUID REFERENCES insurance_pools(id) ON DELETE CASCADE,
        holder_id INTEGER NOT NULL,
        coverage_amount NUMERIC NOT NULL,
        premium_paid NUMERIC NOT NULL,
        starts_at TIMESTAMPTZ DEFAULT NOW(),
        ends_at TIMESTAMPTZ NOT NULL,
        status TEXT DEFAULT 'active',
        claim_reason TEXT,
        claim_submitted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    const count = await pgPool.query(`SELECT COUNT(*) FROM insurance_pools`);
    if (parseInt(count.rows[0].count) === 0) {
      await pgPool.query(`
        INSERT INTO insurance_pools (name,coverage_type,description,total_coverage,total_staked,premium_rate,claim_period,min_coverage,max_coverage,image_emoji) VALUES
        ('Smart Contract Shield','smart_contract','Coverage against smart contract exploits and bugs.',5000000,1200000,0.025,30,1000,500000,'🔐'),
        ('Exchange Hack Guard','exchange_hack','Protection against exchange hacks and unauthorized withdrawals.',3000000,800000,0.018,14,500,250000,'🏦'),
        ('Stablecoin Depeg Cover','stablecoin_depeg','Hedges against GYD or major stablecoin depegging events.',2000000,600000,0.030,7,1000,100000,'💵'),
        ('Validator Slashing Shield','slashing','Covers validator slashing penalties and missed attestations.',1500000,400000,0.015,30,500,50000,'🛡️'),
        ('Bridge Risk Insurance','bridge','Protection for cross-chain bridge exploits and failed transfers.',4000000,1100000,0.022,21,1000,300000,'🌉')
      `);
    }
  },

  async getInsurancePools() {
    const res = await pgPool.query(`SELECT * FROM insurance_pools WHERE active=true ORDER BY total_coverage DESC`);
    return res.rows;
  },

  async buyInsurancePolicy(userId: number, poolId: string, coverageAmount: number, durationDays: number) {
    const pool = await pgPool.query(`SELECT * FROM insurance_pools WHERE id=$1 AND active=true`, [poolId]);
    if (!pool.rows.length) throw new Error('Pool not found');
    const p = pool.rows[0];
    if (coverageAmount < Number(p.min_coverage) || coverageAmount > Number(p.max_coverage)) {
      throw new Error(`Coverage must be between ${p.min_coverage} and ${p.max_coverage} GYDS`);
    }
    const premium = Math.ceil(coverageAmount * Number(p.premium_rate) * (durationDays / 365));
    const endsAt = new Date(Date.now() + durationDays * 86400 * 1000);
    const res = await pgPool.query(
      `INSERT INTO insurance_policies (pool_id,holder_id,coverage_amount,premium_paid,ends_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [poolId, userId, coverageAmount, premium, endsAt]
    );
    await pgPool.query(
      `UPDATE insurance_pools SET total_staked=total_staked+$1, total_coverage=total_coverage+$2 WHERE id=$3`,
      [premium, coverageAmount, poolId]
    );
    return { ...res.rows[0], premium, pool_name: p.name };
  },

  async getUserInsurancePolicies(userId: string | number) {
    const res = await pgPool.query(
      `SELECT p.*, ip.name AS pool_name, ip.coverage_type, ip.image_emoji
       FROM insurance_policies p
       JOIN insurance_pools ip ON ip.id=p.pool_id
       WHERE p.holder_id=$1 ORDER BY p.created_at DESC`,
      [String(userId)]
    );
    return res.rows;
  },

  async submitInsuranceClaim(userId: string | number, policyId: string, reason: string) {
    const res = await pgPool.query(
      `UPDATE insurance_policies
       SET status='claimed', claim_reason=$1, claim_submitted_at=NOW()
       WHERE id=$2 AND holder_id=$3 AND status='active' RETURNING *`,
      [reason, policyId, userId]
    );
    if (!res.rows.length) throw new Error('Policy not found or not active');
    return res.rows[0];
  },

  // ── Price History ─────────────────────────────────────────────────────────
  async initPriceHistory() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS price_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        coin TEXT NOT NULL, open NUMERIC NOT NULL, close NUMERIC NOT NULL,
        high NUMERIC NOT NULL, low NUMERIC NOT NULL, volume BIGINT DEFAULT 0,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS price_history_coin_ts ON price_history(coin, timestamp DESC);
    `);
    const count = await pgPool.query(`SELECT COUNT(*) FROM price_history WHERE coin='GYDS'`);
    if (parseInt(count.rows[0].count) < 30) {
      let last = 0.0000001;
      const rows: string[] = [];
      for (let i = 90; i >= 0; i--) {
        const noise = () => (Math.random() - 0.48) * last * 0.04;
        const open = last;
        const close = Math.max(1e-10, open + noise());
        const high = Math.max(open, close) * (1 + Math.random() * 0.01);
        const low = Math.min(open, close) * (1 - Math.random() * 0.01);
        const vol = Math.floor(Math.random() * 5_000_000 + 1_000_000);
        const ts = new Date(Date.now() - i * 86400000).toISOString();
        rows.push(`('GYDS',${open},${close},${high},${low},${vol},'${ts}')`);
        last = close;
      }
      await pgPool.query(`INSERT INTO price_history (coin,open,close,high,low,volume,timestamp) VALUES ${rows.join(',')} ON CONFLICT DO NOTHING`);
    }
  },

  async getPriceHistory(coin: string, days: number) {
    const res = await pgPool.query(
      `SELECT open::float, close::float, high::float, low::float, volume::bigint, timestamp
       FROM price_history WHERE coin=$1 AND timestamp > NOW() - ($2 || ' days')::INTERVAL
       ORDER BY timestamp ASC`,
      [coin, days]
    );
    return res.rows;
  },

  // ── Webhook Tables ────────────────────────────────────────────────────────
  async initWebhookTables() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS webhook_endpoints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        url TEXT NOT NULL,
        secret TEXT NOT NULL,
        events TEXT[] DEFAULT ARRAY['tx.confirmed','block.new'],
        active BOOLEAN DEFAULT true,
        delivery_count INTEGER DEFAULT 0,
        last_delivered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  },

  async getUserWebhooks(userId: string) {
    const res = await pgPool.query(
      `SELECT id, url, events, active, delivery_count, last_delivered_at, created_at,
              LEFT(secret, 8) || '…' AS secret_preview
       FROM webhook_endpoints WHERE user_id=$1 ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows;
  },

  async createWebhook(userId: string, url: string, events: string[]) {
    const secret = `whsec_${Array.from(crypto.getRandomValues(new Uint8Array(20))).map(b => b.toString(16).padStart(2, '0')).join('')}`;
    const res = await pgPool.query(
      `INSERT INTO webhook_endpoints (user_id,url,secret,events) VALUES ($1,$2,$3,$4) RETURNING *`,
      [userId, url, secret, events]
    );
    return { ...res.rows[0], full_secret: secret };
  },

  async deleteWebhook(userId: string, id: string) {
    await pgPool.query(`DELETE FROM webhook_endpoints WHERE id=$1 AND user_id=$2`, [id, userId]);
  },

  async toggleWebhook(userId: string, id: string, active: boolean) {
    await pgPool.query(`UPDATE webhook_endpoints SET active=$1 WHERE id=$2 AND user_id=$3`, [active, id, userId]);
  },

  // ── Real-World Assets ─────────────────────────────────────────────────────
  async initRwaTables() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS rwa_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        total_value NUMERIC DEFAULT 0,
        token_price NUMERIC DEFAULT 1,
        tokens_available INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 1,
        apy NUMERIC DEFAULT 0,
        currency TEXT DEFAULT 'USDT',
        jurisdiction TEXT,
        audited BOOLEAN DEFAULT false,
        maturity TEXT,
        doc_cid TEXT,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS rwa_holdings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        asset_id UUID NOT NULL REFERENCES rwa_assets(id) ON DELETE CASCADE,
        tokens_held NUMERIC DEFAULT 0,
        invested_amount NUMERIC DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, asset_id)
      );
    `);
    const count = await pgPool.query('SELECT COUNT(*) FROM rwa_assets');
    if (parseInt(count.rows[0].count) === 0) {
      await pgPool.query(`
        INSERT INTO rwa_assets (name, type, description, total_value, token_price, tokens_available, total_tokens, apy, currency, jurisdiction, audited, maturity) VALUES
        ('Dubai Marina Tower — Floor 12', 'real-estate', 'Commercial office space in Dubai Marina. Quarterly yield distribution.', 2500000, 100, 8000, 25000, 8.5, 'USDT', 'UAE', true, '2027-06'),
        ('GYDSchain Treasury Bond — Series A', 'bond', 'Fixed-income bond backed by GYDSchain treasury reserves. Semi-annual coupon payments.', 1000000, 50, 12000, 20000, 6.2, 'USDT', 'Cayman Islands', true, '2026-12'),
        ('Gold Bullion Vault — 500 oz', 'commodity', 'Physical gold in a Swiss vault. Each token represents 0.01 oz.', 950000, 19, 5000, 50000, 0, 'USD', 'Switzerland', true, NULL),
        ('Supply Chain Invoice — TechCorp MENA', 'invoice', 'Short-term trade invoice financing, 90-day term, high yield.', 200000, 20, 2000, 10000, 14.5, 'USDT', 'UAE', false, '2026-09')
        ON CONFLICT DO NOTHING;
      `);
    }
  },

  async getRwaAssets() {
    const res = await pgPool.query(`SELECT * FROM rwa_assets WHERE active=true ORDER BY total_value DESC`);
    return res.rows;
  },

  async investRwa(userId: string, assetId: string, amount: number) {
    const asset = await pgPool.query('SELECT * FROM rwa_assets WHERE id=$1', [assetId]);
    if (!asset.rows[0]) throw new Error('Asset not found');
    const tokens = Math.floor(amount / asset.rows[0].token_price);
    if (tokens < 1) throw new Error('Amount too small for at least 1 token');
    await pgPool.query(`
      INSERT INTO rwa_holdings (user_id, asset_id, tokens_held, invested_amount)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (user_id, asset_id) DO UPDATE SET
        tokens_held = rwa_holdings.tokens_held + EXCLUDED.tokens_held,
        invested_amount = rwa_holdings.invested_amount + EXCLUDED.invested_amount
    `, [userId, assetId, tokens, amount]);
    await pgPool.query(`UPDATE rwa_assets SET tokens_available = GREATEST(tokens_available - $1, 0) WHERE id=$2`, [tokens, assetId]);
    return { tokens, amount };
  },

  async getUserRwaHoldings(userId: string) {
    const res = await pgPool.query(`
      SELECT h.*, a.name, a.type, a.token_price, a.apy, a.currency, a.maturity
      FROM rwa_holdings h
      JOIN rwa_assets a ON a.id = h.asset_id
      WHERE h.user_id=$1 ORDER BY h.created_at DESC
    `, [userId]);
    return res.rows;
  },

  // ── Network Snapshots ──────────────────────────────────────────────────────
  async initNetworkSnapshotTable() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS network_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        active_validators INTEGER DEFAULT 0,
        active_nodes INTEGER DEFAULT 0,
        total_transactions BIGINT DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        tps NUMERIC DEFAULT 0,
        captured_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS network_snapshots_captured_idx ON network_snapshots(captured_at DESC);
    `);
  },

  async captureNetworkSnapshot() {
    const stats = await pgPool.query(`
      SELECT
        COUNT(DISTINCT v.id) FILTER (WHERE v.status='active') AS active_validators,
        COUNT(DISTINCT n.id) FILTER (WHERE n.status='active') AS active_nodes,
        COUNT(DISTINCT t.id) AS total_transactions,
        COUNT(DISTINCT tok.id) AS total_tokens
      FROM validators v
      CROSS JOIN node_installations n
      CROSS JOIN transactions t
      CROSS JOIN tokens tok
    `).catch(() => ({ rows: [{ active_validators: 0, active_nodes: 0, total_transactions: 0, total_tokens: 0 }] }));
    const s = stats.rows[0];
    await pgPool.query(
      `INSERT INTO network_snapshots (active_validators, active_nodes, total_transactions, total_tokens, tps)
       VALUES ($1,$2,$3,$4,$5)`,
      [s.active_validators, s.active_nodes, s.total_transactions, s.total_tokens, 1250]
    );
  },

  async getNetworkHistory(hours = 24) {
    const res = await pgPool.query(`
      SELECT * FROM network_snapshots
      WHERE captured_at >= NOW() - INTERVAL '${hours} hours'
      ORDER BY captured_at ASC
    `);
    return res.rows;
  },

  // ── Multi-Sig ─────────────────────────────────────────────────────────────
  async initMultisigTables() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS multisig_wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        address TEXT NOT NULL UNIQUE,
        threshold INTEGER NOT NULL DEFAULT 2,
        creator_id TEXT NOT NULL,
        balance NUMERIC DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS multisig_signers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id UUID NOT NULL REFERENCES multisig_wallets(id) ON DELETE CASCADE,
        address TEXT NOT NULL,
        name TEXT,
        user_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(wallet_id, address)
      );
      CREATE TABLE IF NOT EXISTS multisig_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id UUID NOT NULL REFERENCES multisig_wallets(id) ON DELETE CASCADE,
        proposer_id TEXT NOT NULL,
        to_address TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        symbol TEXT DEFAULT 'GYDS',
        description TEXT,
        approvals INTEGER DEFAULT 0,
        rejections INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS multisig_signatures (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tx_id UUID NOT NULL REFERENCES multisig_transactions(id) ON DELETE CASCADE,
        signer_id TEXT NOT NULL,
        action TEXT NOT NULL,
        signed_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tx_id, signer_id)
      );
    `);
  },

  async getUserMultisigWallets(userId: string) {
    const res = await pgPool.query(`
      SELECT w.*, 
        json_agg(json_build_object('id',s.id,'address',s.address,'name',s.name,'user_id',s.user_id)) AS signers
      FROM multisig_wallets w
      JOIN multisig_signers s ON s.wallet_id = w.id
      WHERE w.creator_id=$1 OR s.user_id=$1
      GROUP BY w.id ORDER BY w.created_at DESC
    `, [userId]);
    return res.rows;
  },

  async createMultisigWallet(userId: string, name: string, threshold: number, signers: { address: string; name?: string; userId?: string }[]) {
    const addr = `0xmulti${Date.now().toString(16).slice(-8)}`;
    const wallet = await pgPool.query(
      `INSERT INTO multisig_wallets (name, address, threshold, creator_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, addr, threshold, userId]
    );
    const wid = wallet.rows[0].id;
    for (const s of signers) {
      await pgPool.query(
        `INSERT INTO multisig_signers (wallet_id, address, name, user_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [wid, s.address, s.name ?? null, s.userId ?? null]
      );
    }
    return wallet.rows[0];
  },

  async getMultisigTransactions(walletId: string) {
    const res = await pgPool.query(
      `SELECT t.*, 
        json_agg(json_build_object('signer_id',s.signer_id,'action',s.action,'signed_at',s.signed_at)) 
          FILTER (WHERE s.id IS NOT NULL) AS signatures
       FROM multisig_transactions t
       LEFT JOIN multisig_signatures s ON s.tx_id = t.id
       WHERE t.wallet_id=$1 GROUP BY t.id ORDER BY t.created_at DESC`,
      [walletId]
    );
    return res.rows;
  },

  async proposeMultisigTx(userId: string, walletId: string, toAddress: string, amount: number, symbol: string, description: string) {
    const tx = await pgPool.query(
      `INSERT INTO multisig_transactions (wallet_id, proposer_id, to_address, amount, symbol, description, approvals)
       VALUES ($1,$2,$3,$4,$5,$6,1) RETURNING *`,
      [walletId, userId, toAddress, amount, symbol, description]
    );
    await pgPool.query(
      `INSERT INTO multisig_signatures (tx_id, signer_id, action) VALUES ($1,$2,'approve') ON CONFLICT DO NOTHING`,
      [tx.rows[0].id, userId]
    );
    return tx.rows[0];
  },

  async signMultisigTx(userId: string, txId: string, action: 'approve' | 'reject') {
    await pgPool.query(
      `INSERT INTO multisig_signatures (tx_id, signer_id, action) VALUES ($1,$2,$3)
       ON CONFLICT (tx_id, signer_id) DO UPDATE SET action=$3`,
      [txId, userId, action]
    );
    if (action === 'approve') {
      await pgPool.query(`UPDATE multisig_transactions SET approvals = approvals+1 WHERE id=$1 AND status='pending'`, [txId]);
    } else {
      await pgPool.query(`UPDATE multisig_transactions SET rejections = rejections+1, status='rejected' WHERE id=$1`, [txId]);
    }
    const t = await pgPool.query(`SELECT t.*, w.threshold FROM multisig_transactions t JOIN multisig_wallets w ON w.id=t.wallet_id WHERE t.id=$1`, [txId]);
    if (t.rows[0] && t.rows[0].approvals >= t.rows[0].threshold) {
      await pgPool.query(`UPDATE multisig_transactions SET status='executed' WHERE id=$1`, [txId]);
    }
    return t.rows[0];
  },

  // ── Identity ──────────────────────────────────────────────────────────────
  async initIdentityTables() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS did_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL UNIQUE,
        did TEXT NOT NULL UNIQUE,
        document JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS kyc_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL UNIQUE,
        tier INTEGER DEFAULT 0,
        status TEXT DEFAULT 'none',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  },

  async getOrCreateDID(userId: string, email?: string) {
    const did = `did:gyds:${userId.replace(/-/g, '').slice(0, 32)}`;
    await pgPool.query(
      `INSERT INTO did_documents (user_id, did, document) VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, did, JSON.stringify({ id: did, controller: did, email_hash: email ? Buffer.from(email).toString('base64') : null })]
    );
    const res = await pgPool.query(`SELECT * FROM did_documents WHERE user_id=$1`, [userId]);
    return res.rows[0];
  },

  async getUserKYC(userId: string) {
    const res = await pgPool.query(`SELECT * FROM kyc_records WHERE user_id=$1`, [userId]);
    if (res.rows.length === 0) {
      await pgPool.query(`INSERT INTO kyc_records (user_id, tier, status) VALUES ($1,0,'none') ON CONFLICT DO NOTHING`, [userId]);
      return { user_id: userId, tier: 0, status: 'none' };
    }
    return res.rows[0];
  },

  async getUserReputation(userId: string) {
    const res = await pgPool.query(`
      SELECT 
        COALESCE(ux.total_xp, 0) AS total_xp,
        COALESCE(ux.level, 1) AS level,
        COUNT(DISTINCT ua.achievement_id) AS achievement_count,
        COUNT(DISTINCT ni.id) FILTER (WHERE ni.is_approved=true) AS active_nodes,
        COUNT(DISTINCT t.id) AS tx_count
      FROM users u
      LEFT JOIN user_xp ux ON ux.user_id=u.id
      LEFT JOIN user_achievements ua ON ua.user_id=u.id
      LEFT JOIN node_installations ni ON ni.user_id=u.id
      LEFT JOIN transactions t ON t.user_id=u.id
      WHERE u.id=$1
      GROUP BY u.id, ux.total_xp, ux.level
    `, [userId]);
    if (!res.rows[0]) return { score: 0, breakdown: {} };
    const r = res.rows[0];
    const txScore     = Math.min(Number(r.tx_count) * 5, 100);
    const nodeScore   = Math.min(Number(r.active_nodes) * 50, 200);
    const xpScore     = Math.min(Math.floor(Number(r.total_xp) / 10), 200);
    const achieveScore = Math.min(Number(r.achievement_count) * 15, 150);
    const score = txScore + nodeScore + xpScore + achieveScore;
    return { score, level: r.level, breakdown: { txScore, nodeScore, xpScore, achieveScore, totalXp: r.total_xp, achievements: r.achievement_count } };
  },

  // ── Trade History ─────────────────────────────────────────────────────────
  async initTradesTable() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS trade_history (
        id          SERIAL PRIMARY KEY,
        pair        TEXT NOT NULL DEFAULT 'GYDS/USDT',
        price       NUMERIC(30,18) NOT NULL,
        amount      NUMERIC(30,6)  NOT NULL,
        side        TEXT NOT NULL CHECK (side IN ('buy','sell')),
        taker_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
        maker_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_trade_hist_pair ON trade_history(pair, executed_at DESC)`);
    const count = await pgPool.query(`SELECT COUNT(*) FROM trade_history`);
    if (+count.rows[0].count === 0) {
      const mid = 0.0000001;
      for (let i = 0; i < 50; i++) {
        const side = Math.random() > 0.5 ? 'buy' : 'sell';
        const offset = (Math.random() - 0.5) * mid * 0.05;
        const price = Math.max(mid + offset, 0.000000001);
        const amount = Math.floor(Math.random() * 5_000_000 + 100_000);
        const ts = new Date(Date.now() - i * 60_000 * (Math.random() * 5 + 1));
        await pgPool.query(
          `INSERT INTO trade_history (pair, price, amount, side, executed_at) VALUES ($1,$2,$3,$4,$5)`,
          ['GYDS/USDT', price, amount, side, ts.toISOString()]
        );
      }
    }
  },

  async getTradeHistory(pair = 'GYDS/USDT', limit = 40) {
    const res = await pgPool.query(
      `SELECT id, pair, price::text, amount::text, side, executed_at FROM trade_history WHERE pair=$1 ORDER BY executed_at DESC LIMIT $2`,
      [pair, limit]
    );
    return res.rows;
  },

  async recordTrade(pair: string, price: string, amount: string, side: string, takerId?: string, makerId?: string) {
    const res = await pgPool.query(
      `INSERT INTO trade_history (pair, price, amount, side, taker_id, maker_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [pair, price, amount, side, takerId || null, makerId || null]
    );
    return res.rows[0];
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  async initNotificationTable() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'announcement',
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        read BOOLEAN DEFAULT false,
        dismissed BOOLEAN DEFAULT false,
        link TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS notif_user_idx ON user_notifications(user_id, created_at DESC);
    `);
  },

  async getUserNotifications(userId: string) {
    const res = await pgPool.query(
      `SELECT id, type, title, body, read, link, created_at
       FROM user_notifications
       WHERE user_id=$1 AND dismissed=false
       ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    return res.rows;
  },

  async createNotification(userId: string, type: string, title: string, body: string, link?: string) {
    const res = await pgPool.query(
      `INSERT INTO user_notifications (user_id,type,title,body,link) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [userId, type, title, body, link ?? null]
    );
    return res.rows[0];
  },

  async markNotificationRead(userId: string, id: string) {
    await pgPool.query(`UPDATE user_notifications SET read=true WHERE id=$1 AND user_id=$2`, [id, userId]);
  },

  async markAllNotificationsRead(userId: string) {
    await pgPool.query(`UPDATE user_notifications SET read=true WHERE user_id=$1`, [userId]);
  },

  async dismissNotification(userId: string, id: string) {
    await pgPool.query(`UPDATE user_notifications SET dismissed=true WHERE id=$1 AND user_id=$2`, [id, userId]);
  },

  // ── Webhook Deliveries ────────────────────────────────────────────────────
  async initWebhookDeliveriesTable() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        webhook_id UUID NOT NULL,
        event TEXT NOT NULL,
        payload JSONB,
        response_status INTEGER,
        response_body TEXT,
        duration_ms INTEGER,
        success BOOLEAN DEFAULT false,
        attempted_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS wh_delivery_webhook_idx ON webhook_deliveries(webhook_id, attempted_at DESC);
    `);
  },

  async getWebhookDeliveries(userId: string, webhookId: string) {
    const owns = await pgPool.query(
      `SELECT id FROM webhook_endpoints WHERE id=$1 AND user_id=$2`, [webhookId, userId]
    );
    if (!owns.rows.length) throw new Error('Not found');
    const res = await pgPool.query(
      `SELECT id, event, response_status, success, duration_ms, attempted_at FROM webhook_deliveries
       WHERE webhook_id=$1 ORDER BY attempted_at DESC LIMIT 30`,
      [webhookId]
    );
    return res.rows;
  },

  // ── Oracle Tables ─────────────────────────────────────────────────────────
  async initOracleTables() {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS oracle_feeds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        feed_id TEXT NOT NULL UNIQUE,
        description TEXT,
        value NUMERIC DEFAULT 0,
        decimals INTEGER DEFAULT 8,
        provider TEXT DEFAULT 'internal',
        active BOOLEAN DEFAULT true,
        last_updated TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS oracle_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        feed_id TEXT NOT NULL,
        submitter TEXT NOT NULL,
        value NUMERIC NOT NULL,
        block_height BIGINT,
        submitted_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS oracle_sub_feed_idx ON oracle_submissions(feed_id, submitted_at DESC);
    `);
    const count = await pgPool.query(`SELECT COUNT(*) FROM oracle_feeds`);
    if (parseInt(count.rows[0].count) === 0) {
      await pgPool.query(`
        INSERT INTO oracle_feeds (feed_id, description, value, provider) VALUES
        ('GYDS/USD', 'GYDSchain native coin price in USD', 0.0000001, 'internal'),
        ('GYD/USD',  'GYD stablecoin price in USD', 1.0, 'internal'),
        ('BTC/USD',  'Bitcoin price in USD', 65000.0, 'external'),
        ('ETH/USD',  'Ethereum price in USD', 3500.0, 'external')
        ON CONFLICT (feed_id) DO NOTHING
      `);
    }
  },

  async getOracleFeeds() {
    const res = await pgPool.query(`SELECT * FROM oracle_feeds ORDER BY feed_id`);
    return res.rows;
  },

  async updateOracleFeed(feedId: string, value: number) {
    const res = await pgPool.query(
      `UPDATE oracle_feeds SET value=$1, last_updated=NOW() WHERE feed_id=$2 RETURNING *`,
      [value, feedId]
    );
    if (res.rows[0]) {
      await pgPool.query(
        `INSERT INTO oracle_submissions (feed_id, submitter, value) VALUES ($1,'admin',$2)`,
        [feedId, value]
      );
    }
    return res.rows[0];
  },

  async getOracleSubmissions(feedId: string) {
    const res = await pgPool.query(
      `SELECT * FROM oracle_submissions WHERE feed_id=$1 ORDER BY submitted_at DESC LIMIT 50`,
      [feedId]
    );
    return res.rows;
  },

  // ── Admin Config (bridge fee etc.) ────────────────────────────────────────
  async getAdminConfig(key: string) {
    const res = await pgPool.query(
      `SELECT config_value FROM admin_config WHERE config_key=$1 LIMIT 1`, [key]
    ).catch(() => ({ rows: [] }));
    const v = res.rows[0]?.config_value;
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') return String(Object.values(v)[0] ?? JSON.stringify(v));
    return String(v).replace(/^"|"$/g, '');
  },

  async setAdminConfig(key: string, value: string) {
    await pgPool.query(
      `INSERT INTO admin_config (config_key, config_value) VALUES ($1,$2::jsonb)
       ON CONFLICT (config_key) DO UPDATE SET config_value=EXCLUDED.config_value, updated_at=NOW()`,
      [key, JSON.stringify(value)]
    );
  },

  // ── Leaderboard Reset ─────────────────────────────────────────────────────
  async resetLeaderboard() {
    await pgPool.query(`
      UPDATE user_xp SET total_xp=0, level=1 WHERE true;
      TRUNCATE xp_events;
    `);
    return { ok: true, reset_at: new Date().toISOString() };
  },

  // ── Token Launch Admin ────────────────────────────────────────────────────
  async getPendingLaunches() {
    const res = await pgPool.query(`
      SELECT tl.*, u.username, u.email
      FROM token_launches tl
      LEFT JOIN users u ON u.id::text = tl.creator_id::text
      ORDER BY tl.created_at DESC
    `).catch(() => pgPool.query(`SELECT * FROM token_launches ORDER BY created_at DESC`));
    return res.rows;
  },

  async updateLaunchVisibility(launchId: string, visible: boolean) {
    const res = await pgPool.query(
      `UPDATE token_launches SET is_visible=$1 WHERE id=$2 RETURNING *`,
      [visible, launchId]
    ).catch(async () => {
      await pgPool.query(`ALTER TABLE token_launches ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true`);
      return pgPool.query(`UPDATE token_launches SET is_visible=$1 WHERE id=$2 RETURNING *`, [visible, launchId]);
    });
    return res.rows[0];
  },

  // ── KYC Tier Upgrade ──────────────────────────────────────────────────────
  async upgradeKycTier(userId: number, newTier: number) {
    const res = await pgPool.query(`
      UPDATE kyc_records SET tier=$1, updated_at=NOW() WHERE user_id=$2 RETURNING *
    `, [newTier, userId]).catch(() => ({ rows: [] }));
    if (!res.rows.length) {
      const ins = await pgPool.query(
        `INSERT INTO kyc_records (user_id,tier) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET tier=$2 RETURNING *`,
        [userId, newTier]
      ).catch(() => ({ rows: [{ user_id: userId, tier: newTier }] }));
      return ins.rows[0];
    }
    return res.rows[0];
  },

  // ── RWA Yield Stats ───────────────────────────────────────────────────────
  async getRwaYieldStats(userId: string) {
    const holdings = await pgPool.query(`
      SELECT h.tokens_held, h.invested_amount, h.created_at,
             a.name, a.type, a.apy, a.token_price, a.currency
      FROM rwa_holdings h
      JOIN rwa_assets a ON a.id=h.asset_id
      WHERE h.user_id=$1
    `, [userId]);
    const stats = holdings.rows.map((h: any) => {
      const yearlyYield = Number(h.invested_amount) * (Number(h.apy) / 100);
      const daysHeld = Math.max(1, (Date.now() - new Date(h.created_at).getTime()) / 86400000);
      const accruedYield = (yearlyYield / 365) * daysHeld;
      return {
        ...h,
        yearly_yield: yearlyYield.toFixed(2),
        accrued_yield: accruedYield.toFixed(2),
        next_payout: new Date(Date.now() + (90 - (daysHeld % 90)) * 86400000).toISOString().split('T')[0],
      };
    });
    const totalInvested = stats.reduce((s: number, h: any) => s + Number(h.invested_amount), 0);
    const totalYearlyYield = stats.reduce((s: number, h: any) => s + Number(h.yearly_yield), 0);
    const totalAccrued = stats.reduce((s: number, h: any) => s + Number(h.accrued_yield), 0);
    return { holdings: stats, totalInvested, totalYearlyYield, totalAccrued };
  },

  // ── REST API v1 helpers ───────────────────────────────────────────────────
  async getBlockByHeight(height: number) {
    const txCount = await pgPool.query(`SELECT COUNT(*) FROM transactions`).catch(() => ({ rows: [{ count: 0 }] }));
    const totalTx = parseInt(txCount.rows[0].count) || 0;
    const baseHeight = Math.max(1, totalTx);
    if (height > baseHeight + 100000) return null;
    const blockHash = '0x' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    const parentHash = '0x' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    const txsInBlock = Math.floor(Math.random() * 50) + 1;
    return {
      height,
      hash: blockHash,
      parent_hash: parentHash,
      timestamp: new Date(Date.now() - (baseHeight - height) * 2000).toISOString(),
      tx_count: txsInBlock,
      validator: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      gas_used: txsInBlock * 21000,
      gas_limit: 30000000,
      size_bytes: txsInBlock * 250 + 508,
      chain_id: 13370,
    };
  },

  async getTxByHash(hash: string) {
    const res = await pgPool.query(
      `SELECT * FROM transactions WHERE hash=$1 LIMIT 1`, [hash]
    ).catch(() => ({ rows: [] }));
    if (res.rows[0]) {
      return { ...res.rows[0], chain_id: 13370, status: 'success' };
    }
    return null;
  },

  async submitTransaction(signedTx: string) {
    const txHash = '0x' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    await pgPool.query(
      `INSERT INTO transactions (hash, type, status, data) VALUES ($1,'transfer','pending',$2) ON CONFLICT DO NOTHING`,
      [txHash, JSON.stringify({ raw: signedTx })]
    ).catch(() => {});
    return { tx_hash: txHash, status: 'pending', chain_id: 13370 };
  },

  // ── Network Stats ─────────────────────────────────────────────────────────
  async getNetworkStats() {
    const cutoff = new Date(Date.now() - 90 * 1000);
    const [activeValidators, activeMiners, totalTransactions, totalTokensCount, liveNodes] = await Promise.all([
      this.countActiveValidators(),
      this.countOnlineNodes(),
      this.countTransactions(),
      this.countTokens(),
      this.getLiveNodes(cutoff),
    ]);
    const totalHashrate = liveNodes.reduce((s, n) => s + (Number(n.hashRate) || 0), 0);
    return { activeValidators, activeMiners, totalTransactions, totalTokens: totalTokensCount, liveNodes: liveNodes.length, networkHashRateThps: totalHashrate / 1e12 };
  },

  // ── User Features ──────────────────────────────────────────────────────────
  async getUserFeatures(userId: string) {
    const res = await pgPool.query(
      `SELECT id, user_id, feature_key, enabled, granted_by, granted_at
       FROM user_features WHERE user_id=$1 AND enabled=true`,
      [userId]
    ).catch(async () => {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS user_features (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          feature_key TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT true,
          granted_by TEXT NOT NULL,
          granted_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, feature_key)
        )`
      );
      return pgPool.query(
        `SELECT id, user_id, feature_key, enabled, granted_by, granted_at FROM user_features WHERE user_id=$1 AND enabled=true`,
        [userId]
      );
    });
    return res.rows;
  },

  async getUserFeaturesWithAll(userId: string) {
    const res = await pgPool.query(
      `SELECT id, user_id, feature_key, enabled, granted_by, granted_at
       FROM user_features WHERE user_id=$1`,
      [userId]
    ).catch(() => ({ rows: [] }));
    return res.rows;
  },

  async setUserFeature(userId: string, featureKey: string, enabled: boolean, grantedBy: string) {
    await pgPool.query(
      `INSERT INTO user_features (user_id, feature_key, enabled, granted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, feature_key)
       DO UPDATE SET enabled=$3, granted_by=$4, updated_at=NOW()`,
      [userId, featureKey, enabled, grantedBy]
    ).catch(async () => {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS user_features (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          feature_key TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT true,
          granted_by TEXT NOT NULL,
          granted_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, feature_key)
        )`
      );
      return pgPool.query(
        `INSERT INTO user_features (user_id, feature_key, enabled, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, feature_key)
         DO UPDATE SET enabled=$3, granted_by=$4, updated_at=NOW()`,
        [userId, featureKey, enabled, grantedBy]
      );
    });
    return { ok: true };
  },

  async revokeAllUserFeatures(userId: string) {
    await pgPool.query(
      `UPDATE user_features SET enabled=false, updated_at=NOW() WHERE user_id=$1`,
      [userId]
    );
    return { ok: true };
  },

  async grantAllUserFeatures(userId: string, grantedBy: string, featureKeys: string[]) {
    const values = featureKeys.map((k, i) => `($1, $${i + 2}, true, $${featureKeys.length + 2})`).join(', ');
    const params = [userId, ...featureKeys, grantedBy];
    await pgPool.query(
      `INSERT INTO user_features (user_id, feature_key, enabled, granted_by)
       VALUES ${values}
       ON CONFLICT (user_id, feature_key) DO UPDATE SET enabled=true, granted_by=EXCLUDED.granted_by, updated_at=NOW()`,
      params
    ).catch(() => ({ rows: [] }));
    return { ok: true };
  },
};
