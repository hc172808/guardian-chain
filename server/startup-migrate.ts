/**
 * startup-migrate.ts — Runs once at server boot, before any middleware.
 *
 * Creates every core table with IF NOT EXISTS so the server can start cleanly
 * on a fresh database OR after schema drift caused by a failed drizzle-kit push.
 * This is the single source of truth for "the server can at least boot":
 * full schema changes should still go through Drizzle migrations, but this
 * file guarantees the minimum required tables are always present.
 *
 * ALL statements are idempotent — safe to run on every boot.
 */

import { Pool } from "pg";

export async function startupMigrate(pool: Pool): Promise<void> {
  const start = Date.now();
  const errors: string[] = [];

  async function run(label: string, sql: string) {
    try {
      await pool.query(sql);
    } catch (e: any) {
      // Ignore "already exists" errors — everything else is worth logging
      if (!e.message?.includes("already exists")) {
        errors.push(`[${label}] ${e.message}`);
      }
    }
  }

  // ── 0. Extension + enum ─────────────────────────────────────────────────────
  await run("uuid-ext",  `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  await run("app_role",  `
    DO $$ BEGIN
      CREATE TYPE public.app_role AS ENUM ('user','admin','founder');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `);

  // ── 1. Core auth tables (must exist before seed / session) ──────────────────
  await run("users", `
    CREATE TABLE IF NOT EXISTS users (
      id               TEXT PRIMARY KEY,
      email            TEXT,
      username         TEXT UNIQUE,
      password_hash    TEXT,
      wallet_address   TEXT UNIQUE,
      auth_nonce       TEXT,
      first_name       TEXT,
      last_name        TEXT,
      profile_image_url TEXT,
      totp_secret      TEXT,
      totp_enabled     BOOLEAN DEFAULT false,
      totp_backup_codes TEXT,
      is_banned        BOOLEAN DEFAULT false,
      phone            TEXT,
      last_login_ip    TEXT,
      last_login_at    TIMESTAMPTZ,
      preferred_currency TEXT DEFAULT 'USD',
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Add columns that were added in later migrations — safe no-ops if they already exist
  for (const col of [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT 'USD'`,
  ]) {
    await run("users-cols", col);
  }

  await run("user_roles", `
    CREATE TABLE IF NOT EXISTS user_roles (
      id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role    TEXT NOT NULL DEFAULT 'user'
    )
  `);

  await run("profiles", `
    CREATE TABLE IF NOT EXISTS profiles (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      email             TEXT,
      role              TEXT DEFAULT 'user',
      display_name      TEXT,
      username          TEXT,
      bio               TEXT,
      avatar_url        TEXT,
      locale            TEXT DEFAULT 'en',
      timezone          TEXT DEFAULT 'UTC',
      notification_prefs JSONB,
      metadata          JSONB,
      email_verified    BOOLEAN DEFAULT false,
      preferred_currency TEXT DEFAULT 'USD',
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (const col of [
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_currency TEXT DEFAULT 'USD'`,
  ]) {
    await run("profiles-cols", col);
  }

  // ── 2. Session + security tables ────────────────────────────────────────────
  await run("ip_bans", `
    CREATE TABLE IF NOT EXISTS ip_bans (
      ip          TEXT PRIMARY KEY,
      reason      TEXT,
      banned_by   TEXT,
      banned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ,
      auto        BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await run("ip_bans-idx", `CREATE INDEX IF NOT EXISTS idx_ip_bans_expires ON ip_bans(expires_at)`);

  await run("login_failures", `
    CREATE TABLE IF NOT EXISTS login_failures (
      ip           TEXT NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      email        TEXT
    )
  `);
  await run("login_failures-idx", `CREATE INDEX IF NOT EXISTS idx_login_failures_ip_time ON login_failures(ip, attempted_at)`);

  await run("login_lockouts", `
    CREATE TABLE IF NOT EXISTS login_lockouts (
      identifier   TEXT PRIMARY KEY,
      strikes      INT NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await run("login_lockouts-idx", `CREATE INDEX IF NOT EXISTS idx_login_lockouts_locked_until ON login_lockouts(locked_until)`);

  await run("email_verification_tokens", `
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL,
      token      TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
      used_at    TIMESTAMPTZ
    )
  `);

  await run("password_reset_tokens", `
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 3. Admin / config tables ─────────────────────────────────────────────────
  await run("admin_config", `
    CREATE TABLE IF NOT EXISTS admin_config (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      config_key   TEXT NOT NULL UNIQUE,
      config_value JSONB NOT NULL,
      updated_by   TEXT,
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("firewall_rules", `
    CREATE TABLE IF NOT EXISTS firewall_rules (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_type   TEXT DEFAULT 'ufw' NOT NULL,
      action      TEXT DEFAULT 'allow' NOT NULL,
      protocol    TEXT DEFAULT 'tcp' NOT NULL,
      port        TEXT,
      ip_address  TEXT,
      direction   TEXT DEFAULT 'in' NOT NULL,
      description TEXT,
      is_active   BOOLEAN DEFAULT true NOT NULL,
      created_by  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("audit_logs", `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT NOT NULL,
      user_email  TEXT,
      action      TEXT NOT NULL,
      category    TEXT DEFAULT 'general' NOT NULL,
      target_type TEXT,
      target_id   TEXT,
      details     JSONB DEFAULT '{}',
      ip_address  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 4. Wallet / token tables ─────────────────────────────────────────────────
  await run("wallets", `
    CREATE TABLE IF NOT EXISTS wallets (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      address        TEXT NOT NULL,
      encrypted_seed TEXT DEFAULT '' NOT NULL,
      pin_hash       TEXT DEFAULT '' NOT NULL,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("tokens", `
    CREATE TABLE IF NOT EXISTS tokens (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id          TEXT NOT NULL,
      name                TEXT NOT NULL,
      symbol              TEXT NOT NULL,
      decimals            INTEGER DEFAULT 18 NOT NULL,
      total_supply        NUMERIC NOT NULL,
      burned_supply       NUMERIC DEFAULT '0' NOT NULL,
      gyds_liquidity      NUMERIC DEFAULT '0' NOT NULL,
      logo_url            TEXT,
      lp_lock_type        TEXT DEFAULT 'burned' NOT NULL,
      lp_unlock_time      TIMESTAMPTZ,
      freeze_enabled      BOOLEAN DEFAULT false NOT NULL,
      freeze_holder       TEXT,
      freeze_locked       BOOLEAN DEFAULT false NOT NULL,
      update_enabled      BOOLEAN DEFAULT false NOT NULL,
      update_holder       TEXT,
      update_locked       BOOLEAN DEFAULT false NOT NULL,
      mint_enabled        BOOLEAN DEFAULT false NOT NULL,
      mint_holder         TEXT,
      mint_locked         BOOLEAN DEFAULT false NOT NULL,
      address             TEXT NOT NULL,
      token_standard      TEXT DEFAULT 'GRC-20' NOT NULL,
      is_active           BOOLEAN DEFAULT true NOT NULL,
      network_type        TEXT DEFAULT 'devnet' NOT NULL,
      mainnet_promoted_at TIMESTAMPTZ,
      market_cap_usd      NUMERIC DEFAULT '0' NOT NULL,
      extra_authorities   JSONB DEFAULT '{}' NOT NULL,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("transactions", `
    CREATE TABLE IF NOT EXISTS transactions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_address TEXT NOT NULL,
      to_address   TEXT NOT NULL,
      amount       NUMERIC NOT NULL,
      fee          NUMERIC DEFAULT '0.001' NOT NULL,
      tx_hash      TEXT UNIQUE,
      status       TEXT DEFAULT 'pending' NOT NULL,
      block_height BIGINT,
      wallet_id    UUID,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      token_symbol TEXT NOT NULL DEFAULT 'GYD',
      network      TEXT NOT NULL DEFAULT 'testnet'
    )
  `);
  await run("transactions-token-symbol-col", `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS token_symbol TEXT NOT NULL DEFAULT 'GYD'`);
  await run("transactions-network-col", `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'testnet'`);

  // ── 5. Node tables ───────────────────────────────────────────────────────────
  await run("node_installations", `
    CREATE TABLE IF NOT EXISTS node_installations (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      node_type          TEXT NOT NULL,
      wireguard_public_key TEXT,
      wireguard_private_key TEXT,
      is_synced          BOOLEAN DEFAULT false,
      last_sync_at       TIMESTAMPTZ,
      is_approved        BOOLEAN DEFAULT false,
      approved_by        TEXT,
      approved_at        TIMESTAMPTZ,
      is_online          BOOLEAN DEFAULT false,
      last_heartbeat     TIMESTAMPTZ,
      hash_rate          BIGINT DEFAULT 0,
      valid_shares       BIGINT DEFAULT 0,
      total_rewards      NUMERIC DEFAULT '0',
      uptime_seconds     BIGINT DEFAULT 0,
      connection_quality INTEGER DEFAULT 100,
      sync_progress      INTEGER DEFAULT 0,
      blocks_synced      BIGINT DEFAULT 0,
      last_block_height  BIGINT DEFAULT 0,
      error_count        INTEGER DEFAULT 0,
      peer_count         INTEGER DEFAULT 0,
      ip_address         TEXT,
      hostname           TEXT,
      rpc_port           INTEGER,
      network            TEXT DEFAULT 'mainnet',
      created_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (const col of [
    `ALTER TABLE node_installations ADD COLUMN IF NOT EXISTS ip_address TEXT`,
    `ALTER TABLE node_installations ADD COLUMN IF NOT EXISTS hostname TEXT`,
    `ALTER TABLE node_installations ADD COLUMN IF NOT EXISTS rpc_port INTEGER`,
    `ALTER TABLE node_installations ADD COLUMN IF NOT EXISTS network TEXT DEFAULT 'mainnet'`,
  ]) {
    await run("node_installations-cols", col);
  }

  await run("test_node_state", `
    CREATE TABLE IF NOT EXISTS test_node_state (
      id          TEXT PRIMARY KEY,
      should_run  BOOLEAN DEFAULT false,
      node_type   TEXT,
      network     TEXT,
      config_json TEXT DEFAULT '{}',
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 6. Governance / DeFi tables ──────────────────────────────────────────────
  await run("governance_proposals", `
    CREATE TABLE IF NOT EXISTS governance_proposals (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title           TEXT NOT NULL,
      description     TEXT NOT NULL,
      proposal_type   TEXT DEFAULT 'parameter' NOT NULL,
      status          TEXT DEFAULT 'active' NOT NULL,
      votes_for       NUMERIC DEFAULT '0' NOT NULL,
      votes_against   NUMERIC DEFAULT '0' NOT NULL,
      votes_abstain   NUMERIC DEFAULT '0' NOT NULL,
      quorum_required NUMERIC DEFAULT '1000000' NOT NULL,
      created_by      TEXT NOT NULL,
      end_date        TIMESTAMPTZ NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("governance_votes", `
    CREATE TABLE IF NOT EXISTS governance_votes (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      proposal_id  UUID NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
      choice       TEXT NOT NULL,
      voting_power NUMERIC DEFAULT '1' NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("governance_treasury", `
    CREATE TABLE IF NOT EXISTS governance_treasury (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      coin        TEXT NOT NULL UNIQUE,
      balance     NUMERIC DEFAULT '0' NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("liquidity_pools", `
    CREATE TABLE IF NOT EXISTS liquidity_pools (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id     TEXT NOT NULL,
      token_a_symbol TEXT NOT NULL,
      token_b_symbol TEXT NOT NULL,
      token_a_address TEXT,
      token_b_address TEXT,
      fee_tier       NUMERIC DEFAULT '0.3' NOT NULL,
      tvl            NUMERIC DEFAULT '0' NOT NULL,
      volume_24h     NUMERIC DEFAULT '0' NOT NULL,
      fees_24h       NUMERIC DEFAULT '0' NOT NULL,
      apr            NUMERIC DEFAULT '0' NOT NULL,
      is_active      BOOLEAN DEFAULT true NOT NULL,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("orders", `
    CREATE TABLE IF NOT EXISTS orders (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pair       TEXT NOT NULL DEFAULT 'GYDS/USDT',
      side       TEXT NOT NULL,
      order_type TEXT NOT NULL,
      price      NUMERIC,
      stop_price NUMERIC,
      amount     NUMERIC NOT NULL,
      filled     NUMERIC DEFAULT '0' NOT NULL,
      status     TEXT DEFAULT 'open' NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("vault_positions", `
    CREATE TABLE IF NOT EXISTS vault_positions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vault_id     TEXT NOT NULL,
      vault_name   TEXT NOT NULL,
      token        TEXT NOT NULL,
      amount       NUMERIC NOT NULL,
      apy          NUMERIC NOT NULL,
      auto_compound BOOLEAN DEFAULT true NOT NULL,
      lock_days    INTEGER,
      locked_until TIMESTAMPTZ,
      status       TEXT DEFAULT 'active' NOT NULL,
      deposited_at TIMESTAMPTZ DEFAULT NOW(),
      withdrawn_at TIMESTAMPTZ
    )
  `);

  // ── 7. XP / Achievements ─────────────────────────────────────────────────────
  await run("achievements", `
    CREATE TABLE IF NOT EXISTS achievements (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT NOT NULL,
      xp_reward   INTEGER DEFAULT 0 NOT NULL,
      icon        TEXT DEFAULT '🏆' NOT NULL,
      category    TEXT DEFAULT 'general' NOT NULL
    )
  `);

  await run("user_xp", `
    CREATE TABLE IF NOT EXISTS user_xp (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      total_xp   INTEGER DEFAULT 0 NOT NULL,
      level      INTEGER DEFAULT 1 NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("user_achievements", `
    CREATE TABLE IF NOT EXISTS user_achievements (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE NO ACTION,
      unlocked_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("xp_events", `
    CREATE TABLE IF NOT EXISTS xp_events (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type  TEXT NOT NULL,
      xp_awarded  INTEGER NOT NULL,
      description TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 8. Token tables ──────────────────────────────────────────────────────────
  await run("token_launches", `
    CREATE TABLE IF NOT EXISTS token_launches (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id              TEXT NOT NULL,
      token_id                UUID,
      name                    TEXT NOT NULL,
      symbol                  TEXT NOT NULL,
      description             TEXT,
      logo_url                TEXT,
      status                  TEXT DEFAULT 'pending' NOT NULL,
      target_raise            NUMERIC DEFAULT '0' NOT NULL,
      raised_amount           NUMERIC DEFAULT '0' NOT NULL,
      participants            INTEGER DEFAULT 0 NOT NULL,
      bonding_curve_type      TEXT DEFAULT 'linear' NOT NULL,
      bonding_curve_steepness NUMERIC DEFAULT '1.0' NOT NULL,
      initial_price           NUMERIC DEFAULT '0.001' NOT NULL,
      max_price               NUMERIC,
      is_premier              BOOLEAN DEFAULT false NOT NULL,
      is_visible              BOOLEAN DEFAULT true NOT NULL,
      starts_at               TIMESTAMPTZ,
      ends_at                 TIMESTAMPTZ,
      created_at              TIMESTAMPTZ DEFAULT NOW(),
      updated_at              TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await run("token_launches-col", `ALTER TABLE token_launches ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true`);

  await run("token_price", `
    CREATE TABLE IF NOT EXISTS token_price (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      price              NUMERIC DEFAULT '0.0000001' NOT NULL,
      total_supply       NUMERIC DEFAULT '1000000000' NOT NULL,
      circulating_supply NUMERIC DEFAULT '0' NOT NULL,
      burned_total       NUMERIC DEFAULT '0' NOT NULL,
      updated_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("token_price_alerts", `
    CREATE TABLE IF NOT EXISTS token_price_alerts (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_id     UUID NOT NULL,
      target_price NUMERIC NOT NULL,
      direction    TEXT DEFAULT 'above' NOT NULL,
      is_triggered BOOLEAN DEFAULT false NOT NULL,
      triggered_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("token_watchlist", `
    CREATE TABLE IF NOT EXISTS token_watchlist (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_id   UUID NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("token_operations", `
    CREATE TABLE IF NOT EXISTS token_operations (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operation_type TEXT NOT NULL,
      amount         NUMERIC NOT NULL,
      usdt_amount    NUMERIC DEFAULT '0',
      wallet_address TEXT NOT NULL,
      tx_hash        TEXT,
      created_by     TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      status         TEXT DEFAULT 'pending' NOT NULL,
      network        TEXT DEFAULT 'mainnet'
    )
  `);
  // Ensure network column exists on pre-existing tables
  await run("token_operations-network", `ALTER TABLE token_operations ADD COLUMN IF NOT EXISTS network TEXT DEFAULT 'mainnet'`);

  // ── 9. Validator tables ──────────────────────────────────────────────────────
  await run("network_validators", `
    CREATE TABLE IF NOT EXISTS network_validators (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      address         TEXT NOT NULL UNIQUE,
      name            TEXT,
      stake           NUMERIC DEFAULT '0' NOT NULL,
      commission      INTEGER DEFAULT 10 NOT NULL,
      is_active       BOOLEAN DEFAULT true NOT NULL,
      is_jailed       BOOLEAN DEFAULT false NOT NULL,
      uptime          NUMERIC DEFAULT '100.00' NOT NULL,
      blocks_proposed BIGINT DEFAULT 0 NOT NULL,
      last_vote_height BIGINT DEFAULT 0 NOT NULL,
      created_by      TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("validator_delegations", `
    CREATE TABLE IF NOT EXISTS validator_delegations (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         TEXT NOT NULL,
      validator_id    UUID NOT NULL REFERENCES network_validators(id) ON DELETE CASCADE,
      amount          NUMERIC DEFAULT '0' NOT NULL,
      status          TEXT DEFAULT 'active' NOT NULL,
      delegated_at    TIMESTAMPTZ DEFAULT NOW(),
      undelegated_at  TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 10. Faucet / misc tables ─────────────────────────────────────────────────
  await run("faucet_claims", `
    CREATE TABLE IF NOT EXISTS faucet_claims (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      token_type     TEXT NOT NULL,
      amount         NUMERIC NOT NULL,
      tx_hash        TEXT,
      ip_address     TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      network        TEXT DEFAULT 'testnet'
    )
  `);
  await run("faucet_claims-network", `ALTER TABLE faucet_claims ADD COLUMN IF NOT EXISTS network TEXT DEFAULT 'testnet'`);

  await run("network_snapshots", `
    CREATE TABLE IF NOT EXISTS network_snapshots (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      block_height  BIGINT,
      tx_count      INTEGER DEFAULT 0,
      active_wallets INTEGER DEFAULT 0,
      token_count   INTEGER DEFAULT 0,
      validator_count INTEGER DEFAULT 0,
      tps           NUMERIC DEFAULT '0',
      snapshot_data JSONB DEFAULT '{}',
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("api_keys", `
    CREATE TABLE IF NOT EXISTS api_keys (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT NOT NULL,
      name          TEXT NOT NULL,
      key_prefix    TEXT NOT NULL,
      key_hash      TEXT NOT NULL,
      scopes        TEXT[] DEFAULT '{}' NOT NULL,
      request_count INTEGER DEFAULT 0 NOT NULL,
      request_limit INTEGER DEFAULT 10000 NOT NULL,
      last_used_at  TIMESTAMPTZ,
      expires_at    TIMESTAMPTZ,
      revoked       BOOLEAN DEFAULT false NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("api_usage_logs", `
    CREATE TABLE IF NOT EXISTS api_usage_logs (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      api_key_id UUID,
      user_id    TEXT,
      endpoint   TEXT NOT NULL,
      method     TEXT NOT NULL,
      status     INTEGER,
      latency_ms INTEGER,
      ip_address TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 11. Payment tables ───────────────────────────────────────────────────────
  await run("payment_methods", `
    CREATE TABLE IF NOT EXISTS payment_methods (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'bank',
      details     JSONB DEFAULT '{}',
      is_active   BOOLEAN DEFAULT true,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("buy_requests", `
    CREATE TABLE IF NOT EXISTS buy_requests (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        TEXT NOT NULL,
      amount_usd     NUMERIC NOT NULL,
      amount_gyds    NUMERIC,
      payment_method TEXT,
      status         TEXT DEFAULT 'pending',
      notes          TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("cashout_requests", `
    CREATE TABLE IF NOT EXISTS cashout_requests (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        TEXT NOT NULL,
      amount         NUMERIC NOT NULL,
      wallet_address TEXT,
      payment_method TEXT,
      status         TEXT DEFAULT 'pending',
      notes          TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await run("cashout-col", `ALTER TABLE cashout_requests ADD COLUMN IF NOT EXISTS payment_method TEXT`);

  // ── 12. User stablecoins ─────────────────────────────────────────────────────
  await run("user_stablecoins", `
    CREATE TABLE IF NOT EXISTS user_stablecoins (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           TEXT NOT NULL,
      name              TEXT NOT NULL,
      symbol            TEXT NOT NULL,
      total_supply      NUMERIC DEFAULT '0',
      collateral_type   TEXT DEFAULT 'GYDS',
      collateral_ratio  NUMERIC DEFAULT '1.5',
      peg_currency      TEXT DEFAULT 'USD',
      creation_fee_paid BOOLEAN DEFAULT false,
      is_active         BOOLEAN DEFAULT true,
      contract_address  TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 13. Community tables ─────────────────────────────────────────────────────
  await run("community_posts", `
    CREATE TABLE IF NOT EXISTS community_posts (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL,
      post_type   TEXT DEFAULT 'discussion' NOT NULL,
      upvotes     INTEGER DEFAULT 0 NOT NULL,
      downvotes   INTEGER DEFAULT 0 NOT NULL,
      reply_count INTEGER DEFAULT 0 NOT NULL,
      pinned      BOOLEAN DEFAULT false NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("community_comments", `
    CREATE TABLE IF NOT EXISTS community_comments (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id    UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE NO ACTION,
      body       TEXT NOT NULL,
      upvotes    INTEGER DEFAULT 0 NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("community_votes", `
    CREATE TABLE IF NOT EXISTS community_votes (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id   UUID NOT NULL,
      target_type TEXT NOT NULL,
      direction   TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 14. Referrals ────────────────────────────────────────────────────────────
  await run("referrals", `
    CREATE TABLE IF NOT EXISTS referrals (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_id   TEXT NOT NULL,
      referee_id    TEXT NOT NULL UNIQUE,
      referral_code TEXT NOT NULL,
      status        TEXT DEFAULT 'pending',
      reward_paid   BOOLEAN DEFAULT false,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("referral_events", `
    CREATE TABLE IF NOT EXISTS referral_events (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      referral_id   UUID NOT NULL,
      event_type    TEXT NOT NULL,
      reward_amount NUMERIC DEFAULT '0',
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 15. Webhook / notification tables ────────────────────────────────────────
  await run("webhook_endpoints", `
    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL,
      url        TEXT NOT NULL,
      events     TEXT[] DEFAULT '{}',
      secret     TEXT,
      is_active  BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("webhook_deliveries", `
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      endpoint_id UUID NOT NULL,
      event       TEXT NOT NULL,
      payload     JSONB DEFAULT '{}',
      status      TEXT DEFAULT 'pending',
      attempts    INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("user_notifications", `
    CREATE TABLE IF NOT EXISTS user_notifications (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT,
      is_read    BOOLEAN DEFAULT false,
      data       JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("push_subscriptions", `
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      TEXT NOT NULL,
      subscription JSONB NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Unique index on (user_id, endpoint) — must be a separate CREATE INDEX
  // because expression-based constraints can't go inside CREATE TABLE IF NOT EXISTS
  await run("push_subscriptions-idx", `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_endpoint
    ON push_subscriptions (user_id, (subscription->>'endpoint'))
  `);

  // ── 16. Insurance / Oracle / Bridge / NFT / Multisig / Identity / RWA ───────
  await run("insurance_pools", `
    CREATE TABLE IF NOT EXISTS insurance_pools (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name         TEXT NOT NULL,
      token        TEXT NOT NULL,
      total_staked NUMERIC DEFAULT '0',
      apy          NUMERIC DEFAULT '0',
      is_active    BOOLEAN DEFAULT true,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("insurance_policies", `
    CREATE TABLE IF NOT EXISTS insurance_policies (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT NOT NULL,
      pool_id       UUID,
      coverage      NUMERIC DEFAULT '0',
      premium_paid  NUMERIC DEFAULT '0',
      expires_at    TIMESTAMPTZ,
      status        TEXT DEFAULT 'active',
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("bridge_transfers", `
    CREATE TABLE IF NOT EXISTS bridge_transfers (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         TEXT NOT NULL,
      from_chain      TEXT NOT NULL,
      to_chain        TEXT NOT NULL,
      token           TEXT NOT NULL,
      amount          NUMERIC NOT NULL,
      fee             NUMERIC DEFAULT '0',
      status          TEXT DEFAULT 'pending',
      tx_hash         TEXT,
      bridge_tx_hash  TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      completed_at    TIMESTAMPTZ
    )
  `);

  await run("nft_collections", `
    CREATE TABLE IF NOT EXISTS nft_collections (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id  TEXT NOT NULL,
      name        TEXT NOT NULL,
      symbol      TEXT NOT NULL,
      description TEXT,
      image_url   TEXT,
      is_active   BOOLEAN DEFAULT true,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("nft_tokens", `
    CREATE TABLE IF NOT EXISTS nft_tokens (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      collection_id UUID,
      owner_id      TEXT NOT NULL,
      token_id      TEXT NOT NULL,
      name          TEXT NOT NULL,
      description   TEXT,
      image_url     TEXT,
      metadata      JSONB DEFAULT '{}',
      is_listed     BOOLEAN DEFAULT false,
      list_price    NUMERIC,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("multisig_wallets", `
    CREATE TABLE IF NOT EXISTS multisig_wallets (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id       TEXT NOT NULL,
      name             TEXT NOT NULL,
      address          TEXT NOT NULL UNIQUE,
      threshold        INTEGER NOT NULL DEFAULT 2,
      total_signers    INTEGER NOT NULL DEFAULT 3,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("multisig_signers", `
    CREATE TABLE IF NOT EXISTS multisig_signers (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_id  UUID NOT NULL REFERENCES multisig_wallets(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL,
      address    TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("multisig_transactions", `
    CREATE TABLE IF NOT EXISTS multisig_transactions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_id     UUID NOT NULL REFERENCES multisig_wallets(id) ON DELETE CASCADE,
      proposer_id   TEXT NOT NULL,
      to_address    TEXT NOT NULL,
      value         NUMERIC DEFAULT '0',
      data          TEXT,
      status        TEXT DEFAULT 'pending',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      executed_at   TIMESTAMPTZ
    )
  `);

  await run("multisig_signatures", `
    CREATE TABLE IF NOT EXISTS multisig_signatures (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id UUID NOT NULL REFERENCES multisig_transactions(id) ON DELETE CASCADE,
      signer_id      TEXT NOT NULL,
      signature      TEXT NOT NULL,
      signed_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("did_documents", `
    CREATE TABLE IF NOT EXISTS did_documents (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL UNIQUE,
      did        TEXT NOT NULL UNIQUE,
      document   JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("kyc_records", `
    CREATE TABLE IF NOT EXISTS kyc_records (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT NOT NULL UNIQUE,
      status      TEXT DEFAULT 'pending',
      level       INTEGER DEFAULT 0,
      verified_at TIMESTAMPTZ,
      data        JSONB DEFAULT '{}',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("social_verifications", `
    CREATE TABLE IF NOT EXISTS social_verifications (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT NOT NULL,
      platform    TEXT NOT NULL,
      handle      TEXT NOT NULL,
      verified_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("rwa_assets", `
    CREATE TABLE IF NOT EXISTS rwa_assets (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id  TEXT NOT NULL,
      name        TEXT NOT NULL,
      asset_type  TEXT NOT NULL,
      value       NUMERIC DEFAULT '0',
      status      TEXT DEFAULT 'pending',
      documents   JSONB DEFAULT '{}',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("rwa_holdings", `
    CREATE TABLE IF NOT EXISTS rwa_holdings (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT NOT NULL,
      asset_id   UUID NOT NULL REFERENCES rwa_assets(id) ON DELETE CASCADE,
      shares     NUMERIC DEFAULT '0',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("price_history", `
    CREATE TABLE IF NOT EXISTS price_history (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_id   UUID,
      symbol     TEXT NOT NULL,
      price      NUMERIC NOT NULL,
      volume_24h NUMERIC DEFAULT '0',
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("trade_history", `
    CREATE TABLE IF NOT EXISTS trade_history (
      id         SERIAL PRIMARY KEY,
      user_id    TEXT NOT NULL,
      pair       TEXT NOT NULL,
      side       TEXT NOT NULL,
      price      NUMERIC NOT NULL,
      amount     NUMERIC NOT NULL,
      total      NUMERIC NOT NULL,
      fee        NUMERIC DEFAULT '0',
      status     TEXT DEFAULT 'filled',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("oracle_feeds", `
    CREATE TABLE IF NOT EXISTS oracle_feeds (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      feed_id      TEXT NOT NULL UNIQUE,
      description  TEXT,
      value        NUMERIC DEFAULT 0,
      decimals     INTEGER DEFAULT 8,
      provider     TEXT DEFAULT 'internal',
      active       BOOLEAN DEFAULT true,
      last_updated TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await run("oracle_submissions", `
    CREATE TABLE IF NOT EXISTS oracle_submissions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      feed_id      TEXT NOT NULL,
      submitter    TEXT NOT NULL,
      value        NUMERIC NOT NULL,
      block_height BIGINT,
      submitted_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 17. Schema drift repairs (0004) ─────────────────────────────────────────
  // These ALTER TABLE … ADD COLUMN IF NOT EXISTS statements fix gaps between the
  // legacy CREATE TABLE definitions above and the columns the application code
  // actually queries. All statements are idempotent — safe on every boot.

  // payment_methods
  for (const col of [
    `ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS description  TEXT`,
    `ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS instructions TEXT`,
    `ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS icon         TEXT`,
    `ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS is_enabled   BOOLEAN DEFAULT true`,
    `ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS config_json  TEXT DEFAULT '{}'`,
  ]) await run("payment_methods-cols", col);

  // governance_treasury
  for (const col of [
    `ALTER TABLE governance_treasury ADD COLUMN IF NOT EXISTS usd_value NUMERIC`,
    `ALTER TABLE governance_treasury ADD COLUMN IF NOT EXISTS address   TEXT`,
  ]) await run("governance_treasury-cols", col);

  // api_usage_logs — code uses key_id / status_code / logged_at
  for (const col of [
    `ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS key_id      UUID`,
    `ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS status_code INTEGER`,
    `ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS logged_at   TIMESTAMPTZ DEFAULT NOW()`,
  ]) await run("api_usage_logs-cols", col);
  await run("api_usage_logs-idx", `CREATE INDEX IF NOT EXISTS api_usage_key_ts ON api_usage_logs(key_id, logged_at DESC)`);

  // nft_collections — code inserts floor_price, volume_24h, etc.; creator_id must accept ''
  for (const col of [
    `ALTER TABLE nft_collections ADD COLUMN IF NOT EXISTS creator_id      TEXT     DEFAULT ''`,
    `ALTER TABLE nft_collections ADD COLUMN IF NOT EXISTS floor_price     NUMERIC  DEFAULT 0`,
    `ALTER TABLE nft_collections ADD COLUMN IF NOT EXISTS volume_24h      NUMERIC  DEFAULT 0`,
    `ALTER TABLE nft_collections ADD COLUMN IF NOT EXISTS change_24h      NUMERIC  DEFAULT 0`,
    `ALTER TABLE nft_collections ADD COLUMN IF NOT EXISTS total_items     INTEGER  DEFAULT 0`,
    `ALTER TABLE nft_collections ADD COLUMN IF NOT EXISTS image_emoji     TEXT     DEFAULT '🖼️'`,
    `ALTER TABLE nft_collections ADD COLUMN IF NOT EXISTS creator_address TEXT`,
    `ALTER TABLE nft_collections ALTER COLUMN creator_id SET DEFAULT ''`,
  ]) await run("nft_collections-cols", col);

  // nft_tokens — code inserts owner_address, price, last_sale, rarity, image_emoji, listed
  for (const col of [
    `ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS owner_address TEXT    DEFAULT '0x0000000000000000000000000000000000000000'`,
    `ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS price         NUMERIC DEFAULT 0`,
    `ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS last_sale     NUMERIC DEFAULT 0`,
    `ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS rarity        TEXT    DEFAULT 'Common'`,
    `ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS image_emoji   TEXT    DEFAULT '🖼️'`,
    `ALTER TABLE nft_tokens ADD COLUMN IF NOT EXISTS listed        BOOLEAN DEFAULT true`,
  ]) await run("nft_tokens-cols", col);

  // insurance_pools — code inserts coverage_type, total_coverage, etc.; token must accept ''
  for (const col of [
    `ALTER TABLE insurance_pools ADD COLUMN IF NOT EXISTS token          TEXT    DEFAULT ''`,
    `ALTER TABLE insurance_pools ADD COLUMN IF NOT EXISTS coverage_type  TEXT    DEFAULT 'general'`,
    `ALTER TABLE insurance_pools ADD COLUMN IF NOT EXISTS description    TEXT`,
    `ALTER TABLE insurance_pools ADD COLUMN IF NOT EXISTS total_coverage NUMERIC DEFAULT 0`,
    `ALTER TABLE insurance_pools ADD COLUMN IF NOT EXISTS premium_rate   NUMERIC DEFAULT 0.02`,
    `ALTER TABLE insurance_pools ADD COLUMN IF NOT EXISTS claim_period   INTEGER DEFAULT 30`,
    `ALTER TABLE insurance_pools ADD COLUMN IF NOT EXISTS min_coverage   NUMERIC DEFAULT 1000`,
    `ALTER TABLE insurance_pools ADD COLUMN IF NOT EXISTS max_coverage   NUMERIC DEFAULT 1000000`,
    `ALTER TABLE insurance_pools ADD COLUMN IF NOT EXISTS image_emoji    TEXT    DEFAULT '🛡️'`,
    `ALTER TABLE insurance_pools ADD COLUMN IF NOT EXISTS active         BOOLEAN DEFAULT true`,
    `ALTER TABLE insurance_pools ALTER COLUMN token SET DEFAULT ''`,
  ]) await run("insurance_pools-cols", col);

  // price_history — code inserts coin, open, close, high, low, volume, timestamp
  for (const col of [
    `ALTER TABLE price_history ADD COLUMN IF NOT EXISTS symbol    TEXT        DEFAULT ''`,
    `ALTER TABLE price_history ADD COLUMN IF NOT EXISTS price     NUMERIC     DEFAULT 0`,
    `ALTER TABLE price_history ADD COLUMN IF NOT EXISTS coin      TEXT        DEFAULT ''`,
    `ALTER TABLE price_history ADD COLUMN IF NOT EXISTS open      NUMERIC     DEFAULT 0`,
    `ALTER TABLE price_history ADD COLUMN IF NOT EXISTS close     NUMERIC     DEFAULT 0`,
    `ALTER TABLE price_history ADD COLUMN IF NOT EXISTS high      NUMERIC     DEFAULT 0`,
    `ALTER TABLE price_history ADD COLUMN IF NOT EXISTS low       NUMERIC     DEFAULT 0`,
    `ALTER TABLE price_history ADD COLUMN IF NOT EXISTS volume    BIGINT      DEFAULT 0`,
    `ALTER TABLE price_history ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW()`,
    `ALTER TABLE price_history ALTER COLUMN symbol SET DEFAULT ''`,
    `ALTER TABLE price_history ALTER COLUMN price  SET DEFAULT 0`,
  ]) await run("price_history-cols", col);
  await run("price_history-idx", `CREATE INDEX IF NOT EXISTS price_history_coin_ts ON price_history(coin, timestamp DESC)`);

  // rwa_assets — code inserts type, description, total_value, token_price, etc.
  for (const col of [
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS creator_id       TEXT    DEFAULT ''`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS asset_type       TEXT    DEFAULT 'general'`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS type             TEXT    DEFAULT 'general'`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS description      TEXT`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS total_value      NUMERIC DEFAULT 0`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS token_price      NUMERIC DEFAULT 1`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS tokens_available INTEGER DEFAULT 0`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS total_tokens     INTEGER DEFAULT 1`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS apy              NUMERIC DEFAULT 0`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS currency         TEXT    DEFAULT 'USDT'`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS jurisdiction     TEXT`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS audited          BOOLEAN DEFAULT false`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS maturity         TEXT`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS doc_cid          TEXT`,
    `ALTER TABLE rwa_assets ADD COLUMN IF NOT EXISTS active           BOOLEAN DEFAULT true`,
    `ALTER TABLE rwa_assets ALTER COLUMN creator_id SET DEFAULT ''`,
    `ALTER TABLE rwa_assets ALTER COLUMN asset_type SET DEFAULT 'general'`,
  ]) await run("rwa_assets-cols", col);

  // network_snapshots — code uses active_validators, active_nodes, total_transactions, captured_at
  for (const col of [
    `ALTER TABLE network_snapshots ADD COLUMN IF NOT EXISTS active_validators  INTEGER DEFAULT 0`,
    `ALTER TABLE network_snapshots ADD COLUMN IF NOT EXISTS active_nodes       INTEGER DEFAULT 0`,
    `ALTER TABLE network_snapshots ADD COLUMN IF NOT EXISTS total_transactions BIGINT  DEFAULT 0`,
    `ALTER TABLE network_snapshots ADD COLUMN IF NOT EXISTS total_tokens       INTEGER DEFAULT 0`,
    `ALTER TABLE network_snapshots ADD COLUMN IF NOT EXISTS captured_at        TIMESTAMPTZ DEFAULT NOW()`,
  ]) await run("network_snapshots-cols", col);
  await run("network_snapshots-idx", `CREATE INDEX IF NOT EXISTS network_snapshots_captured_idx ON network_snapshots(captured_at DESC)`);

  // trade_history — code uses executed_at, taker_id, maker_id; user_id/total must accept defaults
  for (const col of [
    `ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS user_id     TEXT        DEFAULT ''`,
    `ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS total       NUMERIC     DEFAULT 0`,
    `ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ`,
    `ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS taker_id    TEXT`,
    `ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS maker_id    TEXT`,
    `ALTER TABLE trade_history ALTER COLUMN user_id SET DEFAULT ''`,
    `ALTER TABLE trade_history ALTER COLUMN total  SET DEFAULT 0`,
  ]) await run("trade_history-cols", col);
  await run("trade_history-idx", `CREATE INDEX IF NOT EXISTS idx_trade_hist_pair ON trade_history(pair, executed_at DESC)`);

  // webhook_deliveries — code uses webhook_id, response_status, response_body, duration_ms, success, attempted_at
  for (const col of [
    `ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS webhook_id      UUID`,
    `ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS response_status INTEGER`,
    `ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS response_body   TEXT`,
    `ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS duration_ms     INTEGER`,
    `ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS success         BOOLEAN DEFAULT false`,
    `ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS attempted_at    TIMESTAMPTZ DEFAULT NOW()`,
  ]) await run("webhook_deliveries-cols", col);
  await run("webhook_deliveries-idx", `CREATE INDEX IF NOT EXISTS wh_delivery_webhook_idx ON webhook_deliveries(webhook_id, attempted_at DESC)`);

  // ── Indexes for hot paths ────────────────────────────────────────────────────
  await run("idx-user-roles",       `CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)`);
  await run("idx-wallets-user",     `CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id)`);
  await run("idx-transactions-user",`CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)`);
  await run("idx-node-inst-user",   `CREATE INDEX IF NOT EXISTS idx_node_installations_user_id ON node_installations(user_id)`);
  await run("idx-audit-user",       `CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`);
  await run("idx-xp-events",        `CREATE INDEX IF NOT EXISTS idx_xp_events_user ON xp_events(user_id)`);
  await run("idx-oracle-sub",       `CREATE INDEX IF NOT EXISTS oracle_sub_feed_idx ON oracle_submissions(feed_id, submitted_at DESC)`);

  // ── tokens — add token_standard column for GRC-20 / GRC-721 / GRC-1155 ────
  await run("tokens-token_standard", `ALTER TABLE tokens ADD COLUMN IF NOT EXISTS token_standard TEXT DEFAULT 'GRC-20' NOT NULL`);
  await run("orders-pair", `ALTER TABLE orders ADD COLUMN IF NOT EXISTS pair TEXT NOT NULL DEFAULT 'GYDS/USDT'`);

  const elapsed = Date.now() - start;
  if (errors.length > 0) {
    console.warn(`[startup-migrate] Completed in ${elapsed}ms with ${errors.length} warning(s):`);
    errors.forEach(e => console.warn(`  ${e}`));
  } else {
    console.log(`[startup-migrate] Schema verified OK in ${elapsed}ms`);
  }
}
