-- ============================================================
--  GYDSchain Dashboard — Full PostgreSQL Schema
--  Chain ID: 13370 | Domain: netlifegy.com
--
--  Usage:
--    1. Create a database in pgAdmin (e.g. "gydschain")
--    2. Open Query Tool on that database
--    3. Paste this entire file and execute (F5 / Run)
--    4. Default founder login after setup:
--         Username : netlifegy
--         Password : GYDSchain2026!   ← CHANGE AFTER FIRST LOGIN
--
--  To point the app at your server PostgreSQL instead of
--  the built-in Replit database, set:
--    DATABASE_URL=postgresql://USER:PASS@YOUR_SERVER_IP:5432/gydschain
-- ============================================================

-- Enable UUID generation (required by all tables)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enum Types ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('user', 'admin', 'founder');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Drop tables in reverse-dependency order (safe re-run) ────────────────────
DROP TABLE IF EXISTS password_reset_tokens     CASCADE;
DROP TABLE IF EXISTS faucet_claims             CASCADE;
DROP TABLE IF EXISTS audit_logs                CASCADE;
DROP TABLE IF EXISTS ddos_protection           CASCADE;
DROP TABLE IF EXISTS rate_limit_rules          CASCADE;
DROP TABLE IF EXISTS ip_access_list            CASCADE;
DROP TABLE IF EXISTS fail2ban_jails            CASCADE;
DROP TABLE IF EXISTS firewall_rules            CASCADE;
DROP TABLE IF EXISTS validator_delegations     CASCADE;
DROP TABLE IF EXISTS network_validators        CASCADE;
DROP TABLE IF EXISTS token_price_alerts        CASCADE;
DROP TABLE IF EXISTS token_watchlist           CASCADE;
DROP TABLE IF EXISTS liquidity_pools           CASCADE;
DROP TABLE IF EXISTS token_launches            CASCADE;
DROP TABLE IF EXISTS tokens                    CASCADE;
DROP TABLE IF EXISTS token_price               CASCADE;
DROP TABLE IF EXISTS token_operations          CASCADE;
DROP TABLE IF EXISTS admin_config              CASCADE;
DROP TABLE IF EXISTS documentation             CASCADE;
DROP TABLE IF EXISTS transactions              CASCADE;
DROP TABLE IF EXISTS node_installations        CASCADE;
DROP TABLE IF EXISTS wallets                   CASCADE;
DROP TABLE IF EXISTS profiles                  CASCADE;
DROP TABLE IF EXISTS user_roles                CASCADE;
DROP TABLE IF EXISTS users                     CASCADE;

