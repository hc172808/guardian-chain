-- ═══════════════════════════════════════════════════════════════════════════
--  GYDSchain — Complete Database Schema
--  Chain ID: 13370 (mainnet)  |  Dual coin: GYDS (gas) + GYD (stablecoin)
--
--  IDEMPOTENT: safe to run multiple times against an existing database.
--  Run against Supabase via the SQL editor or psql:
--    psql $DATABASE_URL -f gydschain-complete-schema.sql
--
--  Sections:
--   §01  Extensions & Types
--   §02  Core Auth & Roles
--   §03  User Management & Profiles
--   §04  Wallets & Transactions
--   §05  Node Network
--   §06  Mining & Validators
--   §07  Tokens & Launchpad
--   §08  DeFi — Pools / Swaps / Staking / Yield
--   §09  Security & Firewall
--   §10  Faucet & Testnet
--   §11  Governance & DAO
--   §12  NFT & Digital Assets
--   §13  Advanced Analytics & Price Data
--   §14  Notifications & Webhooks
--   §15  Social & Community
--   §16  Multi-Signature Wallets
--   §17  Compliance, KYC & Sanctions
--   §18  API Access Management
--   §19  Gamification & Achievements
--   §20  Content, Media & Announcements
--   §21  Smart Contracts & Oracle Network
--   §22  Real-World Asset Tokenization (RWA)
--   §23  Advanced Order Book (DEX Pro)
--   §24  Insurance & Risk Protocol
--   §25  Decentralized Identity (DID)
--   §26  Shared Helper Functions & Views
--   §27  Seed / Default Data
--   §28  Realtime Subscriptions
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- §01  EXTENSIONS & TYPES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- trigram fuzzy search
CREATE EXTENSION IF NOT EXISTS "unaccent";    -- accent-insensitive search

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('user', 'admin', 'founder');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tx_status AS ENUM ('pending', 'confirmed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.node_type AS ENUM ('litenode', 'fullnode', 'rpc', 'validator', 'bootnode', 'devnode');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.network_env AS ENUM ('devnet', 'testnet', 'mainnet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §02  CORE AUTH & ROLES
-- ─────────────────────────────────────────────────────────────────────────────

-- Shared updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Security-definer role checker (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role     app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL
    USING (public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Auto-assign 'user' role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'user'); RETURN new; END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- ─────────────────────────────────────────────────────────────────────────────
-- §03  USER MANAGEMENT & PROFILES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  email         TEXT,
  username      TEXT UNIQUE,
  display_name  TEXT,
  avatar_url    TEXT,
  bio           TEXT,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','founder')),
  is_verified   BOOLEAN NOT NULL DEFAULT false,
  is_suspended  BOOLEAN NOT NULL DEFAULT false,
  locale        TEXT NOT NULL DEFAULT 'en',
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  notification_prefs JSONB NOT NULL DEFAULT '{"email":true,"push":false,"sms":false}'::jsonb,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.profiles (user_id, email) VALUES (new.id, new.email); RETURN new; END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Session tracking (login events, device fingerprints)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  device_type   TEXT,
  user_agent    TEXT,
  ip_address    TEXT,
  country       TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_active   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ
);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own sessions" ON public.user_sessions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert own sessions" ON public.user_sessions FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON public.user_sessions(is_active) WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- §04  WALLETS & TRANSACTIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wallets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  address        TEXT NOT NULL,
  encrypted_seed TEXT NOT NULL,
  pin_hash       TEXT NOT NULL,
  label          TEXT,
  is_hardware    BOOLEAN NOT NULL DEFAULT false,
  is_primary     BOOLEAN NOT NULL DEFAULT false,
  gyds_balance   NUMERIC NOT NULL DEFAULT 0,
  gyd_balance    NUMERIC NOT NULL DEFAULT 0,
  total_txs      BIGINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, address)
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view their own wallets" ON public.wallets FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can create their own wallets" ON public.wallets FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update their own wallets" ON public.wallets FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can delete their own wallets" ON public.wallets FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_wallets_updated_at ON public.wallets;
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id      UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  from_address   TEXT NOT NULL,
  to_address     TEXT NOT NULL,
  amount         NUMERIC NOT NULL,
  fee            NUMERIC NOT NULL DEFAULT 0.001,
  coin_symbol    TEXT NOT NULL DEFAULT 'GYD',
  tx_hash        TEXT UNIQUE,
  status         tx_status NOT NULL DEFAULT 'pending',
  block_height   BIGINT,
  network        network_env NOT NULL DEFAULT 'mainnet',
  memo           TEXT,
  raw_tx         JSONB,
  confirmed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view their own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can create their own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view all transactions" ON public.transactions FOR SELECT USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_from ON public.transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_transactions_to ON public.transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- §05  NODE NETWORK
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.node_installations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_type            TEXT NOT NULL DEFAULT 'litenode'
                         CHECK (node_type IN ('litenode','fullnode','rpc','validator','bootnode','devnode')),
  version              TEXT,
  wireguard_public_key  TEXT,
  wireguard_private_key TEXT,
  is_synced            BOOLEAN DEFAULT false,
  is_online            BOOLEAN DEFAULT false,
  is_approved          BOOLEAN DEFAULT false,
  is_active            BOOLEAN DEFAULT true,
  approved_by          UUID REFERENCES auth.users,
  approved_at          TIMESTAMPTZ,
  last_sync_at         TIMESTAMPTZ,
  last_heartbeat       TIMESTAMPTZ,
  hash_rate            BIGINT DEFAULT 0,
  valid_shares         BIGINT DEFAULT 0,
  total_rewards        NUMERIC DEFAULT 0,
  uptime_seconds       BIGINT DEFAULT 0,
  connection_quality   INTEGER DEFAULT 100,
  sync_progress        INTEGER DEFAULT 0,
  blocks_synced        BIGINT DEFAULT 0,
  last_block_height    BIGINT DEFAULT 0,
  error_count          INTEGER DEFAULT 0,
  peer_count           INTEGER DEFAULT 0,
  rpc_endpoint         TEXT,
  region               TEXT,
  tags                 TEXT[] DEFAULT '{}',
  metadata             JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.node_installations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view their own installations" ON public.node_installations FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert their own installations" ON public.node_installations FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update their own installations" ON public.node_installations FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can delete their own installations" ON public.node_installations FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view all installations" ON public.node_installations FOR SELECT USING (public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can update all installations" ON public.node_installations FOR UPDATE USING (public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can delete installations" ON public.node_installations FOR DELETE USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_node_installations_updated_at ON public.node_installations;
CREATE TRIGGER update_node_installations_updated_at BEFORE UPDATE ON public.node_installations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_node_installations_user_id ON public.node_installations(user_id);
CREATE INDEX IF NOT EXISTS idx_node_installations_online ON public.node_installations(is_online) WHERE is_online = true;

-- Historical node metrics (time-series, auto-pruned)
CREATE TABLE IF NOT EXISTS public.node_metrics_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id        UUID NOT NULL REFERENCES public.node_installations(id) ON DELETE CASCADE,
  hash_rate      BIGINT NOT NULL DEFAULT 0,
  peer_count     INTEGER NOT NULL DEFAULT 0,
  block_height   BIGINT NOT NULL DEFAULT 0,
  latency_ms     INTEGER,
  cpu_percent    NUMERIC(5,2),
  memory_mb      INTEGER,
  disk_used_gb   NUMERIC(10,2),
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.node_metrics_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admins can view all metrics" ON public.node_metrics_history FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_node_metrics_node_id ON public.node_metrics_history(node_id, recorded_at DESC);
-- Auto-prune metrics older than 90 days
CREATE OR REPLACE FUNCTION public.prune_old_node_metrics()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.node_metrics_history WHERE recorded_at < now() - INTERVAL '90 days';
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §06  MINING & VALIDATORS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.network_validators (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address          TEXT NOT NULL UNIQUE,
  name             TEXT,
  description      TEXT,
  website          TEXT,
  logo_url         TEXT,
  stake            NUMERIC NOT NULL DEFAULT 0,
  commission       INTEGER NOT NULL DEFAULT 10 CHECK (commission BETWEEN 0 AND 100),
  self_stake       NUMERIC NOT NULL DEFAULT 0,
  delegated_stake  NUMERIC NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  is_jailed        BOOLEAN NOT NULL DEFAULT false,
  jail_reason      TEXT,
  jailed_at        TIMESTAMPTZ,
  uptime           NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  blocks_proposed  BIGINT NOT NULL DEFAULT 0,
  blocks_missed    BIGINT NOT NULL DEFAULT 0,
  last_vote_height BIGINT NOT NULL DEFAULT 0,
  voting_power     NUMERIC NOT NULL DEFAULT 0,
  rank             INTEGER,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.network_validators ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view validators" ON public.network_validators FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage validators" ON public.network_validators FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_network_validators_updated_at ON public.network_validators;
CREATE TRIGGER update_network_validators_updated_at BEFORE UPDATE ON public.network_validators FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.validator_delegations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  validator_id   UUID NOT NULL REFERENCES public.network_validators(id) ON DELETE CASCADE,
  amount         NUMERIC NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','undelegating','completed')),
  delegated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  undelegated_at TIMESTAMPTZ,
  unbonding_ends TIMESTAMPTZ,
  rewards_earned NUMERIC NOT NULL DEFAULT 0,
  auto_compound  BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.validator_delegations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own delegations" ON public.validator_delegations FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can create delegations" ON public.validator_delegations FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update own delegations" ON public.validator_delegations FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view all delegations" ON public.validator_delegations FOR SELECT USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Anyone can view delegation counts" ON public.validator_delegations FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_delegations_user_id ON public.validator_delegations(user_id);
CREATE INDEX IF NOT EXISTS idx_delegations_validator_id ON public.validator_delegations(validator_id);

-- Detailed staking rewards ledger
CREATE TABLE IF NOT EXISTS public.staking_rewards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delegation_id  UUID REFERENCES public.validator_delegations(id) ON DELETE SET NULL,
  validator_id   UUID REFERENCES public.network_validators(id) ON DELETE SET NULL,
  amount         NUMERIC NOT NULL,
  epoch          BIGINT NOT NULL DEFAULT 0,
  reward_type    TEXT NOT NULL DEFAULT 'block' CHECK (reward_type IN ('block','fee','compound')),
  claimed        BOOLEAN NOT NULL DEFAULT false,
  claimed_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.staking_rewards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own staking rewards" ON public.staking_rewards FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage staking rewards" ON public.staking_rewards FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_staking_rewards_user_id ON public.staking_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_staking_rewards_unclaimed ON public.staking_rewards(user_id) WHERE claimed = false;

-- Mining pool registry
CREATE TABLE IF NOT EXISTS public.mining_pools (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL UNIQUE,
  operator_id      UUID REFERENCES auth.users(id),
  fee_percent      NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  min_payout       NUMERIC NOT NULL DEFAULT 0.001,
  payout_interval  INTEGER NOT NULL DEFAULT 86400, -- seconds
  algorithm        TEXT NOT NULL DEFAULT 'randomx' CHECK (algorithm IN ('randomx','kheavyhash')),
  pool_address     TEXT NOT NULL,
  api_endpoint     TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  total_hash_rate  BIGINT NOT NULL DEFAULT 0,
  miner_count      INTEGER NOT NULL DEFAULT 0,
  blocks_found     BIGINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mining_pools ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view mining pools" ON public.mining_pools FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage mining pools" ON public.mining_pools FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_mining_pools_updated_at ON public.mining_pools;
CREATE TRIGGER update_mining_pools_updated_at BEFORE UPDATE ON public.mining_pools FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- §07  TOKENS & LAUNCHPAD
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tokens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id          UUID NOT NULL REFERENCES auth.users(id),
  name                TEXT NOT NULL,
  symbol              TEXT NOT NULL,
  decimals            INTEGER NOT NULL DEFAULT 18,
  total_supply        NUMERIC NOT NULL,
  burned_supply       NUMERIC NOT NULL DEFAULT 0,
  circulating_supply  NUMERIC NOT NULL DEFAULT 0,
  gyds_liquidity      NUMERIC NOT NULL DEFAULT 0,
  logo_url            TEXT,
  website             TEXT,
  telegram            TEXT,
  twitter             TEXT,
  description         TEXT,
  lp_lock_type        TEXT NOT NULL DEFAULT 'burned',
  lp_unlock_time      TIMESTAMPTZ,
  freeze_enabled      BOOLEAN NOT NULL DEFAULT false,
  freeze_holder       TEXT,
  freeze_locked       BOOLEAN NOT NULL DEFAULT false,
  update_enabled      BOOLEAN NOT NULL DEFAULT false,
  update_holder       TEXT,
  update_locked       BOOLEAN NOT NULL DEFAULT false,
  mint_enabled        BOOLEAN NOT NULL DEFAULT false,
  mint_holder         TEXT,
  mint_locked         BOOLEAN NOT NULL DEFAULT false,
  address             TEXT NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  is_verified         BOOLEAN NOT NULL DEFAULT false,
  is_featured         BOOLEAN NOT NULL DEFAULT false,
  network_type        TEXT NOT NULL DEFAULT 'devnet' CHECK (network_type IN ('devnet','testnet','mainnet')),
  mainnet_promoted_at TIMESTAMPTZ,
  market_cap_usd      NUMERIC NOT NULL DEFAULT 0,
  price_usd           NUMERIC NOT NULL DEFAULT 0,
  volume_24h          NUMERIC NOT NULL DEFAULT 0,
  price_change_24h    NUMERIC NOT NULL DEFAULT 0,
  holder_count        INTEGER NOT NULL DEFAULT 0,
  extra_authorities   JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags                TEXT[] DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view active tokens" ON public.tokens FOR SELECT USING (is_active = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can create tokens" ON public.tokens FOR INSERT WITH CHECK (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Creators can update their tokens" ON public.tokens FOR UPDATE USING (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage all tokens" ON public.tokens FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_tokens_updated_at ON public.tokens;
CREATE TRIGGER update_tokens_updated_at BEFORE UPDATE ON public.tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_tokens_network_type ON public.tokens(network_type);
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON public.tokens USING gin (symbol gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tokens_name ON public.tokens USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.token_operations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('burn','mint','premine_gyds','premine_gyd','transfer','freeze','unfreeze')),
  amount         NUMERIC NOT NULL,
  usdt_amount    NUMERIC DEFAULT 0,
  wallet_address TEXT NOT NULL,
  token_id       UUID REFERENCES public.tokens(id) ON DELETE SET NULL,
  tx_hash        TEXT,
  block_height   BIGINT,
  created_by     UUID REFERENCES auth.users(id),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed')),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.token_operations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admins can manage token operations" ON public.token_operations FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can view confirmed operations" ON public.token_operations FOR SELECT USING (status = 'confirmed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_token_ops_status ON public.token_operations(status);
CREATE INDEX IF NOT EXISTS idx_token_ops_wallet ON public.token_operations(wallet_address);
CREATE INDEX IF NOT EXISTS idx_token_ops_type ON public.token_operations(operation_type);

CREATE TABLE IF NOT EXISTS public.token_price (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price               NUMERIC NOT NULL DEFAULT 0.0000001,
  total_supply        NUMERIC NOT NULL DEFAULT 100000000000,
  circulating_supply  NUMERIC NOT NULL DEFAULT 0,
  burned_total        NUMERIC NOT NULL DEFAULT 0,
  market_cap          NUMERIC NOT NULL DEFAULT 0,
  ath                 NUMERIC NOT NULL DEFAULT 0,
  atl                 NUMERIC NOT NULL DEFAULT 0,
  ath_date            TIMESTAMPTZ,
  atl_date            TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.token_price ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view token price" ON public.token_price FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Only founders can update price" ON public.token_price FOR UPDATE USING (has_role(auth.uid(), 'founder')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Founders can insert token price" ON public.token_price FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'founder')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Founders can delete token price" ON public.token_price FOR DELETE TO authenticated USING (has_role(auth.uid(), 'founder')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.token_watchlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id   UUID NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, token_id)
);
ALTER TABLE public.token_watchlist ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own watchlist" ON public.token_watchlist FOR SELECT TO authenticated USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can add to watchlist" ON public.token_watchlist FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can remove from watchlist" ON public.token_watchlist FOR DELETE TO authenticated USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.token_price_alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id     UUID NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  target_price NUMERIC NOT NULL,
  direction    TEXT NOT NULL DEFAULT 'above' CHECK (direction IN ('above','below')),
  is_triggered BOOLEAN NOT NULL DEFAULT false,
  triggered_at TIMESTAMPTZ,
  repeat_alert BOOLEAN NOT NULL DEFAULT false,
  notify_email BOOLEAN NOT NULL DEFAULT true,
  notify_push  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.token_price_alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own alerts" ON public.token_price_alerts FOR SELECT TO authenticated USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can create alerts" ON public.token_price_alerts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update own alerts" ON public.token_price_alerts FOR UPDATE TO authenticated USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can delete own alerts" ON public.token_price_alerts FOR DELETE TO authenticated USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.token_launches (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id              UUID NOT NULL REFERENCES auth.users(id),
  token_id                UUID REFERENCES public.tokens(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  symbol                  TEXT NOT NULL,
  description             TEXT,
  logo_url                TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','live','upcoming','completed','cancelled')),
  target_raise            NUMERIC NOT NULL DEFAULT 0,
  raised_amount           NUMERIC NOT NULL DEFAULT 0,
  participants            INTEGER NOT NULL DEFAULT 0,
  bonding_curve_type      TEXT NOT NULL DEFAULT 'linear'
                            CHECK (bonding_curve_type IN ('linear','exponential','sigmoid','flat')),
  bonding_curve_steepness NUMERIC NOT NULL DEFAULT 1.0,
  initial_price           NUMERIC NOT NULL DEFAULT 0.001,
  max_price               NUMERIC,
  soft_cap                NUMERIC,
  hard_cap                NUMERIC,
  vesting_months          INTEGER DEFAULT 0,
  cliff_months            INTEGER DEFAULT 0,
  is_premier              BOOLEAN NOT NULL DEFAULT false,
  is_kol_launch           BOOLEAN NOT NULL DEFAULT false,
  starts_at               TIMESTAMPTZ,
  ends_at                 TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.token_launches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view approved launches" ON public.token_launches FOR SELECT TO authenticated USING (status IN ('live','upcoming','completed')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Creators can insert launches" ON public.token_launches FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Creators can update own launches" ON public.token_launches FOR UPDATE TO authenticated USING (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage all launches" ON public.token_launches FOR ALL TO authenticated USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_token_launches_updated_at ON public.token_launches;
CREATE TRIGGER update_token_launches_updated_at BEFORE UPDATE ON public.token_launches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Launch contributions
CREATE TABLE IF NOT EXISTS public.launch_contributions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id      UUID NOT NULL REFERENCES public.token_launches(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL REFERENCES auth.users(id),
  wallet_address TEXT NOT NULL,
  amount         NUMERIC NOT NULL CHECK (amount > 0),
  token_amount   NUMERIC NOT NULL DEFAULT 0,
  tx_hash        TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','refunded')),
  refunded_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.launch_contributions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own contributions" ON public.launch_contributions FOR SELECT USING (auth.uid() = contributor_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can create contributions" ON public.launch_contributions FOR INSERT WITH CHECK (auth.uid() = contributor_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view all contributions" ON public.launch_contributions FOR SELECT USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §08  DeFi — POOLS / SWAPS / STAKING / YIELD
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.liquidity_pools (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID NOT NULL REFERENCES auth.users(id),
  token_a_symbol   TEXT NOT NULL,
  token_b_symbol   TEXT NOT NULL,
  token_a_address  TEXT,
  token_b_address  TEXT,
  token_a_reserve  NUMERIC NOT NULL DEFAULT 0,
  token_b_reserve  NUMERIC NOT NULL DEFAULT 0,
  fee_tier         NUMERIC NOT NULL DEFAULT 0.3 CHECK (fee_tier IN (0.05,0.1,0.3,1.0)),
  tvl              NUMERIC NOT NULL DEFAULT 0,
  volume_24h       NUMERIC NOT NULL DEFAULT 0,
  volume_7d        NUMERIC NOT NULL DEFAULT 0,
  fees_24h         NUMERIC NOT NULL DEFAULT 0,
  apr              NUMERIC NOT NULL DEFAULT 0,
  lp_token_supply  NUMERIC NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  is_featured      BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.liquidity_pools ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view active pools" ON public.liquidity_pools FOR SELECT USING (is_active = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users can create pools" ON public.liquidity_pools FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Creators can update own pools" ON public.liquidity_pools FOR UPDATE TO authenticated USING (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage all pools" ON public.liquidity_pools FOR ALL TO authenticated USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_liquidity_pools_updated_at ON public.liquidity_pools;
CREATE TRIGGER update_liquidity_pools_updated_at BEFORE UPDATE ON public.liquidity_pools FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User LP positions
CREATE TABLE IF NOT EXISTS public.lp_positions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pool_id        UUID NOT NULL REFERENCES public.liquidity_pools(id) ON DELETE CASCADE,
  lp_tokens      NUMERIC NOT NULL DEFAULT 0 CHECK (lp_tokens >= 0),
  token_a_amount NUMERIC NOT NULL DEFAULT 0,
  token_b_amount NUMERIC NOT NULL DEFAULT 0,
  fees_earned    NUMERIC NOT NULL DEFAULT 0,
  is_staked      BOOLEAN NOT NULL DEFAULT false,
  entered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lp_positions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own LP positions" ON public.lp_positions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own LP positions" ON public.lp_positions FOR ALL WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_lp_positions_updated_at ON public.lp_positions;
CREATE TRIGGER update_lp_positions_updated_at BEFORE UPDATE ON public.lp_positions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- DEX swap history
CREATE TABLE IF NOT EXISTS public.swap_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  pool_id          UUID REFERENCES public.liquidity_pools(id) ON DELETE SET NULL,
  wallet_address   TEXT NOT NULL,
  token_in_symbol  TEXT NOT NULL,
  token_out_symbol TEXT NOT NULL,
  amount_in        NUMERIC NOT NULL,
  amount_out       NUMERIC NOT NULL,
  fee_amount       NUMERIC NOT NULL DEFAULT 0,
  price_impact     NUMERIC NOT NULL DEFAULT 0,
  tx_hash          TEXT UNIQUE,
  status           tx_status NOT NULL DEFAULT 'confirmed',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.swap_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own swaps" ON public.swap_history FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view all swaps" ON public.swap_history FOR SELECT USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_swap_history_wallet ON public.swap_history(wallet_address);
CREATE INDEX IF NOT EXISTS idx_swap_history_created_at ON public.swap_history(created_at DESC);

-- Cross-chain bridge transactions
CREATE TABLE IF NOT EXISTS public.bridge_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_chain        TEXT NOT NULL,
  to_chain          TEXT NOT NULL,
  from_address      TEXT NOT NULL,
  to_address        TEXT NOT NULL,
  token_symbol      TEXT NOT NULL,
  amount            NUMERIC NOT NULL,
  bridge_fee        NUMERIC NOT NULL DEFAULT 0,
  src_tx_hash       TEXT,
  dst_tx_hash       TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','bridging','completed','failed','refunded')),
  estimated_minutes INTEGER DEFAULT 15,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bridge_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own bridge txs" ON public.bridge_transactions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view all bridge txs" ON public.bridge_transactions FOR SELECT USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Yield vaults (auto-compounding strategies)
CREATE TABLE IF NOT EXISTS public.yield_vaults (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  strategy        TEXT NOT NULL,
  token_symbol    TEXT NOT NULL,
  tvl             NUMERIC NOT NULL DEFAULT 0,
  apy             NUMERIC NOT NULL DEFAULT 0,
  performance_fee NUMERIC NOT NULL DEFAULT 10.0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  risk_level      TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high')),
  description     TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.yield_vaults ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view yield vaults" ON public.yield_vaults FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage yield vaults" ON public.yield_vaults FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- User vault positions
CREATE TABLE IF NOT EXISTS public.vault_positions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_id        UUID NOT NULL REFERENCES public.yield_vaults(id) ON DELETE CASCADE,
  shares          NUMERIC NOT NULL DEFAULT 0,
  deposited_amount NUMERIC NOT NULL DEFAULT 0,
  current_value   NUMERIC NOT NULL DEFAULT 0,
  profit_loss     NUMERIC NOT NULL DEFAULT 0,
  last_compound   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vault_positions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can manage own vault positions" ON public.vault_positions FOR ALL WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §09  SECURITY & FIREWALL
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_config (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key   TEXT UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  is_public    BOOLEAN NOT NULL DEFAULT false,
  updated_by   UUID REFERENCES auth.users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Founders can manage admin config" ON public.admin_config FOR ALL USING (has_role(auth.uid(), 'founder')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage admin config" ON public.admin_config FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'founder')) WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'founder')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Public can read public config" ON public.admin_config FOR SELECT USING (config_key NOT LIKE 'secret_%' AND is_public = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ai_security_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category         TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  action           TEXT NOT NULL DEFAULT 'log',
  source           TEXT NOT NULL DEFAULT 'ai_firewall',
  summary          TEXT NOT NULL,
  details          JSONB NOT NULL DEFAULT '{}'::jsonb,
  model            TEXT,
  subject_address  TEXT,
  subject_user_id  UUID,
  is_resolved      BOOLEAN NOT NULL DEFAULT false,
  resolved_by      UUID REFERENCES auth.users(id),
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_security_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admins can manage security events" ON public.ai_security_events FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_ai_events_severity ON public.ai_security_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_events_unresolved ON public.ai_security_events(is_resolved) WHERE is_resolved = false;

CREATE TABLE IF NOT EXISTS public.firewall_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type   TEXT NOT NULL DEFAULT 'ufw',
  action      TEXT NOT NULL DEFAULT 'allow',
  protocol    TEXT NOT NULL DEFAULT 'tcp',
  port        TEXT,
  ip_address  TEXT,
  direction   TEXT NOT NULL DEFAULT 'in',
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  priority    INTEGER NOT NULL DEFAULT 100,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.firewall_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admins can manage firewall rules" ON public.firewall_rules FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Anyone can view firewall rules" ON public.firewall_rules FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.fail2ban_jails (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jail_name   TEXT NOT NULL,
  is_enabled  BOOLEAN NOT NULL DEFAULT true,
  max_retries INTEGER NOT NULL DEFAULT 5,
  ban_time    INTEGER NOT NULL DEFAULT 3600,
  find_time   INTEGER NOT NULL DEFAULT 600,
  log_path    TEXT,
  filter_name TEXT,
  action      TEXT DEFAULT 'iptables-multiport',
  description TEXT,
  banned_ips  TEXT[] DEFAULT '{}',
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fail2ban_jails ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admins can manage fail2ban jails" ON public.fail2ban_jails FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Anyone can view fail2ban jails" ON public.fail2ban_jails FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ip_access_list (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address   TEXT NOT NULL,
  list_type    TEXT NOT NULL DEFAULT 'whitelist' CHECK (list_type IN ('whitelist','blacklist')),
  reason       TEXT,
  expires_at   TIMESTAMPTZ,
  country_code TEXT,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ip_access_list ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admins can manage IP access list" ON public.ip_access_list FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Anyone can view IP access list" ON public.ip_access_list FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.rate_limit_rules (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  endpoint           TEXT NOT NULL,
  requests_per_window INTEGER NOT NULL DEFAULT 100,
  window_seconds     INTEGER NOT NULL DEFAULT 60,
  burst_limit        INTEGER NOT NULL DEFAULT 20,
  action             TEXT NOT NULL DEFAULT 'throttle' CHECK (action IN ('throttle','block','log')),
  is_enabled         BOOLEAN NOT NULL DEFAULT true,
  description        TEXT,
  created_by         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rate_limit_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admins can manage rate limit rules" ON public.rate_limit_rules FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Anyone can view rate limit rules" ON public.rate_limit_rules FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ddos_protection (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  protection_type TEXT NOT NULL DEFAULT 'syn_flood',
  threshold       INTEGER NOT NULL DEFAULT 1000,
  action          TEXT NOT NULL DEFAULT 'drop' CHECK (action IN ('drop','throttle','challenge','log')),
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  parameters      JSONB NOT NULL DEFAULT '{}'::jsonb,
  description     TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ddos_protection ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admins can manage DDoS protection" ON public.ddos_protection FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Anyone can view DDoS protection" ON public.ddos_protection FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  user_email  TEXT,
  action      TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  target_type TEXT,
  target_id   TEXT,
  details     JSONB DEFAULT '{}',
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admins can view all audit logs" ON public.audit_logs FOR SELECT USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can view own audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON public.audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);

-- Feature flags
CREATE TABLE IF NOT EXISTS public.feature_toggles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL UNIQUE,
  is_enabled  BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  rollout_pct INTEGER NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  UUID REFERENCES auth.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.feature_toggles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can read feature toggles" ON public.feature_toggles FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage feature toggles" ON public.feature_toggles FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Documentation CMS
CREATE TABLE IF NOT EXISTS public.documentation (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'general',
  is_public  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documentation ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view public documentation" ON public.documentation FOR SELECT USING (is_public = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage documentation" ON public.documentation FOR ALL USING (public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_documentation_updated_at ON public.documentation;
CREATE TRIGGER update_documentation_updated_at BEFORE UPDATE ON public.documentation FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- §10  FAUCET & TESTNET
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.faucet_claims (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  token_type     TEXT NOT NULL CHECK (token_type IN ('gyd','gyds')),
  amount         NUMERIC NOT NULL,
  tx_hash        TEXT,
  network        network_env NOT NULL DEFAULT 'testnet',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.faucet_claims ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own faucet claims" ON public.faucet_claims FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view all faucet claims" ON public.faucet_claims FOR SELECT USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_faucet_claims_user_token ON public.faucet_claims(user_id, token_type, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- §11  GOVERNANCE & DAO
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.governance_proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_id      UUID NOT NULL REFERENCES auth.users(id),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  proposal_type    TEXT NOT NULL DEFAULT 'parameter'
                     CHECK (proposal_type IN ('parameter','treasury','upgrade','social','emergency','grant')),
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','voting','passed','rejected','executed','cancelled','expired')),
  quorum_required  NUMERIC NOT NULL DEFAULT 10.0, -- percent of total voting power
  threshold        NUMERIC NOT NULL DEFAULT 50.0, -- percent yes to pass
  votes_yes        NUMERIC NOT NULL DEFAULT 0,
  votes_no         NUMERIC NOT NULL DEFAULT 0,
  votes_abstain    NUMERIC NOT NULL DEFAULT 0,
  execution_delay  INTEGER NOT NULL DEFAULT 172800, -- 48h in seconds
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_at      TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  voting_starts_at TIMESTAMPTZ,
  voting_ends_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.governance_proposals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view governance proposals" ON public.governance_proposals FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users can create proposals" ON public.governance_proposals FOR INSERT TO authenticated WITH CHECK (auth.uid() = proposer_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage proposals" ON public.governance_proposals FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_governance_proposals_updated_at ON public.governance_proposals;
CREATE TRIGGER update_governance_proposals_updated_at BEFORE UPDATE ON public.governance_proposals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.governance_votes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID NOT NULL REFERENCES public.governance_proposals(id) ON DELETE CASCADE,
  voter_id      UUID NOT NULL REFERENCES auth.users(id),
  wallet_address TEXT NOT NULL,
  vote_type     TEXT NOT NULL CHECK (vote_type IN ('yes','no','abstain')),
  voting_power  NUMERIC NOT NULL DEFAULT 0,
  reason        TEXT,
  tx_hash       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, voter_id)
);
ALTER TABLE public.governance_votes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view governance votes" ON public.governance_votes FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users can vote" ON public.governance_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = voter_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal ON public.governance_votes(proposal_id);

CREATE TABLE IF NOT EXISTS public.governance_treasury (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID REFERENCES public.governance_proposals(id),
  tx_type      TEXT NOT NULL CHECK (tx_type IN ('deposit','withdrawal','grant','fee')),
  amount       NUMERIC NOT NULL,
  coin_symbol  TEXT NOT NULL DEFAULT 'GYDS',
  from_address TEXT,
  to_address   TEXT,
  description  TEXT,
  approved_by  UUID REFERENCES auth.users(id),
  tx_hash      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.governance_treasury ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view treasury" ON public.governance_treasury FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage treasury" ON public.governance_treasury FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §12  NFT & DIGITAL ASSETS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nft_collections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID NOT NULL REFERENCES auth.users(id),
  name             TEXT NOT NULL,
  symbol           TEXT NOT NULL,
  description      TEXT,
  image_url        TEXT,
  banner_url       TEXT,
  contract_address TEXT UNIQUE,
  royalty_percent  NUMERIC NOT NULL DEFAULT 5.0 CHECK (royalty_percent BETWEEN 0 AND 50),
  max_supply       INTEGER,
  minted_count     INTEGER NOT NULL DEFAULT 0,
  floor_price      NUMERIC NOT NULL DEFAULT 0,
  volume_all_time  NUMERIC NOT NULL DEFAULT 0,
  is_verified      BOOLEAN NOT NULL DEFAULT false,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nft_collections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view active NFT collections" ON public.nft_collections FOR SELECT USING (is_active = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can create NFT collections" ON public.nft_collections FOR INSERT WITH CHECK (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage all NFT collections" ON public.nft_collections FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_nft_collections_updated_at ON public.nft_collections;
CREATE TRIGGER update_nft_collections_updated_at BEFORE UPDATE ON public.nft_collections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.nft_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES public.nft_collections(id) ON DELETE CASCADE,
  owner_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token_id      BIGINT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  image_url     TEXT NOT NULL,
  animation_url TEXT,
  attributes    JSONB NOT NULL DEFAULT '[]'::jsonb,
  rarity_rank   INTEGER,
  rarity_score  NUMERIC,
  is_listed     BOOLEAN NOT NULL DEFAULT false,
  list_price    NUMERIC,
  last_sale     NUMERIC,
  mint_address  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(collection_id, token_id)
);
ALTER TABLE public.nft_tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view NFTs" ON public.nft_tokens FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owners can update NFTs" ON public.nft_tokens FOR UPDATE USING (auth.uid() = owner_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_nft_tokens_collection ON public.nft_tokens(collection_id);
CREATE INDEX IF NOT EXISTS idx_nft_tokens_owner ON public.nft_tokens(owner_id);
CREATE INDEX IF NOT EXISTS idx_nft_tokens_listed ON public.nft_tokens(is_listed) WHERE is_listed = true;

CREATE TABLE IF NOT EXISTS public.nft_marketplace_listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nft_id        UUID NOT NULL REFERENCES public.nft_tokens(id) ON DELETE CASCADE,
  seller_id     UUID NOT NULL REFERENCES auth.users(id),
  buyer_id      UUID REFERENCES auth.users(id),
  price         NUMERIC NOT NULL CHECK (price > 0),
  coin_symbol   TEXT NOT NULL DEFAULT 'GYD',
  listing_type  TEXT NOT NULL DEFAULT 'fixed' CHECK (listing_type IN ('fixed','auction','offer')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','cancelled','expired')),
  auction_ends  TIMESTAMPTZ,
  sold_at       TIMESTAMPTZ,
  tx_hash       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nft_marketplace_listings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view active listings" ON public.nft_marketplace_listings FOR SELECT USING (status = 'active'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Sellers can manage own listings" ON public.nft_marketplace_listings FOR ALL USING (auth.uid() = seller_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §13  ADVANCED ANALYTICS & PRICE DATA
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.price_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id    UUID REFERENCES public.tokens(id) ON DELETE CASCADE,
  coin_symbol TEXT NOT NULL DEFAULT 'GYDS',
  open        NUMERIC NOT NULL,
  high        NUMERIC NOT NULL,
  low         NUMERIC NOT NULL,
  close       NUMERIC NOT NULL,
  volume      NUMERIC NOT NULL DEFAULT 0,
  interval    TEXT NOT NULL DEFAULT '1h'
                CHECK (interval IN ('1m','5m','15m','1h','4h','1d','1w','1M')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view price history" ON public.price_history FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage price history" ON public.price_history FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_price_history_symbol_interval ON public.price_history(coin_symbol, interval, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.network_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_height        BIGINT NOT NULL,
  total_supply        NUMERIC NOT NULL,
  circulating_supply  NUMERIC NOT NULL,
  active_validators   INTEGER NOT NULL,
  active_nodes        INTEGER NOT NULL,
  total_staked        NUMERIC NOT NULL,
  total_burned        NUMERIC NOT NULL,
  network_hash_rate   BIGINT NOT NULL DEFAULT 0,
  avg_block_time_ms   INTEGER NOT NULL,
  tx_count_24h        BIGINT NOT NULL DEFAULT 0,
  active_wallets_24h  INTEGER NOT NULL DEFAULT 0,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.network_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view network snapshots" ON public.network_snapshots FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage network snapshots" ON public.network_snapshots FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_network_snapshots_time ON public.network_snapshots(recorded_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- §14  NOTIFICATIONS & WEBHOOKS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  action_url   TEXT,
  icon         TEXT,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  read_at      TIMESTAMPTZ,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own notifications" ON public.user_notifications FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update own notifications" ON public.user_notifications FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service role can insert notifications" ON public.user_notifications FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.user_notifications(user_id) WHERE is_read = false;

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  secret       TEXT NOT NULL,
  events       TEXT[] NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  last_ping    TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can manage own webhooks" ON public.webhook_endpoints FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id  UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  status_code  INTEGER,
  response_body TEXT,
  attempt      INTEGER NOT NULL DEFAULT 1,
  delivered_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own deliveries" ON public.webhook_deliveries FOR SELECT USING (EXISTS (SELECT 1 FROM public.webhook_endpoints e WHERE e.id = endpoint_id AND e.user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §15  SOCIAL & COMMUNITY
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT,
  body         TEXT NOT NULL,
  post_type    TEXT NOT NULL DEFAULT 'discussion'
                 CHECK (post_type IN ('discussion','announcement','idea','question','showcase')),
  related_type TEXT, -- 'token','validator','proposal'
  related_id   UUID,
  upvotes      INTEGER NOT NULL DEFAULT 0,
  downvotes    INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  is_locked    BOOLEAN NOT NULL DEFAULT false,
  is_hidden    BOOLEAN NOT NULL DEFAULT false,
  tags         TEXT[] DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view community posts" ON public.community_posts FOR SELECT USING (is_hidden = false); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users can post" ON public.community_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authors can update own posts" ON public.community_posts FOR UPDATE USING (auth.uid() = author_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage posts" ON public.community_posts FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_community_posts_type ON public.community_posts(post_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_fts ON public.community_posts USING gin(to_tsvector('english', coalesce(title,'') || ' ' || body));

CREATE TABLE IF NOT EXISTS public.community_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  upvotes    INTEGER NOT NULL DEFAULT 0,
  is_hidden  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view comments" ON public.community_comments FOR SELECT USING (is_hidden = false); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated users can comment" ON public.community_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authors can update own comments" ON public.community_comments FOR UPDATE USING (auth.uid() = author_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON public.community_comments(post_id);

CREATE TABLE IF NOT EXISTS public.referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID NOT NULL REFERENCES auth.users(id),
  referred_id     UUID REFERENCES auth.users(id),
  referral_code   TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','activated','rewarded')),
  reward_amount   NUMERIC NOT NULL DEFAULT 0,
  reward_type     TEXT NOT NULL DEFAULT 'gyds',
  activated_at    TIMESTAMPTZ,
  rewarded_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own referrals" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can create referrals" ON public.referrals FOR INSERT WITH CHECK (auth.uid() = referrer_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §16  MULTI-SIGNATURE WALLETS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.multisig_wallets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  address         TEXT NOT NULL UNIQUE,
  creator_id      UUID NOT NULL REFERENCES auth.users(id),
  required_sigs   INTEGER NOT NULL DEFAULT 2 CHECK (required_sigs >= 2),
  total_signers   INTEGER NOT NULL DEFAULT 3,
  balance_gyds    NUMERIC NOT NULL DEFAULT 0,
  balance_gyd     NUMERIC NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.multisig_wallets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.multisig_signers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id   UUID NOT NULL REFERENCES public.multisig_wallets(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id),
  address     TEXT NOT NULL,
  label       TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wallet_id, address)
);
ALTER TABLE public.multisig_signers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.multisig_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id        UUID NOT NULL REFERENCES public.multisig_wallets(id) ON DELETE CASCADE,
  proposer_id      UUID NOT NULL REFERENCES auth.users(id),
  to_address       TEXT NOT NULL,
  amount           NUMERIC NOT NULL,
  coin_symbol      TEXT NOT NULL DEFAULT 'GYD',
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','executed','rejected','expired')),
  sigs_collected   INTEGER NOT NULL DEFAULT 0,
  sigs_required    INTEGER NOT NULL,
  executed_at      TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  tx_hash          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.multisig_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.multisig_signatures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_id          UUID NOT NULL REFERENCES public.multisig_transactions(id) ON DELETE CASCADE,
  signer_id      UUID NOT NULL REFERENCES auth.users(id),
  signer_address TEXT NOT NULL,
  signature      TEXT NOT NULL,
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tx_id, signer_address)
);
ALTER TABLE public.multisig_signatures ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Signers can view multisig wallets" ON public.multisig_wallets FOR SELECT USING (EXISTS (SELECT 1 FROM public.multisig_signers s WHERE s.wallet_id = id AND s.user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Signers can view multisig txs" ON public.multisig_transactions FOR SELECT USING (EXISTS (SELECT 1 FROM public.multisig_signers s WHERE s.wallet_id = wallet_id AND s.user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Signers can view multisig sigs" ON public.multisig_signatures FOR SELECT USING (EXISTS (SELECT 1 FROM public.multisig_transactions t JOIN public.multisig_signers s ON s.wallet_id = t.wallet_id WHERE t.id = tx_id AND s.user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §17  COMPLIANCE, KYC & SANCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kyc_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','under_review','approved','rejected','expired')),
  tier            INTEGER NOT NULL DEFAULT 0 CHECK (tier BETWEEN 0 AND 3), -- 0=none,1=basic,2=advanced,3=institutional
  provider        TEXT NOT NULL DEFAULT 'manual',
  provider_ref    TEXT, -- external KYC provider reference ID (no PII stored here)
  country_code    TEXT,
  approved_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  reviewed_by     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kyc_records ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own KYC status" ON public.kyc_records FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage KYC records" ON public.kyc_records FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.sanctions_list (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address      TEXT NOT NULL UNIQUE,
  reason       TEXT NOT NULL,
  list_source  TEXT NOT NULL DEFAULT 'manual', -- 'ofac','eu','un','manual'
  is_active    BOOLEAN NOT NULL DEFAULT true,
  added_by     UUID REFERENCES auth.users(id),
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sanctions_list ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admins can manage sanctions list" ON public.sanctions_list FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Authenticated can check sanctions" ON public.sanctions_list FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_sanctions_address ON public.sanctions_list(address) WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- §18  API ACCESS MANAGEMENT
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE, -- sha256 of actual key; never store plaintext
  key_prefix    TEXT NOT NULL,        -- first 8 chars shown to user for identification
  scopes        TEXT[] NOT NULL DEFAULT '{"read"}',
  rate_limit    INTEGER NOT NULL DEFAULT 1000,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  ip_whitelist  TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can manage own API keys" ON public.api_keys FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id   UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint     TEXT NOT NULL,
  method       TEXT NOT NULL DEFAULT 'GET',
  status_code  INTEGER NOT NULL,
  latency_ms   INTEGER,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own API logs" ON public.api_usage_logs FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can view all API logs" ON public.api_usage_logs FOR SELECT USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_api_logs_key_id ON public.api_usage_logs(api_key_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- §19  GAMIFICATION & ACHIEVEMENTS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT,
  category    TEXT NOT NULL DEFAULT 'general'
                CHECK (category IN ('general','trading','staking','node','social','governance','nft')),
  xp_reward   INTEGER NOT NULL DEFAULT 10,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  criteria    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view achievements" ON public.achievements FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage achievements" ON public.achievements FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  progress       INTEGER NOT NULL DEFAULT 0,
  is_unlocked    BOOLEAN NOT NULL DEFAULT false,
  unlocked_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own achievements" ON public.user_achievements FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Anyone can view unlocked achievements" ON public.user_achievements FOR SELECT USING (is_unlocked = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage user achievements" ON public.user_achievements FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_xp (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xp       INTEGER NOT NULL DEFAULT 0,
  level          INTEGER NOT NULL DEFAULT 1,
  rank_title     TEXT NOT NULL DEFAULT 'Newcomer',
  streak_days    INTEGER NOT NULL DEFAULT 0,
  last_active    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_xp ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own XP" ON public.user_xp FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Anyone can view leaderboard XP" ON public.user_xp FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §20  CONTENT, MEDIA & ANNOUNCEMENTS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.network_announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical','upgrade')),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  starts_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at      TIMESTAMPTZ,
  action_url   TEXT,
  action_label TEXT,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.network_announcements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view active announcements" ON public.network_announcements FOR SELECT USING (is_active = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage announcements" ON public.network_announcements FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.token_news (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id     UUID REFERENCES public.tokens(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES auth.users(id),
  title        TEXT NOT NULL,
  summary      TEXT,
  url          TEXT,
  source       TEXT,
  sentiment    TEXT CHECK (sentiment IN ('positive','neutral','negative')),
  is_verified  BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.token_news ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view token news" ON public.token_news FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage token news" ON public.token_news FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §21  SMART CONTRACTS & ORACLE NETWORK
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.smart_contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES auth.users(id),
  name            TEXT NOT NULL,
  description     TEXT,
  address         TEXT UNIQUE,
  abi             JSONB,
  bytecode        TEXT,
  source_code     TEXT,
  compiler_version TEXT,
  is_verified     BOOLEAN NOT NULL DEFAULT false,
  is_proxy        BOOLEAN NOT NULL DEFAULT false,
  implementation  TEXT,
  network         network_env NOT NULL DEFAULT 'mainnet',
  deployed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.smart_contracts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view verified contracts" ON public.smart_contracts FOR SELECT USING (is_verified = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Creators can manage own contracts" ON public.smart_contracts FOR ALL USING (auth.uid() = creator_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.contract_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'token',
  description TEXT,
  source_code TEXT NOT NULL,
  abi         JSONB,
  is_audited  BOOLEAN NOT NULL DEFAULT false,
  audit_url   TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view contract templates" ON public.contract_templates FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage contract templates" ON public.contract_templates FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.oracle_feeds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id     TEXT NOT NULL UNIQUE, -- e.g. 'GYDS/USD'
  description TEXT,
  value       NUMERIC NOT NULL DEFAULT 0,
  decimals    INTEGER NOT NULL DEFAULT 8,
  provider    TEXT NOT NULL DEFAULT 'internal',
  sources     JSONB NOT NULL DEFAULT '[]'::jsonb,
  deviation   NUMERIC NOT NULL DEFAULT 0.5, -- percent
  heartbeat   INTEGER NOT NULL DEFAULT 3600, -- seconds
  is_active   BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.oracle_feeds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view oracle feeds" ON public.oracle_feeds FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage oracle feeds" ON public.oracle_feeds FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_oracle_feeds_active ON public.oracle_feeds(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.oracle_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id      TEXT NOT NULL REFERENCES public.oracle_feeds(feed_id) ON DELETE CASCADE,
  submitter_id UUID REFERENCES auth.users(id),
  value        NUMERIC NOT NULL,
  is_accepted  BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.oracle_submissions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Admins can manage oracle submissions" ON public.oracle_submissions FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §22  REAL-WORLD ASSET TOKENIZATION (RWA)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rwa_assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id          UUID NOT NULL REFERENCES auth.users(id),
  asset_type         TEXT NOT NULL CHECK (asset_type IN ('real_estate','commodity','equity','bond','invoice','other')),
  name               TEXT NOT NULL,
  description        TEXT,
  token_symbol       TEXT NOT NULL UNIQUE,
  token_address      TEXT UNIQUE,
  total_value_usd    NUMERIC NOT NULL,
  token_price_usd    NUMERIC NOT NULL DEFAULT 1.0,
  total_tokens       NUMERIC NOT NULL,
  issued_tokens      NUMERIC NOT NULL DEFAULT 0,
  yield_percent      NUMERIC NOT NULL DEFAULT 0,
  maturity_date      DATE,
  jurisdiction       TEXT,
  legal_doc_url      TEXT, -- link to legal documents (IPFS or secure URL)
  kyc_required       BOOLEAN NOT NULL DEFAULT true,
  accredited_only    BOOLEAN NOT NULL DEFAULT false,
  is_active          BOOLEAN NOT NULL DEFAULT false,
  is_audited         BOOLEAN NOT NULL DEFAULT false,
  audit_url          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rwa_assets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view active RWA assets" ON public.rwa_assets FOR SELECT USING (is_active = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Issuers can manage own RWA assets" ON public.rwa_assets FOR ALL USING (auth.uid() = issuer_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins can manage all RWA assets" ON public.rwa_assets FOR ALL USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.rwa_holdings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id    UUID NOT NULL REFERENCES public.rwa_assets(id) ON DELETE CASCADE,
  holder_id   UUID NOT NULL REFERENCES auth.users(id),
  amount      NUMERIC NOT NULL CHECK (amount > 0),
  cost_basis  NUMERIC NOT NULL DEFAULT 0,
  yield_paid  NUMERIC NOT NULL DEFAULT 0,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rwa_holdings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Holders can view own RWA holdings" ON public.rwa_holdings FOR SELECT USING (auth.uid() = holder_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §23  ADVANCED ORDER BOOK (DEX PRO)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_book (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id),
  wallet_address TEXT NOT NULL,
  pair           TEXT NOT NULL, -- 'GYDS/GYD'
  side           TEXT NOT NULL CHECK (side IN ('buy','sell')),
  order_type     TEXT NOT NULL DEFAULT 'limit' CHECK (order_type IN ('limit','market','stop_limit','stop_market','twap','iceberg')),
  price          NUMERIC,
  stop_price     NUMERIC,
  amount         NUMERIC NOT NULL CHECK (amount > 0),
  filled_amount  NUMERIC NOT NULL DEFAULT 0,
  remaining      NUMERIC GENERATED ALWAYS AS (amount - filled_amount) STORED,
  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','partially_filled','filled','cancelled','expired')),
  time_in_force  TEXT NOT NULL DEFAULT 'gtc' CHECK (time_in_force IN ('gtc','ioc','fok','day')),
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_book ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own orders" ON public.order_book FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can create orders" ON public.order_book FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can cancel own orders" ON public.order_book FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Anyone can see open order book" ON public.order_book FOR SELECT USING (status = 'open'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_order_book_pair_open ON public.order_book(pair, side, price) WHERE status = 'open';

-- ─────────────────────────────────────────────────────────────────────────────
-- §24  INSURANCE & RISK PROTOCOL
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.insurance_pools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  coverage_type   TEXT NOT NULL CHECK (coverage_type IN ('smart_contract','exchange_hack','stablecoin_depeg','slashing','bridge')),
  total_coverage  NUMERIC NOT NULL DEFAULT 0,
  total_staked    NUMERIC NOT NULL DEFAULT 0,
  premium_rate    NUMERIC NOT NULL DEFAULT 0.5, -- percent per year
  claim_period    INTEGER NOT NULL DEFAULT 30, -- days
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.insurance_pools ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view insurance pools" ON public.insurance_pools FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         UUID NOT NULL REFERENCES public.insurance_pools(id),
  holder_id       UUID NOT NULL REFERENCES auth.users(id),
  coverage_amount NUMERIC NOT NULL,
  premium_paid    NUMERIC NOT NULL,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','claimed','cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Holders can view own policies" ON public.insurance_policies FOR SELECT USING (auth.uid() = holder_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §25  DECENTRALIZED IDENTITY (DID)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.did_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  did             TEXT NOT NULL UNIQUE, -- 'did:gyds:<address>'
  document        JSONB NOT NULL DEFAULT '{}'::jsonb,
  wallet_address  TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  verified_claims JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.did_documents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can resolve DID documents" ON public.did_documents FOR SELECT USING (is_active = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owners can manage own DID" ON public.did_documents FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.on_chain_identities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  avatar_ipfs     TEXT,
  reputation_score NUMERIC NOT NULL DEFAULT 0,
  total_txs       BIGINT NOT NULL DEFAULT 0,
  account_age_days INTEGER NOT NULL DEFAULT 0,
  is_verified     BOOLEAN NOT NULL DEFAULT false,
  badges          TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.on_chain_identities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Anyone can view on-chain identities" ON public.on_chain_identities FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Owners can update own identity" ON public.on_chain_identities FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §26  HELPER FUNCTIONS & VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

-- Count unique confirmed token holders
CREATE OR REPLACE FUNCTION public.get_token_holders_count()
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(DISTINCT wallet_address)
  FROM public.token_operations
  WHERE status = 'confirmed' AND wallet_address IS NOT NULL AND wallet_address != '';
$$;

-- Get user summary
CREATE OR REPLACE FUNCTION public.get_user_summary(_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'wallet_count',     (SELECT COUNT(*) FROM public.wallets WHERE user_id = _user_id),
    'node_count',       (SELECT COUNT(*) FROM public.node_installations WHERE user_id = _user_id),
    'delegation_count', (SELECT COUNT(*) FROM public.validator_delegations WHERE user_id = _user_id AND status = 'active'),
    'total_staked',     (SELECT COALESCE(SUM(amount),0) FROM public.validator_delegations WHERE user_id = _user_id AND status = 'active'),
    'tx_count',         (SELECT COUNT(*) FROM public.transactions WHERE user_id = _user_id),
    'achievement_count',(SELECT COUNT(*) FROM public.user_achievements WHERE user_id = _user_id AND is_unlocked = true)
  ) INTO result;
  RETURN result;
END; $$;

-- Network health view
CREATE OR REPLACE VIEW public.v_network_health AS
SELECT
  (SELECT COUNT(*) FROM public.node_installations WHERE is_online = true)     AS online_nodes,
  (SELECT COUNT(*) FROM public.node_installations)                             AS total_nodes,
  (SELECT COUNT(*) FROM public.network_validators WHERE is_active = true AND is_jailed = false) AS active_validators,
  (SELECT COALESCE(SUM(hash_rate),0) FROM public.node_installations WHERE is_online = true)    AS total_hash_rate,
  (SELECT COALESCE(SUM(amount),0) FROM public.validator_delegations WHERE status = 'active')   AS total_staked,
  (SELECT price FROM public.token_price ORDER BY updated_at DESC LIMIT 1)     AS gyds_price,
  (SELECT COUNT(*) FROM public.transactions WHERE created_at > now() - INTERVAL '24h') AS txs_24h;

-- Token leaderboard view
CREATE OR REPLACE VIEW public.v_token_leaderboard AS
SELECT t.id, t.name, t.symbol, t.logo_url, t.price_usd, t.market_cap_usd,
       t.volume_24h, t.price_change_24h, t.holder_count, t.network_type,
       t.is_verified, t.is_featured, t.created_at
FROM public.tokens t
WHERE t.is_active = true
ORDER BY t.market_cap_usd DESC;

-- Validator ranking view
CREATE OR REPLACE VIEW public.v_validator_rankings AS
SELECT v.id, v.address, v.name, v.logo_url, v.stake, v.commission, v.uptime,
       v.blocks_proposed, v.voting_power, v.is_jailed,
       COALESCE(d.delegator_count, 0) AS delegator_count,
       COALESCE(d.total_delegated, 0) AS total_delegated,
       RANK() OVER (ORDER BY v.stake DESC) AS rank
FROM public.network_validators v
LEFT JOIN (
  SELECT validator_id, COUNT(*) AS delegator_count, SUM(amount) AS total_delegated
  FROM public.validator_delegations WHERE status = 'active' GROUP BY validator_id
) d ON d.validator_id = v.id
WHERE v.is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- §27  SEED / DEFAULT DATA
-- ─────────────────────────────────────────────────────────────────────────────

-- Admin config defaults
INSERT INTO public.admin_config (config_key, config_value, is_public) VALUES
  ('network_settings',     '{"block_time":120,"min_share_interval":5,"max_shares_per_minute":12,"chain_id":13370}'::jsonb, true),
  ('token_economics',      '{"gyds_max_supply":100000000000,"gyd_collateral_ratio":1.0,"burn_rate":0.001,"halving_interval":2100000}'::jsonb, true),
  ('staking_config',       '{"min_delegation":100,"unbonding_period_days":21,"max_validators":100,"slash_rate":0.05}'::jsonb, true),
  ('launchpad_config',     '{"max_active_launches":50,"min_raise":1000,"platform_fee_percent":2.5}'::jsonb, true),
  ('faucet_config',        '{"cooldown_hours":24,"gyd_amount":100,"gyds_amount":0.5,"enabled":true}'::jsonb, true),
  ('bridge_config',        '{"enabled":false,"supported_chains":[],"min_bridge_amount":10}'::jsonb, false),
  ('governance_config',    '{"quorum_percent":10,"threshold_percent":50,"voting_period_hours":72,"execution_delay_hours":48}'::jsonb, true),
  ('kyc_config',           '{"required_for_rwa":true,"required_for_launch":false,"provider":"manual"}'::jsonb, false),
  ('fee_config',           '{"swap_fee_default":0.3,"bridge_fee_percent":0.1,"nft_royalty_max":50}'::jsonb, true),
  ('maintenance_mode',     '{"enabled":false,"message":""}'::jsonb, true)
ON CONFLICT (config_key) DO NOTHING;

-- Feature toggles
INSERT INTO public.feature_toggles (feature_key, is_enabled, description) VALUES
  ('defi_swap',          true,  'DEX swap interface'),
  ('defi_pools',         true,  'Liquidity pool management'),
  ('defi_staking',       true,  'Validator staking & delegation'),
  ('token_launchpad',    true,  'Token launchpad'),
  ('nft_marketplace',    false, 'NFT marketplace (coming soon)'),
  ('governance_dao',     false, 'On-chain governance voting (coming soon)'),
  ('yield_vaults',       false, 'Auto-compounding yield vaults (coming soon)'),
  ('cross_chain_bridge', false, 'Cross-chain bridge (coming soon)'),
  ('rwa_tokenization',   false, 'Real-world asset tokenization (coming soon)'),
  ('multisig_wallets',   false, 'Multi-signature wallets (coming soon)'),
  ('did_identity',       false, 'Decentralized identity (coming soon)'),
  ('insurance_protocol', false, 'Insurance & risk protocol (coming soon)'),
  ('order_book_dex',     false, 'Advanced order book DEX (coming soon)'),
  ('social_community',   false, 'Community forum & social features (coming soon)'),
  ('ai_trading_signals', false, 'AI-powered trading signals (coming soon)'),
  ('kyc_integration',    false, 'KYC verification integration (coming soon)'),
  ('oracle_network',     false, 'Decentralized oracle feeds (coming soon)'),
  ('faucet',             true,  'Testnet faucet')
ON CONFLICT (feature_key) DO NOTHING;

-- Default documentation
INSERT INTO public.documentation (slug, title, content, category) VALUES
  ('getting-started', 'Getting Started',
   '# Getting Started with GYDSchain\n\nWelcome to the GYDSchain network — a dual-coin blockchain with GYDS (gas) and GYD (stablecoin).\n\n## Quick Start\n1. Create an account\n2. Set up a wallet\n3. Install a node or delegate to a validator\n4. Claim test tokens from the faucet\n\n## Chain Information\n- **Chain ID:** 13370\n- **RPC:** https://rpc.netlifegy.com\n- **Explorer:** https://explorer.netlifegy.com',
   'guides'),
  ('blockchain-core', 'Blockchain Core',
   '# Blockchain Core\n\nHybrid PoS/PoW system built in Go.\n\n## Features\n- State management with LevelDB\n- Transaction pool with priority ordering\n- Block validation and chain reorganization\n- Dual-coin architecture: GYDS (gas) + GYD (stablecoin)',
   'technical'),
  ('dual-coin-system', 'Dual Coin System',
   '# Dual Coin System\n\n**GYDS** — Native gas and staking coin. Used for validator staking, block rewards, and network fees.\n\n**GYD** — Native stablecoin pegged 1:1 to USD. Used for everyday payments, DeFi, and commerce.\n\nNeither coin is an ERC-20 — both are native protocol coins.',
   'technical'),
  ('node-installation', 'Node Installation',
   '# Node Installation\n\n## Quick Install (Ubuntu 22.04)\n```bash\nsudo bash install-fullnode.sh   # Full node (founder only)\nbash install-litenode.sh         # Lite node\nbash install-localnode.sh        # Local network (no domain)\n```\n\n## Cloudflare Tunnel\nRun locally, then expose with:\n```bash\ncloudflared tunnel run --url http://localhost:80 gydschain\n```',
   'guides')
ON CONFLICT (slug) DO NOTHING;

-- Initial token price record
INSERT INTO public.token_price (price, total_supply, circulating_supply, burned_total)
VALUES (0.0000001, 100000000000, 0, 0)
ON CONFLICT DO NOTHING;

-- Default oracle feeds
INSERT INTO public.oracle_feeds (feed_id, description, value, provider) VALUES
  ('GYDS/USD', 'GYDSchain native coin price in USD', 0.0000001, 'internal'),
  ('GYD/USD',  'GYD stablecoin price in USD',        1.0,       'internal'),
  ('BTC/USD',  'Bitcoin price in USD (reference)',   65000.0,   'external'),
  ('ETH/USD',  'Ethereum price in USD (reference)',   3500.0,   'external')
ON CONFLICT (feed_id) DO NOTHING;

-- Default mining pool
INSERT INTO public.mining_pools (name, operator_id, fee_percent, min_payout, algorithm, pool_address)
SELECT 'GYDS Foundation Pool', NULL, 0.0, 0.001, 'randomx', '0x0000000000000000000000000000000000000000'
WHERE NOT EXISTS (SELECT 1 FROM public.mining_pools WHERE name = 'GYDS Foundation Pool');

-- ─────────────────────────────────────────────────────────────────────────────
-- §28  REALTIME SUBSCRIPTIONS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.node_installations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tokens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.token_operations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.token_launches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.liquidity_pools;
ALTER PUBLICATION supabase_realtime ADD TABLE public.governance_proposals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.network_validators;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.network_announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_security_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.oracle_feeds;

-- ═══════════════════════════════════════════════════════════════════════════
--  END OF SCHEMA
--  Tables: 68  |  Functions: 4  |  Views: 3  |  Indexes: 25+
--  Safe to run multiple times. Check supabase dashboard after applying.
-- ═══════════════════════════════════════════════════════════════════════════
