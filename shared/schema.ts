import { pgTable, text, uuid, boolean, timestamp, numeric, integer, bigint, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const appRoleEnum = pgEnum("app_role", ["user", "admin", "founder"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  walletAddress: text("wallet_address").unique(),
  authNonce: text("auth_nonce"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").default(false),
  isBanned: boolean("is_banned").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: appRoleEnum("role").notNull().default("user"),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  email: text("email"),
  role: text("role").notNull().default("user"),
  displayName: text("display_name"),
  username: text("username"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  locale: text("locale").default("en"),
  timezone: text("timezone").default("UTC"),
  notificationPrefs: jsonb("notification_prefs"),
  metadata: jsonb("metadata"),
  preferredCurrency: text("preferred_currency").default("USD"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  encryptedSeed: text("encrypted_seed").notNull().default(""),
  pinHash: text("pin_hash").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

export const nodeInstallations = pgTable("node_installations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nodeType: text("node_type").notNull(),
  ipAddress: text("ip_address"),
  hostname: text("hostname"),
  rpcPort: integer("rpc_port").default(8545),
  wireguardPublicKey: text("wireguard_public_key"),
  wireguardPrivateKey: text("wireguard_private_key"),
  isSynced: boolean("is_synced").default(false),
  lastSyncAt: timestamp("last_sync_at"),
  isApproved: boolean("is_approved").default(false),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  isOnline: boolean("is_online").default(false),
  lastHeartbeat: timestamp("last_heartbeat"),
  hashRate: bigint("hash_rate", { mode: "number" }).default(0),
  validShares: bigint("valid_shares", { mode: "number" }).default(0),
  totalRewards: numeric("total_rewards").default("0"),
  uptimeSeconds: bigint("uptime_seconds", { mode: "number" }).default(0),
  connectionQuality: integer("connection_quality").default(100),
  syncProgress: integer("sync_progress").default(0),
  blocksSynced: bigint("blocks_synced", { mode: "number" }).default(0),
  lastBlockHeight: bigint("last_block_height", { mode: "number" }).default(0),
  errorCount: integer("error_count").default(0),
  peerCount: integer("peer_count").default(0),
  storageSizeGb: integer("storage_size_gb").default(0),
  diskUsedGb: numeric("disk_used_gb").default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  amount: numeric("amount").notNull(),
  fee: numeric("fee").notNull().default("0.001"),
  txHash: text("tx_hash").unique(),
  status: text("status").notNull().default("pending"),
  blockHeight: bigint("block_height", { mode: "number" }),
  walletId: uuid("wallet_id"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenSymbol: text("token_symbol").notNull().default("GYD"),
  createdAt: timestamp("created_at").defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
  network: text("network").notNull().default("testnet"),
});

export const documentation = pgTable("documentation", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const adminConfig = pgTable("admin_config", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  configKey: text("config_key").unique().notNull(),
  configValue: jsonb("config_value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tokenOperations = pgTable("token_operations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  operationType: text("operation_type").notNull(),
  amount: numeric("amount").notNull(),
  usdtAmount: numeric("usdt_amount").default("0"),
  walletAddress: text("wallet_address").notNull(),
  txHash: text("tx_hash"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").notNull().default("pending"),
  network: text("network").notNull().default("testnet"),
});

export const tokenPrice = pgTable("token_price", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  price: numeric("price").notNull().default("0.0000001"),
  totalSupply: numeric("total_supply").notNull().default("1000000000"),
  circulatingSupply: numeric("circulating_supply").notNull().default("0"),
  burnedTotal: numeric("burned_total").notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tokens = pgTable("tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: text("creator_id").notNull(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  decimals: integer("decimals").notNull().default(18),
  totalSupply: numeric("total_supply").notNull(),
  burnedSupply: numeric("burned_supply").notNull().default("0"),
  gydsLiquidity: numeric("gyds_liquidity").notNull().default("0"),
  logoUrl: text("logo_url"),
  lpLockType: text("lp_lock_type").notNull().default("burned"),
  lpUnlockTime: timestamp("lp_unlock_time"),
  freezeEnabled: boolean("freeze_enabled").notNull().default(false),
  freezeHolder: text("freeze_holder"),
  freezeLocked: boolean("freeze_locked").notNull().default(false),
  updateEnabled: boolean("update_enabled").notNull().default(false),
  updateHolder: text("update_holder"),
  updateLocked: boolean("update_locked").notNull().default(false),
  mintEnabled: boolean("mint_enabled").notNull().default(false),
  mintHolder: text("mint_holder"),
  mintLocked: boolean("mint_locked").notNull().default(false),
  address: text("address").notNull(),
  tokenStandard: text("token_standard").notNull().default("GRC-20"),
  isActive: boolean("is_active").notNull().default(true),
  networkType: text("network_type").notNull().default("devnet"),
  mainnetPromotedAt: timestamp("mainnet_promoted_at"),
  marketCapUsd: numeric("market_cap_usd").notNull().default("0"),
  extraAuthorities: jsonb("extra_authorities").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tokenLaunches = pgTable("token_launches", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: text("creator_id").notNull(),
  tokenId: uuid("token_id"),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  status: text("status").notNull().default("pending"),
  targetRaise: numeric("target_raise").notNull().default("0"),
  raisedAmount: numeric("raised_amount").notNull().default("0"),
  participants: integer("participants").notNull().default(0),
  bondingCurveType: text("bonding_curve_type").notNull().default("linear"),
  bondingCurveSteepness: numeric("bonding_curve_steepness").notNull().default("1.0"),
  initialPrice: numeric("initial_price").notNull().default("0.001"),
  maxPrice: numeric("max_price"),
  isPremier: boolean("is_premier").notNull().default(false),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const liquidityPools = pgTable("liquidity_pools", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: text("creator_id").notNull(),
  tokenASymbol: text("token_a_symbol").notNull(),
  tokenBSymbol: text("token_b_symbol").notNull(),
  tokenAAddress: text("token_a_address"),
  tokenBAddress: text("token_b_address"),
  feeTier: numeric("fee_tier").notNull().default("0.3"),
  tvl: numeric("tvl").notNull().default("0"),
  volume24h: numeric("volume_24h").notNull().default("0"),
  fees24h: numeric("fees_24h").notNull().default("0"),
  apr: numeric("apr").notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tokenWatchlist = pgTable("token_watchlist", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenId: uuid("token_id").notNull().references(() => tokens.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tokenPriceAlerts = pgTable("token_price_alerts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenId: uuid("token_id").notNull().references(() => tokens.id, { onDelete: "cascade" }),
  targetPrice: numeric("target_price").notNull(),
  direction: text("direction").notNull().default("above"),
  isTriggered: boolean("is_triggered").notNull().default(false),
  triggeredAt: timestamp("triggered_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const networkValidators = pgTable("network_validators", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull().unique(),
  name: text("name"),
  stake: numeric("stake").notNull().default("0"),
  commission: integer("commission").notNull().default(10),
  isActive: boolean("is_active").notNull().default(true),
  isJailed: boolean("is_jailed").notNull().default(false),
  uptime: numeric("uptime").notNull().default("100.00"),
  blocksProposed: bigint("blocks_proposed", { mode: "number" }).notNull().default(0),
  lastVoteHeight: bigint("last_vote_height", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: text("created_by"),
});

export const validatorDelegations = pgTable("validator_delegations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  validatorId: uuid("validator_id").notNull().references(() => networkValidators.id, { onDelete: "cascade" }),
  amount: numeric("amount").notNull().default("0"),
  status: text("status").notNull().default("active"),
  delegatedAt: timestamp("delegated_at").defaultNow(),
  undelegatedAt: timestamp("undelegated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const firewallRules = pgTable("firewall_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleType: text("rule_type").notNull().default("ufw"),
  action: text("action").notNull().default("allow"),
  protocol: text("protocol").notNull().default("tcp"),
  port: text("port"),
  ipAddress: text("ip_address"),
  direction: text("direction").notNull().default("in"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const fail2banJails = pgTable("fail2ban_jails", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jailName: text("jail_name").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  maxRetries: integer("max_retries").notNull().default(5),
  banTime: integer("ban_time").notNull().default(3600),
  findTime: integer("find_time").notNull().default(600),
  logPath: text("log_path"),
  filterName: text("filter_name"),
  action: text("action").default("iptables-multiport"),
  description: text("description"),
  bannedIps: text("banned_ips").array().default(sql`'{}'`),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const ipAccessList = pgTable("ip_access_list", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ipAddress: text("ip_address").notNull(),
  listType: text("list_type").notNull().default("whitelist"),
  reason: text("reason"),
  expiresAt: timestamp("expires_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rateLimitRules = pgTable("rate_limit_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  endpoint: text("endpoint").notNull(),
  requestsPerWindow: integer("requests_per_window").notNull().default(100),
  windowSeconds: integer("window_seconds").notNull().default(60),
  burstLimit: integer("burst_limit").notNull().default(20),
  action: text("action").notNull().default("throttle"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  description: text("description"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const ddosProtection = pgTable("ddos_protection", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  protectionType: text("protection_type").notNull().default("syn_flood"),
  threshold: integer("threshold").notNull().default(1000),
  action: text("action").notNull().default("drop"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  parameters: jsonb("parameters").default(sql`'{}'::jsonb`),
  description: text("description"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  userEmail: text("user_email"),
  action: text("action").notNull(),
  category: text("category").notNull().default("general"),
  targetType: text("target_type"),
  targetId: text("target_id"),
  details: jsonb("details").default(sql`'{}'::jsonb`),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const faucetClaims = pgTable("faucet_claims", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  tokenType: text("token_type").notNull(),
  amount: numeric("amount").notNull(),
  txHash: text("tx_hash"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
  network: text("network").notNull().default("testnet"),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  side: text("side").notNull(),
  orderType: text("order_type").notNull(),
  price: numeric("price"),
  stopPrice: numeric("stop_price"),
  amount: numeric("amount").notNull(),
  filled: numeric("filled").notNull().default("0"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const vaultPositions = pgTable("vault_positions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vaultId: text("vault_id").notNull(),
  vaultName: text("vault_name").notNull(),
  token: text("token").notNull(),
  amount: numeric("amount").notNull(),
  apy: numeric("apy").notNull(),
  autoCompound: boolean("auto_compound").notNull().default(true),
  lockDays: integer("lock_days"),
  lockedUntil: timestamp("locked_until"),
  status: text("status").notNull().default("active"),
  depositedAt: timestamp("deposited_at").defaultNow(),
  withdrawnAt: timestamp("withdrawn_at"),
});

export const governanceProposals = pgTable("governance_proposals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  proposalType: text("proposal_type").notNull().default("parameter"),
  status: text("status").notNull().default("active"),
  votesFor: numeric("votes_for").notNull().default("0"),
  votesAgainst: numeric("votes_against").notNull().default("0"),
  votesAbstain: numeric("votes_abstain").notNull().default("0"),
  quorumRequired: numeric("quorum_required").notNull().default("1000000"),
  createdBy: text("created_by").notNull().references(() => users.id),
  endDate: timestamp("end_date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const governanceVotes = pgTable("governance_votes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: uuid("proposal_id").notNull().references(() => governanceProposals.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  choice: text("choice").notNull(),
  votingPower: numeric("voting_power").notNull().default("1"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const communityPosts = pgTable("community_posts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  postType: text("post_type").notNull().default("discussion"),
  upvotes: integer("upvotes").notNull().default(0),
  downvotes: integer("downvotes").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const communityComments = pgTable("community_comments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: uuid("post_id").notNull().references(() => communityPosts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  upvotes: integer("upvotes").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const communityVotes = pgTable("community_votes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id),
  targetId: uuid("target_id").notNull(),
  targetType: text("target_type").notNull(),
  direction: text("direction").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userXp = pgTable("user_xp", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  totalXp: integer("total_xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const xpEvents = pgTable("xp_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  xpAwarded: integer("xp_awarded").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const achievements = pgTable("achievements", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  xpReward: integer("xp_reward").notNull().default(0),
  icon: text("icon").notNull().default("🏆"),
  category: text("category").notNull().default("general"),
});

export const userAchievements = pgTable("user_achievements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  achievementId: text("achievement_id").notNull().references(() => achievements.id),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
});

export const userStablecoins = pgTable("user_stablecoins", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: text("creator_id").notNull(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull().unique(),
  decimals: integer("decimals").notNull().default(18),
  description: text("description"),
  logoUrl: text("logo_url"),
  // Peg
  pegType: text("peg_type").notNull().default("usd"),       // usd|eur|gbp|btc|eth|gold|custom|basket
  pegValue: numeric("peg_value").notNull().default("1.00"),  // target price in USD
  basketWeights: jsonb("basket_weights").default(sql`'[]'::jsonb`),
  // Collateral model
  collateralType: text("collateral_type").notNull().default("over_collateralized"), // over_collateralized|algorithmic|hybrid|fiat_backed
  collateralRatio: numeric("collateral_ratio").notNull().default("150"),   // e.g. 150 = 150%
  liquidationThreshold: numeric("liquidation_threshold").notNull().default("120"), // e.g. 120 = 120%
  reserveAssets: jsonb("reserve_assets").notNull().default(sql`'["GYD","GYDS"]'::jsonb`),
  // Fees
  stabilityFee: numeric("stability_fee").notNull().default("2.50"),   // annual %
  mintingFee: numeric("minting_fee").notNull().default("0.50"),        // per-mint %
  burnFee: numeric("burn_fee").notNull().default("0.10"),              // per-burn %
  // Supply stats
  totalSupply: numeric("total_supply").notNull().default("0"),
  circulatingSupply: numeric("circulating_supply").notNull().default("0"),
  totalCollateralUsd: numeric("total_collateral_usd").notNull().default("0"),
  // Links
  websiteUrl: text("website_url"),
  twitterUrl: text("twitter_url"),
  address: text("address"),
  // Status
  status: text("status").notNull().default("pending_review"), // draft|pending_review|active|paused|deprecated
  isApproved: boolean("is_approved").notNull().default(false),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  pausedReason: text("paused_reason"),
  // Creation fee paid
  creationFeePaid: numeric("creation_fee_paid").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userFeatures = pgTable("user_features", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  grantedBy: text("granted_by").notNull(),
  grantedAt: timestamp("granted_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const paymentMethods = pgTable("payment_methods", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  instructions: text("instructions"),
  icon: text("icon"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  configJson: text("config_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const governanceTreasury = pgTable("governance_treasury", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  coin: text("coin").notNull(),
  balance: numeric("balance").notNull().default("0"),
  usdValue: numeric("usd_value").notNull().default("0"),
  address: text("address"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const nftCollections = pgTable("nft_collections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description"),
  floorPrice: numeric("floor_price").notNull().default("0"),
  volume24h: numeric("volume_24h").notNull().default("0"),
  change24h: numeric("change_24h").notNull().default("0"),
  totalItems: integer("total_items").notNull().default(0),
  imageEmoji: text("image_emoji"),
  creatorAddress: text("creator_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const nftTokens = pgTable("nft_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: uuid("collection_id").references(() => nftCollections.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenId: integer("token_id").notNull(),
  ownerAddress: text("owner_address"),
  price: numeric("price").notNull().default("0"),
  lastSale: numeric("last_sale"),
  rarity: text("rarity"),
  imageEmoji: text("image_emoji"),
  listed: boolean("listed").notNull().default(false),
  metadata: jsonb("metadata"),
  mintedAt: timestamp("minted_at").defaultNow(),
});

export const insurancePools = pgTable("insurance_pools", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  coverageType: text("coverage_type").notNull(),
  description: text("description"),
  totalCoverage: numeric("total_coverage").notNull().default("0"),
  totalStaked: numeric("total_staked").notNull().default("0"),
  premiumRate: numeric("premium_rate").notNull().default("0"),
  claimPeriod: integer("claim_period").notNull().default(30),
  minCoverage: numeric("min_coverage").notNull().default("0"),
  maxCoverage: numeric("max_coverage").notNull().default("0"),
  imageEmoji: text("image_emoji"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insurancePolicies = pgTable("insurance_policies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  poolId: uuid("pool_id").references(() => insurancePools.id),
  holderId: integer("holder_id").notNull(),
  coverageAmount: numeric("coverage_amount").notNull(),
  premiumPaid: numeric("premium_paid").notNull().default("0"),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  status: text("status").notNull().default("active"),
  claimReason: text("claim_reason"),
  claimSubmittedAt: timestamp("claim_submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const priceHistory = pgTable("price_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  coin: text("coin").notNull(),
  open: numeric("open").notNull(),
  close: numeric("close").notNull(),
  high: numeric("high").notNull(),
  low: numeric("low").notNull(),
  volume: bigint("volume", { mode: "number" }).notNull().default(0),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const rwaAssets = pgTable("rwa_assets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  totalValue: numeric("total_value").notNull().default("0"),
  tokenPrice: numeric("token_price").notNull().default("1"),
  tokensAvailable: integer("tokens_available").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  apy: numeric("apy").notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  jurisdiction: text("jurisdiction"),
  audited: boolean("audited").notNull().default(false),
  maturity: text("maturity"),
  docCid: text("doc_cid"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rwaHoldings = pgTable("rwa_holdings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  assetId: uuid("asset_id").references(() => rwaAssets.id),
  tokensHeld: numeric("tokens_held").notNull().default("0"),
  investedAmount: numeric("invested_amount").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const networkSnapshots = pgTable("network_snapshots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  activeValidators: integer("active_validators").notNull().default(0),
  activeNodes: integer("active_nodes").notNull().default(0),
  totalTransactions: bigint("total_transactions", { mode: "number" }).notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  tps: numeric("tps").notNull().default("0"),
  capturedAt: timestamp("captured_at").defaultNow(),
});

export const tradeHistory = pgTable("trade_history", {
  id: integer("id").primaryKey(),
  pair: text("pair").notNull(),
  price: numeric("price").notNull(),
  amount: numeric("amount").notNull(),
  side: text("side").notNull(),
  takerId: text("taker_id"),
  makerId: text("maker_id"),
  executedAt: timestamp("executed_at").defaultNow(),
});

export const oracleFeeds = pgTable("oracle_feeds", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  feedId: text("feed_id").notNull(),
  description: text("description"),
  value: numeric("value").notNull().default("0"),
  decimals: integer("decimals").notNull().default(8),
  provider: text("provider"),
  active: boolean("active").notNull().default(true),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const oracleSubmissions = pgTable("oracle_submissions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  feedId: text("feed_id").notNull(),
  submitter: text("submitter").notNull(),
  value: numeric("value").notNull(),
  blockHeight: bigint("block_height", { mode: "number" }),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  scopes: text("scopes").array().default(sql`'{}'`),
  requestCount: integer("request_count").notNull().default(0),
  requestLimit: integer("request_limit").notNull().default(10000),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const apiUsageLogs = pgTable("api_usage_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  keyId: uuid("key_id"),
  userId: text("user_id"),
  endpoint: text("endpoint"),
  method: text("method"),
  statusCode: integer("status_code"),
  latencyMs: integer("latency_ms"),
  loggedAt: timestamp("logged_at").defaultNow(),
});

export const bridgeTransfers = pgTable("bridge_transfers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: integer("user_id"),
  fromChain: text("from_chain").notNull(),
  toChain: text("to_chain").notNull(),
  fromToken: text("from_token").notNull(),
  toToken: text("to_token").notNull(),
  amount: numeric("amount").notNull(),
  received: numeric("received"),
  fee: numeric("fee").notNull().default("0"),
  status: text("status").notNull().default("pending"),
  txHash: text("tx_hash"),
  destTxHash: text("dest_tx_hash"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  code: text("code").notNull(),
  referredCount: integer("referred_count").notNull().default(0),
  totalEarned: numeric("total_earned").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referralEvents = pgTable("referral_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: text("referrer_id").notNull(),
  refereeId: text("referee_id").notNull(),
  rewardAmount: numeric("reward_amount").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const kycRecords = pgTable("kyc_records", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  tier: integer("tier").notNull().default(0),
  status: text("status").notNull().default("unverified"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const didDocuments = pgTable("did_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  did: text("did").notNull(),
  document: jsonb("document"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const socialVerifications = pgTable("social_verifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: integer("user_id").notNull(),
  platform: text("platform").notNull(),
  handle: text("handle"),
  challengeCode: text("challenge_code"),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  verifiedAt: timestamp("verified_at"),
});

export const trusts = pgTable("trusts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  feePaid: boolean("fee_paid").notNull().default(false),
  setupFeeTx: text("setup_fee_tx"),
  trusteeAddress: text("trustee_address"),
  successorTrustee: text("successor_trustee"),
  vaultBalance: numeric("vault_balance").notNull().default("0"),
  expiresAt: timestamp("expires_at"),
  activatedAt: timestamp("activated_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trustBeneficiaries = pgTable("trust_beneficiaries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  trustId: uuid("trust_id").references(() => trusts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  walletAddress: text("wallet_address"),
  percentage: numeric("percentage").notNull().default("0"),
  relationship: text("relationship"),
  conditionNote: text("condition_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trustConditions = pgTable("trust_conditions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  trustId: uuid("trust_id").references(() => trusts.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  description: text("description"),
  triggerDate: timestamp("trigger_date"),
  triggered: boolean("triggered").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trustPayments = pgTable("trust_payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  trustId: uuid("trust_id").references(() => trusts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  amount: numeric("amount").notNull(),
  paymentType: text("payment_type").notNull(),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const multisigWallets = pgTable("multisig_wallets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address").notNull(),
  threshold: integer("threshold").notNull().default(2),
  creatorId: text("creator_id").notNull(),
  balance: numeric("balance").notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const multisigSigners = pgTable("multisig_signers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  walletId: uuid("wallet_id").references(() => multisigWallets.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  name: text("name"),
  userId: text("user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const multisigTransactions = pgTable("multisig_transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  walletId: uuid("wallet_id").references(() => multisigWallets.id, { onDelete: "cascade" }),
  proposerId: text("proposer_id").notNull(),
  toAddress: text("to_address").notNull(),
  amount: numeric("amount").notNull(),
  symbol: text("symbol").notNull().default("GYD"),
  description: text("description"),
  approvals: integer("approvals").notNull().default(0),
  rejections: integer("rejections").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const multisigSignatures = pgTable("multisig_signatures", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  txId: uuid("tx_id").references(() => multisigTransactions.id, { onDelete: "cascade" }),
  signerId: text("signer_id").notNull(),
  action: text("action").notNull().default("approve"),
  signedAt: timestamp("signed_at").defaultNow(),
});

export const votingDelegations = pgTable("voting_delegations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  delegatorId: integer("delegator_id").notNull(),
  delegateAddress: text("delegate_address").notNull(),
  delegateUsername: text("delegate_username"),
  powerDelegated: integer("power_delegated").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  url: text("url").notNull(),
  secret: text("secret"),
  events: text("events").array().default(sql`'{}'`),
  active: boolean("active").notNull().default(true),
  deliveryCount: integer("delivery_count").notNull().default(0),
  lastDeliveredAt: timestamp("last_delivered_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  webhookId: uuid("webhook_id").references(() => webhookEndpoints.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: jsonb("payload"),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  durationMs: integer("duration_ms"),
  success: boolean("success").notNull().default(false),
  attemptedAt: timestamp("attempted_at").defaultNow(),
});

export const userNotifications = pgTable("user_notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  dismissed: boolean("dismissed").notNull().default(false),
  link: text("link"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const walletReleases = pgTable("wallet_releases", {
  id: integer("id").primaryKey(),
  platform: text("platform").notNull(),
  version: text("version").notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name"),
  fileSize: bigint("file_size", { mode: "number" }),
  notes: text("notes"),
  downloadCount: integer("download_count").notNull().default(0),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const buyRequests = pgTable("buy_requests", {
  id: integer("id").primaryKey(),
  userId: text("user_id").notNull(),
  paymentMethodId: integer("payment_method_id"),
  paymentMethodName: text("payment_method_name"),
  tokenSymbol: text("token_symbol").notNull(),
  tokenAmount: numeric("token_amount").notNull(),
  fiatAmount: numeric("fiat_amount"),
  fiatCurrency: text("fiat_currency").notNull().default("USD"),
  status: text("status").notNull().default("pending"),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

export const cashoutRequests = pgTable("cashout_requests", {
  id: integer("id").primaryKey(),
  userId: text("user_id").notNull(),
  asset: text("asset").notNull(),
  amount: numeric("amount").notNull(),
  destination: text("destination"),
  note: text("note"),
  reference: text("reference"),
  paymentMethod: text("payment_method"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});
