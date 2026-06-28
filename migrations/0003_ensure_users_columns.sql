-- ─────────────────────────────────────────────────────────────────────────────
--  Migration 0003: Ensure all users-table columns exist
--
--  SAFE TO REPLAY — every statement is ADD COLUMN IF NOT EXISTS.
--  Fixes deployed servers where the table was created from an older schema
--  that was missing later-added columns.  Wallet login breaks at the nonce
--  step when Drizzle tries to SELECT * and PostgreSQL says "column X does
--  not exist".
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

-- Profiles table extras
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS display_name        TEXT;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS bio                 TEXT;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS avatar_url          TEXT;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS locale              TEXT DEFAULT 'en';
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS timezone            TEXT DEFAULT 'UTC';
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS notification_prefs  JSONB;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS metadata            JSONB;

-- node_installations extras
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS wireguard_public_key TEXT;
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS is_approved   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS is_synced     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS is_online     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS node_version  TEXT;
ALTER TABLE IF EXISTS node_installations ADD COLUMN IF NOT EXISTS peer_count    INTEGER DEFAULT 0;