-- ── Drop views ────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS v_users_with_roles     CASCADE;
DROP VIEW IF EXISTS v_network_stats        CASCADE;
DROP VIEW IF EXISTS v_node_summary         CASCADE;
DROP VIEW IF EXISTS v_recent_transactions  CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
--  CORE AUTH TABLES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE users (
  id                TEXT        PRIMARY KEY,
  email             TEXT        UNIQUE,
  username          TEXT        UNIQUE,
  password_hash     TEXT,
  wallet_address    TEXT        UNIQUE,
  auth_nonce        TEXT,
  first_name        TEXT,
  last_name         TEXT,
  profile_image_url TEXT,
  totp_secret       TEXT,
  totp_enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_banned         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_roles (
  id       UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  TEXT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     app_role  NOT NULL DEFAULT 'user'
);

CREATE TABLE profiles (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            TEXT        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email              TEXT,
  role               TEXT        NOT NULL DEFAULT 'user',
  display_name       TEXT,
  username           TEXT,
  bio                TEXT,
  avatar_url         TEXT,
  locale             TEXT        DEFAULT 'en',
  timezone           TEXT        DEFAULT 'UTC',
  notification_prefs JSONB,
  metadata           JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
--  WALLET & TRANSACTION TABLES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE wallets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address        TEXT        NOT NULL,
  encrypted_seed TEXT        NOT NULL DEFAULT '',
  pin_hash       TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE transactions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address TEXT        NOT NULL,
  to_address   TEXT        NOT NULL,
  amount       NUMERIC     NOT NULL,
  fee          NUMERIC     NOT NULL DEFAULT 0.001,
  tx_hash      TEXT        UNIQUE,
  status       TEXT        NOT NULL DEFAULT 'pending',
  block_height BIGINT,
  wallet_id    UUID,
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

-- ══════════════════════════════════════════════════════════════════════════════
--  NODE INSTALLATIONS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE node_installations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- node_type values: litenode | rpcnode | boostnode | fullnode | genesis | bootnode | validator
  node_type             TEXT        NOT NULL,
  wireguard_public_key  TEXT,
  wireguard_private_key TEXT,
  is_synced             BOOLEAN     NOT NULL DEFAULT FALSE,
  last_sync_at          TIMESTAMPTZ,
  is_approved           BOOLEAN     NOT NULL DEFAULT FALSE,
  approved_by           TEXT,
  approved_at           TIMESTAMPTZ,
  is_online             BOOLEAN     NOT NULL DEFAULT FALSE,
  last_heartbeat        TIMESTAMPTZ,
  hash_rate             BIGINT      NOT NULL DEFAULT 0,
  valid_shares          BIGINT      NOT NULL DEFAULT 0,
  total_rewards         NUMERIC     NOT NULL DEFAULT 0,
  uptime_seconds        BIGINT      NOT NULL DEFAULT 0,
  connection_quality    INTEGER     NOT NULL DEFAULT 100,
  sync_progress         INTEGER     NOT NULL DEFAULT 0,  -- 0-100 %
  blocks_synced         BIGINT      NOT NULL DEFAULT 0,
  last_block_height     BIGINT      NOT NULL DEFAULT 0,
  error_count           INTEGER     NOT NULL DEFAULT 0,
  peer_count            INTEGER     NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
--  DOCUMENTATION & ADMIN CONFIG
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE documentation (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT        NOT NULL UNIQUE,
  title      TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stores arbitrary JSON config blobs by key (node_visibility, feature flags, etc.)
CREATE TABLE admin_config (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key   TEXT        NOT NULL UNIQUE,
  config_value JSONB       NOT NULL,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
--  TOKEN ECONOMY
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE token_operations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- operation_type: mint | burn | transfer | airdrop
  operation_type TEXT        NOT NULL,
  amount         NUMERIC     NOT NULL,
  usdt_amount    NUMERIC     NOT NULL DEFAULT 0,
  wallet_address TEXT        NOT NULL,
  tx_hash        TEXT,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status         TEXT        NOT NULL DEFAULT 'pending'
);

CREATE TABLE token_price (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  price              NUMERIC     NOT NULL DEFAULT 0.0000001,
  total_supply       NUMERIC     NOT NULL DEFAULT 100000000000,
  circulating_supply NUMERIC     NOT NULL DEFAULT 0,
  burned_total       NUMERIC     NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tokens (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id          TEXT        NOT NULL,
  name                TEXT        NOT NULL,
  symbol              TEXT        NOT NULL,
  decimals            INTEGER     NOT NULL DEFAULT 18,
  total_supply        NUMERIC     NOT NULL,
  burned_supply       NUMERIC     NOT NULL DEFAULT 0,
  gyds_liquidity      NUMERIC     NOT NULL DEFAULT 0,
  logo_url            TEXT,
  -- lp_lock_type: burned | locked | unlocked
  lp_lock_type        TEXT        NOT NULL DEFAULT 'burned',
  lp_unlock_time      TIMESTAMPTZ,
  freeze_enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
  freeze_holder       TEXT,
  freeze_locked       BOOLEAN     NOT NULL DEFAULT FALSE,
  update_enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
  update_holder       TEXT,
  update_locked       BOOLEAN     NOT NULL DEFAULT FALSE,
  mint_enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
  mint_holder         TEXT,
  mint_locked         BOOLEAN     NOT NULL DEFAULT FALSE,
  address             TEXT        NOT NULL,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  -- network_type: devnet | testnet | mainnet
  network_type        TEXT        NOT NULL DEFAULT 'devnet',
  mainnet_promoted_at TIMESTAMPTZ,
  market_cap_usd      NUMERIC     NOT NULL DEFAULT 0,
  extra_authorities   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE token_launches (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id              TEXT        NOT NULL,
  token_id                UUID        REFERENCES tokens(id) ON DELETE SET NULL,
  name                    TEXT        NOT NULL,
  symbol                  TEXT        NOT NULL,
  description             TEXT,
  logo_url                TEXT,
  -- status: pending | live | upcoming | completed | cancelled
  status                  TEXT        NOT NULL DEFAULT 'pending',
  target_raise            NUMERIC     NOT NULL DEFAULT 0,
  raised_amount           NUMERIC     NOT NULL DEFAULT 0,
  participants            INTEGER     NOT NULL DEFAULT 0,
  -- bonding_curve_type: linear | exponential | logarithmic
  bonding_curve_type      TEXT        NOT NULL DEFAULT 'linear',
  bonding_curve_steepness NUMERIC     NOT NULL DEFAULT 1.0,
  initial_price           NUMERIC     NOT NULL DEFAULT 0.001,
  max_price               NUMERIC,
  is_premier              BOOLEAN     NOT NULL DEFAULT FALSE,
  starts_at               TIMESTAMPTZ,
  ends_at                 TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE liquidity_pools (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      TEXT        NOT NULL,
  token_a_symbol  TEXT        NOT NULL,
  token_b_symbol  TEXT        NOT NULL,
  token_a_address TEXT,
  token_b_address TEXT,
  fee_tier        NUMERIC     NOT NULL DEFAULT 0.3,
  tvl             NUMERIC     NOT NULL DEFAULT 0,
  volume_24h      NUMERIC     NOT NULL DEFAULT 0,
  fees_24h        NUMERIC     NOT NULL DEFAULT 0,
  apr             NUMERIC     NOT NULL DEFAULT 0,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE token_watchlist (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id   UUID        NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token_id)
);

CREATE TABLE token_price_alerts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id     UUID        NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  target_price NUMERIC     NOT NULL,
  -- direction: above | below
  direction    TEXT        NOT NULL DEFAULT 'above',
  is_triggered BOOLEAN     NOT NULL DEFAULT FALSE,
  triggered_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
--  VALIDATORS & DELEGATIONS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE network_validators (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  address          TEXT        NOT NULL UNIQUE,
  name             TEXT,
  stake            NUMERIC     NOT NULL DEFAULT 0,
  commission       INTEGER     NOT NULL DEFAULT 10,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  is_jailed        BOOLEAN     NOT NULL DEFAULT FALSE,
  uptime           NUMERIC     NOT NULL DEFAULT 100.00,
  blocks_proposed  BIGINT      NOT NULL DEFAULT 0,
  last_vote_height BIGINT      NOT NULL DEFAULT 0,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE validator_delegations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT        NOT NULL,
  validator_id   UUID        NOT NULL REFERENCES network_validators(id) ON DELETE CASCADE,
  amount         NUMERIC     NOT NULL DEFAULT 0,
  -- status: active | undelegating | completed
  status         TEXT        NOT NULL DEFAULT 'active',
  delegated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undelegated_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
--  SECURITY / FIREWALL TABLES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE firewall_rules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type   TEXT        NOT NULL DEFAULT 'ufw',
  action      TEXT        NOT NULL DEFAULT 'allow',
  protocol    TEXT        NOT NULL DEFAULT 'tcp',
  port        TEXT,
  ip_address  TEXT,
  -- direction: in | out
  direction   TEXT        NOT NULL DEFAULT 'in',
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fail2ban_jails (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  jail_name   TEXT        NOT NULL,
  is_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
  max_retries INTEGER     NOT NULL DEFAULT 5,
  ban_time    INTEGER     NOT NULL DEFAULT 3600,   -- seconds
  find_time   INTEGER     NOT NULL DEFAULT 600,    -- seconds
  log_path    TEXT,
  filter_name TEXT,
  action      TEXT        DEFAULT 'iptables-multiport',
  description TEXT,
  banned_ips  TEXT[]      NOT NULL DEFAULT '{}',
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ip_access_list (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT        NOT NULL,
  -- list_type: whitelist | blacklist
  list_type  TEXT        NOT NULL DEFAULT 'whitelist',
  reason     TEXT,
  expires_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rate_limit_rules (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  endpoint            TEXT        NOT NULL,
  requests_per_window INTEGER     NOT NULL DEFAULT 100,
  window_seconds      INTEGER     NOT NULL DEFAULT 60,
  burst_limit         INTEGER     NOT NULL DEFAULT 20,
  -- action: throttle | block
  action              TEXT        NOT NULL DEFAULT 'throttle',
  is_enabled          BOOLEAN     NOT NULL DEFAULT TRUE,
  description         TEXT,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ddos_protection (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  -- protection_type: syn_flood | udp_flood | http_flood | icmp_flood | conn_limit
  protection_type TEXT        NOT NULL DEFAULT 'syn_flood',
  threshold       INTEGER     NOT NULL DEFAULT 1000,
  -- action: drop | throttle | redirect
  action          TEXT        NOT NULL DEFAULT 'drop',
  is_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  parameters      JSONB       DEFAULT '{}'::jsonb,
  description     TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
--  AUDIT, FAUCET, PASSWORD RESET
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL,
  user_email  TEXT,
  action      TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'general',
  target_type TEXT,
  target_id   TEXT,
  details     JSONB       DEFAULT '{}'::jsonb,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE faucet_claims (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT        NOT NULL,
  wallet_address TEXT        NOT NULL,
  -- token_type: GYDS | GYD
  token_type     TEXT        NOT NULL,
  amount         NUMERIC     NOT NULL,
  tx_hash        TEXT,
  ip_address     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
--  INDEXES (for query performance)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_users_email           ON users(email);
CREATE INDEX idx_users_wallet_address  ON users(wallet_address);
CREATE INDEX idx_user_roles_user_id    ON user_roles(user_id);
CREATE INDEX idx_wallets_user_id       ON wallets(user_id);
CREATE INDEX idx_wallets_address       ON wallets(address);
CREATE INDEX idx_tx_user_id            ON transactions(user_id);
CREATE INDEX idx_tx_from               ON transactions(from_address);
CREATE INDEX idx_tx_to                 ON transactions(to_address);
CREATE INDEX idx_tx_created_at         ON transactions(created_at DESC);
CREATE INDEX idx_tx_status             ON transactions(status);
CREATE INDEX idx_nodes_user_id         ON node_installations(user_id);
CREATE INDEX idx_nodes_type            ON node_installations(node_type);
CREATE INDEX idx_nodes_online          ON node_installations(is_online);
CREATE INDEX idx_nodes_approved        ON node_installations(is_approved);
CREATE INDEX idx_tokens_creator        ON tokens(creator_id);
CREATE INDEX idx_tokens_symbol         ON tokens(symbol);
CREATE INDEX idx_tokens_active         ON tokens(is_active);
CREATE INDEX idx_launches_status       ON token_launches(status);
CREATE INDEX idx_pools_active          ON liquidity_pools(is_active);
CREATE INDEX idx_audit_user_id         ON audit_logs(user_id);
CREATE INDEX idx_audit_created_at      ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_category        ON audit_logs(category);
CREATE INDEX idx_faucet_user_token     ON faucet_claims(user_id, token_type, created_at);
CREATE INDEX idx_validators_active     ON network_validators(is_active);
CREATE INDEX idx_delegations_user_id   ON validator_delegations(user_id);
CREATE INDEX idx_delegations_val_id    ON validator_delegations(validator_id);
CREATE INDEX idx_prt_user_id           ON password_reset_tokens(user_id);
CREATE INDEX idx_prt_expires           ON password_reset_tokens(expires_at);

-- ══════════════════════════════════════════════════════════════════════════════
--  SEED DATA
-- ══════════════════════════════════════════════════════════════════════════════

-- Initial GYDS token price row
INSERT INTO token_price (price, total_supply, circulating_supply, burned_total)
VALUES (0.0000001, 100000000000, 0, 0);

-- Default node visibility config
-- litenode = public by default; rest are hidden until admin enables them
INSERT INTO admin_config (config_key, config_value)
VALUES (
  'node_visibility',
  '{"litenode":true,"rpcnode":false,"boostnode":false,"fullnode":false,"genesis":false,"bootnode":false}'::jsonb
);

-- ── Founder account ──────────────────────────────────────────────────────────
-- Password: GYDSchain2026!   (bcrypt, cost=12)
-- !! CHANGE THIS PASSWORD AFTER YOUR FIRST LOGIN !!
--
-- If you want to generate a fresh bcrypt hash for your own password, run:
--   node -e "const b=require('bcryptjs');b.hash('YourPassword',12).then(console.log)"
INSERT INTO users (id, email, username, password_hash, first_name, last_name, updated_at)
VALUES (
  'founder_netlifegy',
  'netlifegy@gmail.com',
  'netlifegy',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/oIHxDQ8Gy',
  'Founder',
  'GYDSchain',
  NOW()
);

INSERT INTO profiles (user_id, email, username, display_name, role)
VALUES ('founder_netlifegy', 'netlifegy@gmail.com', 'netlifegy', 'Founder', 'founder');

INSERT INTO user_roles (user_id, role) VALUES ('founder_netlifegy', 'user');
INSERT INTO user_roles (user_id, role) VALUES ('founder_netlifegy', 'admin');
INSERT INTO user_roles (user_id, role) VALUES ('founder_netlifegy', 'founder');

-- Default DDoS protection rules
INSERT INTO ddos_protection (name, protection_type, threshold, action, description) VALUES
  ('SYN Flood Protection',  'syn_flood',   1000, 'drop',     'Block TCP SYN flood attacks'),
  ('UDP Flood Protection',  'udp_flood',   5000, 'drop',     'Block UDP flood attacks'),
  ('HTTP Rate Limiting',    'http_flood',   500, 'throttle', 'Throttle excessive HTTP requests'),
  ('ICMP Rate Limiting',    'icmp_flood',   100, 'drop',     'Block ICMP ping floods'),
  ('Connection Rate Limit', 'conn_limit',   200, 'throttle', 'Limit new connections per IP/sec');

-- Default fail2ban jails
INSERT INTO fail2ban_jails (jail_name, is_enabled, max_retries, ban_time, find_time, log_path, filter_name, description) VALUES
  ('sshd',       TRUE, 5,  3600, 600, '/var/log/auth.log',        'sshd',       'SSH brute-force protection'),
  ('nginx-http', TRUE, 10, 600,  300, '/var/log/nginx/access.log','nginx-http', 'Nginx HTTP abuse'),
  ('api-auth',   TRUE, 5,  1800, 300, '/var/log/nginx/access.log','api-auth',   'API auth endpoint brute-force');

-- Default firewall rules (GYDSchain node ports)
INSERT INTO firewall_rules (rule_type, action, protocol, port, direction, description, is_active) VALUES
  ('ufw', 'allow', 'tcp', '22',    'in', 'SSH',                              TRUE),
  ('ufw', 'allow', 'tcp', '80',    'in', 'HTTP',                             TRUE),
  ('ufw', 'allow', 'tcp', '443',   'in', 'HTTPS',                            TRUE),
  ('ufw', 'allow', 'tcp', '5001',  'in', 'API server (restrict in prod)',     FALSE),
  ('ufw', 'allow', 'tcp', '30303', 'in', 'P2P Node Discovery (TCP)',          TRUE),
  ('ufw', 'allow', 'udp', '30303', 'in', 'P2P Node Discovery (UDP)',          TRUE),
  ('ufw', 'allow', 'tcp', '8545',  'in', 'RPC (restrict to trusted IPs)',     FALSE),
  ('ufw', 'allow', 'tcp', '8546',  'in', 'WebSocket RPC',                    FALSE),
  ('ufw', 'deny',  'tcp', 'all',   'in', 'Default deny all other inbound',    TRUE);

-- Default rate limit rules
INSERT INTO rate_limit_rules (name, endpoint, requests_per_window, window_seconds, burst_limit, action, description) VALUES
  ('Auth Login',         '/api/auth/login',      10,   60,  5,  'block',    'Brute-force protection on login'),
  ('Auth Register',      '/api/auth/register',    5,  300,  3,  'block',    'Prevent mass account creation'),
  ('Faucet Claim',       '/api/faucet/claim',     3,  3600, 1,  'block',    'One claim per IP per hour'),
  ('Password Reset',     '/api/auth/reset',       3,   600, 2,  'block',    'Limit password reset requests'),
  ('General API',        '/api/',               200,    60, 50, 'throttle', 'General API rate limit'),
  ('Transaction Submit', '/api/transactions',    20,    60, 10, 'throttle', 'Limit transaction submissions');

-- ══════════════════════════════════════════════════════════════════════════════
--  VIEWS  (handy for pgAdmin browsing & server queries)
-- ══════════════════════════════════════════════════════════════════════════════

-- All users with their effective primary role
CREATE VIEW v_users_with_roles AS
SELECT
  u.id,
  u.email,
  u.username,
  u.wallet_address,
  u.first_name,
  u.last_name,
  u.is_banned,
  u.totp_enabled,
  u.created_at,
  ARRAY_AGG(r.role ORDER BY r.role) AS roles,
  CASE
    WHEN 'founder' = ANY(ARRAY_AGG(r.role)) THEN 'founder'
    WHEN 'admin'   = ANY(ARRAY_AGG(r.role)) THEN 'admin'
    ELSE 'user'
  END AS primary_role
FROM users u
LEFT JOIN user_roles r ON r.user_id = u.id
GROUP BY u.id;

-- Live network stats (used by /api/network-stats)
CREATE VIEW v_network_stats AS
SELECT
  (SELECT COUNT(*) FROM transactions)                                      AS total_transactions,
  (SELECT COUNT(*) FROM node_installations WHERE is_online = TRUE)         AS online_nodes,
  (SELECT COUNT(*) FROM node_installations WHERE is_approved = TRUE)       AS approved_nodes,
  (SELECT COUNT(*) FROM network_validators WHERE is_active = TRUE)         AS active_validators,
  (SELECT COUNT(*) FROM users)                                             AS total_users,
  (SELECT COUNT(*) FROM tokens WHERE is_active = TRUE)                     AS active_tokens,
  (SELECT price             FROM token_price ORDER BY updated_at DESC LIMIT 1) AS gyds_price,
  (SELECT total_supply      FROM token_price ORDER BY updated_at DESC LIMIT 1) AS total_supply,
  (SELECT burned_total      FROM token_price ORDER BY updated_at DESC LIMIT 1) AS burned_total,
  NOW()                                                                    AS generated_at;

-- Node counts per type
CREATE VIEW v_node_summary AS
SELECT
  node_type,
  COUNT(*)                                                    AS total,
  SUM(CASE WHEN is_online   THEN 1 ELSE 0 END)               AS online,
  SUM(CASE WHEN is_approved THEN 1 ELSE 0 END)               AS approved,
  SUM(CASE WHEN is_synced   THEN 1 ELSE 0 END)               AS synced,
  ROUND(AVG(sync_progress)::NUMERIC, 1)                       AS avg_sync_pct,
  SUM(hash_rate)                                              AS total_hash_rate,
  SUM(total_rewards)                                          AS total_rewards
FROM node_installations
GROUP BY node_type;

-- Last 100 transactions with user info
CREATE VIEW v_recent_transactions AS
SELECT
  t.id,
  t.tx_hash,
  t.from_address,
  t.to_address,
  t.amount,
  t.fee,
  t.status,
  t.block_height,
  t.created_at,
  t.confirmed_at,
  u.username,
  u.email
FROM transactions t
LEFT JOIN users u ON u.id = t.user_id
ORDER BY t.created_at DESC
LIMIT 100;

-- ══════════════════════════════════════════════════════════════════════════════
--  VERIFY (run these after import to confirm everything loaded)
-- ══════════════════════════════════════════════════════════════════════════════
--
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;
--   SELECT * FROM v_network_stats;
--   SELECT * FROM v_users_with_roles;
--   SELECT * FROM v_node_summary;
--
-- ══════════════════════════════════════════════════════════════════════════════
--  CONNECT YOUR SERVER
-- ══════════════════════════════════════════════════════════════════════════════
--
--  Set this in your .env or Replit Secrets:
--    DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_SERVER_IP:5432/gydschain
--
--  Then restart the API server and it will use your pgAdmin PostgreSQL.
-- ══════════════════════════════════════════════════════════════════════════════
