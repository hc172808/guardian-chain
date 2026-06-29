-- ─────────────────────────────────────────────────────────────────────────────
--  Migration 0003: Ensure all users-table columns exist + critical constraints
--
--  SAFE TO REPLAY — every statement uses IF NOT EXISTS / IF EXISTS guards.
--  Run this on any deployed server to fix schema drift.
-- ─────────────────────────────────────────────────────────────────────────────

-- Core auth columns that were added in later schema revisions
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS auth_nonce        TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS first_name        TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS last_name         TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS totp_secret       TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS totp_enabled      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS is_banned         BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS password_hash     TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS wallet_address    TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS username          TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email             TEXT;

-- Ensure wallet_address has a UNIQUE constraint (needed for nonce upsert ON CONFLICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_wallet_address_unique'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_wallet_address_unique UNIQUE (wallet_address);
  END IF;
EXCEPTION WHEN others THEN
  -- ignore if constraint already exists under a different name
END;
$$;

-- Profiles table extras
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS display_name        TEXT;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS bio                 TEXT;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS avatar_url          TEXT;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS locale              TEXT DEFAULT 'en';
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS timezone            TEXT DEFAULT 'UTC';
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS notification_prefs  JSONB;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS metadata            JSONB;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS username            TEXT;

-- node_installations extras
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS wireguard_public_key TEXT;
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS is_approved   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS is_synced     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS is_online     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS node_version  TEXT;
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS peer_count    INTEGER DEFAULT 0;

-- transactions table — ensure all columns exist
CREATE TABLE IF NOT EXISTS transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address  TEXT NOT NULL DEFAULT '',
  to_address    TEXT NOT NULL DEFAULT '',
  amount        NUMERIC NOT NULL DEFAULT 0,
  fee           NUMERIC NOT NULL DEFAULT 0.001,
  tx_hash       TEXT UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending',
  block_height  BIGINT,
  wallet_id     UUID,
  user_id       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ
);

ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS from_address  TEXT;
ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS to_address    TEXT;
ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS amount        NUMERIC;
ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS fee           NUMERIC NOT NULL DEFAULT 0.001;
ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS tx_hash       TEXT;
ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS block_height  BIGINT;
ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS wallet_id     UUID;
ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS user_id       TEXT;
ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE IF EXISTS transactions ADD COLUMN IF NOT EXISTS confirmed_at  TIMESTAMPTZ;

-- password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- user_notifications table
CREATE TABLE IF NOT EXISTS user_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info',
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id    ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_wallet_address    ON users (wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_username          ON users (username);
