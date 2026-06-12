CREATE TYPE "public"."app_role" AS ENUM('user', 'admin', 'founder');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"xp_reward" integer DEFAULT 0 NOT NULL,
	"icon" text DEFAULT '🏆' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_key" text NOT NULL,
	"config_value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_config_config_key_unique" UNIQUE("config_key")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text,
	"action" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"post_type" text DEFAULT 'discussion' NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "community_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"target_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"direction" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ddos_protection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"protection_type" text DEFAULT 'syn_flood' NOT NULL,
	"threshold" integer DEFAULT 1000 NOT NULL,
	"action" text DEFAULT 'drop' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb,
	"description" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documentation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "documentation_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "fail2ban_jails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jail_name" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"max_retries" integer DEFAULT 5 NOT NULL,
	"ban_time" integer DEFAULT 3600 NOT NULL,
	"find_time" integer DEFAULT 600 NOT NULL,
	"log_path" text,
	"filter_name" text,
	"action" text DEFAULT 'iptables-multiport',
	"description" text,
	"banned_ips" text[] DEFAULT '{}',
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "faucet_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"token_type" text NOT NULL,
	"amount" numeric NOT NULL,
	"tx_hash" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "firewall_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_type" text DEFAULT 'ufw' NOT NULL,
	"action" text DEFAULT 'allow' NOT NULL,
	"protocol" text DEFAULT 'tcp' NOT NULL,
	"port" text,
	"ip_address" text,
	"direction" text DEFAULT 'in' NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "governance_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"proposal_type" text DEFAULT 'parameter' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"votes_for" numeric DEFAULT '0' NOT NULL,
	"votes_against" numeric DEFAULT '0' NOT NULL,
	"votes_abstain" numeric DEFAULT '0' NOT NULL,
	"quorum_required" numeric DEFAULT '1000000' NOT NULL,
	"created_by" text NOT NULL,
	"end_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "governance_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"choice" text NOT NULL,
	"voting_power" numeric DEFAULT '1' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ip_access_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" text NOT NULL,
	"list_type" text DEFAULT 'whitelist' NOT NULL,
	"reason" text,
	"expires_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "liquidity_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" text NOT NULL,
	"token_a_symbol" text NOT NULL,
	"token_b_symbol" text NOT NULL,
	"token_a_address" text,
	"token_b_address" text,
	"fee_tier" numeric DEFAULT '0.3' NOT NULL,
	"tvl" numeric DEFAULT '0' NOT NULL,
	"volume_24h" numeric DEFAULT '0' NOT NULL,
	"fees_24h" numeric DEFAULT '0' NOT NULL,
	"apr" numeric DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "network_validators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"name" text,
	"stake" numeric DEFAULT '0' NOT NULL,
	"commission" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_jailed" boolean DEFAULT false NOT NULL,
	"uptime" numeric DEFAULT '100.00' NOT NULL,
	"blocks_proposed" bigint DEFAULT 0 NOT NULL,
	"last_vote_height" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" text,
	CONSTRAINT "network_validators_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "node_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"node_type" text NOT NULL,
	"wireguard_public_key" text,
	"wireguard_private_key" text,
	"is_synced" boolean DEFAULT false,
	"last_sync_at" timestamp,
	"is_approved" boolean DEFAULT false,
	"approved_by" text,
	"approved_at" timestamp,
	"is_online" boolean DEFAULT false,
	"last_heartbeat" timestamp,
	"hash_rate" bigint DEFAULT 0,
	"valid_shares" bigint DEFAULT 0,
	"total_rewards" numeric DEFAULT '0',
	"uptime_seconds" bigint DEFAULT 0,
	"connection_quality" integer DEFAULT 100,
	"sync_progress" integer DEFAULT 0,
	"blocks_synced" bigint DEFAULT 0,
	"last_block_height" bigint DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"peer_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"side" text NOT NULL,
	"order_type" text NOT NULL,
	"price" numeric,
	"stop_price" numeric,
	"amount" numeric NOT NULL,
	"filled" numeric DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'user' NOT NULL,
	"display_name" text,
	"username" text,
	"bio" text,
	"avatar_url" text,
	"locale" text DEFAULT 'en',
	"timezone" text DEFAULT 'UTC',
	"notification_prefs" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"endpoint" text NOT NULL,
	"requests_per_window" integer DEFAULT 100 NOT NULL,
	"window_seconds" integer DEFAULT 60 NOT NULL,
	"burst_limit" integer DEFAULT 20 NOT NULL,
	"action" text DEFAULT 'throttle' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "token_launches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" text NOT NULL,
	"token_id" uuid,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"description" text,
	"logo_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"target_raise" numeric DEFAULT '0' NOT NULL,
	"raised_amount" numeric DEFAULT '0' NOT NULL,
	"participants" integer DEFAULT 0 NOT NULL,
	"bonding_curve_type" text DEFAULT 'linear' NOT NULL,
	"bonding_curve_steepness" numeric DEFAULT '1.0' NOT NULL,
	"initial_price" numeric DEFAULT '0.001' NOT NULL,
	"max_price" numeric,
	"is_premier" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "token_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_type" text NOT NULL,
	"amount" numeric NOT NULL,
	"usdt_amount" numeric DEFAULT '0',
	"wallet_address" text NOT NULL,
	"tx_hash" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_price" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price" numeric DEFAULT '0.0000001' NOT NULL,
	"total_supply" numeric DEFAULT '100000000000' NOT NULL,
	"circulating_supply" numeric DEFAULT '0' NOT NULL,
	"burned_total" numeric DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "token_price_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_id" uuid NOT NULL,
	"target_price" numeric NOT NULL,
	"direction" text DEFAULT 'above' NOT NULL,
	"is_triggered" boolean DEFAULT false NOT NULL,
	"triggered_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "token_watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"decimals" integer DEFAULT 18 NOT NULL,
	"total_supply" numeric NOT NULL,
	"burned_supply" numeric DEFAULT '0' NOT NULL,
	"gyds_liquidity" numeric DEFAULT '0' NOT NULL,
	"logo_url" text,
	"lp_lock_type" text DEFAULT 'burned' NOT NULL,
	"lp_unlock_time" timestamp,
	"freeze_enabled" boolean DEFAULT false NOT NULL,
	"freeze_holder" text,
	"freeze_locked" boolean DEFAULT false NOT NULL,
	"update_enabled" boolean DEFAULT false NOT NULL,
	"update_holder" text,
	"update_locked" boolean DEFAULT false NOT NULL,
	"mint_enabled" boolean DEFAULT false NOT NULL,
	"mint_holder" text,
	"mint_locked" boolean DEFAULT false NOT NULL,
	"address" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"network_type" text DEFAULT 'devnet' NOT NULL,
	"mainnet_promoted_at" timestamp,
	"market_cap_usd" numeric DEFAULT '0' NOT NULL,
	"extra_authorities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"amount" numeric NOT NULL,
	"fee" numeric DEFAULT '0.001' NOT NULL,
	"tx_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"block_height" bigint,
	"wallet_id" uuid,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"confirmed_at" timestamp,
	CONSTRAINT "transactions_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"unlocked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" "app_role" DEFAULT 'user' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_xp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_xp_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"username" text,
	"password_hash" text,
	"wallet_address" text,
	"auth_nonce" text,
	"first_name" text,
	"last_name" text,
	"profile_image_url" text,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false,
	"is_banned" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE "validator_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"validator_id" uuid NOT NULL,
	"amount" numeric DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"delegated_at" timestamp DEFAULT now(),
	"undelegated_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vault_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"vault_id" text NOT NULL,
	"vault_name" text NOT NULL,
	"token" text NOT NULL,
	"amount" numeric NOT NULL,
	"apy" numeric NOT NULL,
	"auto_compound" boolean DEFAULT true NOT NULL,
	"lock_days" integer,
	"locked_until" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"deposited_at" timestamp DEFAULT now(),
	"withdrawn_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"address" text NOT NULL,
	"encrypted_seed" text DEFAULT '' NOT NULL,
	"pin_hash" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"xp_awarded" integer NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_votes" ADD CONSTRAINT "community_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_proposals" ADD CONSTRAINT "governance_proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_votes" ADD CONSTRAINT "governance_votes_proposal_id_governance_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."governance_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_votes" ADD CONSTRAINT "governance_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_installations" ADD CONSTRAINT "node_installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_price_alerts" ADD CONSTRAINT "token_price_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_price_alerts" ADD CONSTRAINT "token_price_alerts_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_watchlist" ADD CONSTRAINT "token_watchlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_watchlist" ADD CONSTRAINT "token_watchlist_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_xp" ADD CONSTRAINT "user_xp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validator_delegations" ADD CONSTRAINT "validator_delegations_validator_id_network_validators_id_fk" FOREIGN KEY ("validator_id") REFERENCES "public"."network_validators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_positions" ADD CONSTRAINT "vault_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;