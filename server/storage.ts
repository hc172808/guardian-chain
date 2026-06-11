import { db } from "./db";
import { users, userRoles, profiles, wallets, nodeInstallations, transactions,
  documentation, adminConfig, tokenOperations, tokenPrice, tokens, tokenLaunches,
  liquidityPools, tokenWatchlist, tokenPriceAlerts, networkValidators,
  validatorDelegations, firewallRules, fail2banJails, ipAccessList,
  rateLimitRules, ddosProtection, auditLogs, faucetClaims, passwordResetTokens,
  orders, vaultPositions,
  governanceProposals, governanceVotes,
  communityPosts, communityComments, communityVotes } from "../shared/schema";
import { eq, and, gte, desc, sql, count, inArray } from "drizzle-orm";

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
    const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress));
    return user ?? null;
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
    return db.select().from(wallets).where(eq(wallets.userId, userId));
  },

  async insertWallet(data: typeof wallets.$inferInsert) {
    const [row] = await db.insert(wallets).values(data).returning();
    return row;
  },

  async deleteWallet(id: string, userId: string) {
    await db.delete(wallets).where(and(eq(wallets.id, id), eq(wallets.userId, userId)));
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
};
