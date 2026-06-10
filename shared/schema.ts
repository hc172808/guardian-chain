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
  createdAt: timestamp("created_at").defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
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
});

export const tokenPrice = pgTable("token_price", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  price: numeric("price").notNull().default("0.0000001"),
  totalSupply: numeric("total_supply").notNull().default("100000000000"),
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
});
