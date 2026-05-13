-- ============================================================
-- GYDSchain — Full Database Schema v2.1.0
-- Compatible with: PostgreSQL 14+ / Supabase
-- ============================================================
-- Run this file against your remote database to bootstrap all
-- tables, enums, functions, triggers, RLS policies, and storage.
--
-- IMPORTANT: This schema matches the PRODUCTION database exactly.
-- Column types, defaults, and RLS policies are verified against
-- the live environment as of 2026-03-08.
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ───────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('user', 'admin', 'founder');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Functions ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, role)
  VALUES (new.id, new.email, 'user');
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user');
  RETURN new;
END;
$$;

-- ─── Tables ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text,
  role       text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.admin_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key   text NOT NULL UNIQUE,
  config_value jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  user_email  text,
  action      text NOT NULL,
  category    text NOT NULL DEFAULT 'general',
  target_type text,
  target_id   text,
  details     jsonb DEFAULT '{}'::jsonb,
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address        text NOT NULL,
  encrypted_seed text NOT NULL,
  pin_hash       text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  from_address text NOT NULL,
  to_address   text NOT NULL,
  amount       numeric NOT NULL,
  fee          numeric NOT NULL DEFAULT 0.001,
  tx_hash      text,
  status       text NOT NULL DEFAULT 'pending',
  block_height bigint,
  confirmed_at timestamptz,
  wallet_id    uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.token_price (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price              numeric NOT NULL DEFAULT 0.0000001,
  total_supply       numeric NOT NULL DEFAULT 100000000000,
  circulating_supply numeric NOT NULL DEFAULT 0,
  burned_total       numeric NOT NULL DEFAULT 0,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.token_operations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL,
  amount         numeric NOT NULL,
  wallet_address text NOT NULL,
  usdt_amount    numeric DEFAULT 0,
  tx_hash        text,
  status         text NOT NULL DEFAULT 'pending',
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  symbol         text NOT NULL,
  address        text NOT NULL,
  total_supply   numeric NOT NULL,
  burned_supply  numeric NOT NULL DEFAULT 0,
  decimals       integer NOT NULL DEFAULT 18,
  creator_id     uuid NOT NULL,
  logo_url       text,
  is_active      boolean NOT NULL DEFAULT true,
  mint_enabled   boolean NOT NULL DEFAULT false,
  mint_holder    text,
  mint_locked    boolean NOT NULL DEFAULT false,
  freeze_enabled boolean NOT NULL DEFAULT false,
  freeze_holder  text,
  freeze_locked  boolean NOT NULL DEFAULT false,
  update_enabled boolean NOT NULL DEFAULT false,
  update_holder  text,
  update_locked  boolean NOT NULL DEFAULT false,
  lp_lock_type   text NOT NULL DEFAULT 'burned',
  lp_unlock_time timestamptz,
  gyds_liquidity numeric NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.token_launches (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id             uuid NOT NULL,
  token_id               uuid REFERENCES public.tokens(id) ON DELETE SET NULL,
  name                   text NOT NULL,
  symbol                 text NOT NULL,
  description            text,
  logo_url               text,
  initial_price          numeric NOT NULL DEFAULT 0.001,
  max_price              numeric,
  target_raise           numeric NOT NULL DEFAULT 0,
  raised_amount          numeric NOT NULL DEFAULT 0,
  participants           integer NOT NULL DEFAULT 0,
  bonding_curve_type     text NOT NULL DEFAULT 'linear',
  bonding_curve_steepness numeric NOT NULL DEFAULT 1.0,
  status                 text NOT NULL DEFAULT 'pending',
  is_premier             boolean NOT NULL DEFAULT false,
  starts_at              timestamptz,
  ends_at                timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.token_price_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  token_id     uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  target_price numeric NOT NULL,
  direction    text NOT NULL DEFAULT 'above',
  is_triggered boolean NOT NULL DEFAULT false,
  triggered_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.token_watchlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  token_id   uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token_id)
);

CREATE TABLE IF NOT EXISTS public.network_validators (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text,
  address          text NOT NULL UNIQUE,
  stake            numeric NOT NULL DEFAULT 0,
  commission       integer NOT NULL DEFAULT 10,
  uptime           numeric NOT NULL DEFAULT 100.00,
  blocks_proposed  bigint NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  is_jailed        boolean NOT NULL DEFAULT false,
  last_vote_height bigint NOT NULL DEFAULT 0,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.validator_delegations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  validator_id   uuid NOT NULL REFERENCES public.network_validators(id) ON DELETE CASCADE,
  amount         numeric NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'active',
  delegated_at   timestamptz NOT NULL DEFAULT now(),
  undelegated_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.liquidity_pools (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      uuid NOT NULL,
  token_a_symbol  text NOT NULL,
  token_b_symbol  text NOT NULL,
  token_a_address text,
  token_b_address text,
  tvl             numeric NOT NULL DEFAULT 0,
  volume_24h      numeric NOT NULL DEFAULT 0,
  fees_24h        numeric NOT NULL DEFAULT 0,
  apr             numeric NOT NULL DEFAULT 0,
  fee_tier        numeric NOT NULL DEFAULT 0.3,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.node_installations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL,
  node_type            text NOT NULL,
  is_approved          boolean DEFAULT false,
  approved_by          uuid,
  approved_at          timestamptz,
  is_online            boolean DEFAULT false,
  is_synced            boolean DEFAULT false,
  last_heartbeat       timestamptz,
  last_sync_at         timestamptz,
  last_block_height    bigint DEFAULT 0,
  blocks_synced        bigint DEFAULT 0,
  sync_progress        integer DEFAULT 0,
  peer_count           integer DEFAULT 0,
  uptime_seconds       bigint DEFAULT 0,
  hash_rate            bigint DEFAULT 0,
  valid_shares         bigint DEFAULT 0,
  total_rewards        numeric DEFAULT 0,
  error_count          integer DEFAULT 0,
  connection_quality   integer DEFAULT 100,
  wireguard_public_key text,
  wireguard_private_key text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documentation (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  slug       text NOT NULL UNIQUE,
  content    text NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.firewall_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type   text NOT NULL DEFAULT 'ufw',
  action      text NOT NULL DEFAULT 'allow',
  direction   text NOT NULL DEFAULT 'in',
  protocol    text NOT NULL DEFAULT 'tcp',
  port        text,
  ip_address  text,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ip_access_list (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  list_type  text NOT NULL DEFAULT 'whitelist',
  reason     text,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ddos_protection (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  protection_type text NOT NULL DEFAULT 'syn_flood',
  threshold       integer NOT NULL DEFAULT 1000,
  action          text NOT NULL DEFAULT 'drop',
  is_enabled      boolean NOT NULL DEFAULT true,
  description     text,
  parameters      jsonb DEFAULT '{}'::jsonb,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rate_limit_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  endpoint            text NOT NULL,
  requests_per_window integer NOT NULL DEFAULT 100,
  window_seconds      integer NOT NULL DEFAULT 60,
  burst_limit         integer NOT NULL DEFAULT 20,
  action              text NOT NULL DEFAULT 'throttle',
  is_enabled          boolean NOT NULL DEFAULT true,
  description         text,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fail2ban_jails (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jail_name   text NOT NULL UNIQUE,
  max_retries integer NOT NULL DEFAULT 5,
  ban_time    integer NOT NULL DEFAULT 3600,
  find_time   integer NOT NULL DEFAULT 600,
  is_enabled  boolean NOT NULL DEFAULT true,
  description text,
  filter_name text,
  log_path    text,
  action      text DEFAULT 'iptables-multiport',
  banned_ips  text[] DEFAULT '{}'::text[],
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Triggers ────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_role_created ON auth.users;
CREATE TRIGGER on_auth_user_role_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- updated_at triggers helper
CREATE OR REPLACE FUNCTION _create_updated_at_trigger(_table text) RETURNS void AS $$
BEGIN
  EXECUTE format('
    DROP TRIGGER IF EXISTS set_updated_at ON public.%I;
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  ', _table, _table);
END;
$$ LANGUAGE plpgsql;

SELECT _create_updated_at_trigger('profiles');
SELECT _create_updated_at_trigger('admin_config');
SELECT _create_updated_at_trigger('tokens');
SELECT _create_updated_at_trigger('token_launches');
SELECT _create_updated_at_trigger('network_validators');
SELECT _create_updated_at_trigger('liquidity_pools');
SELECT _create_updated_at_trigger('firewall_rules');
SELECT _create_updated_at_trigger('ddos_protection');
SELECT _create_updated_at_trigger('rate_limit_rules');
SELECT _create_updated_at_trigger('fail2ban_jails');
SELECT _create_updated_at_trigger('documentation');
SELECT _create_updated_at_trigger('token_price');

DROP FUNCTION _create_updated_at_trigger(text);

-- ─── Row Level Security ──────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_validators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validator_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidity_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firewall_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_access_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ddos_protection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fail2ban_jails ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ────────────────────────────────────────
-- NOTE: Uses RESTRICTIVE policies (Permissive: No) to match production.
-- Founder OR admin pattern used consistently for management policies.

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- User Roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Admin Config
CREATE POLICY "Public can read public config" ON public.admin_config FOR SELECT TO authenticated
  USING (config_key !~~ 'secret_%');
CREATE POLICY "Founders can manage admin config" ON public.admin_config FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder'));

-- Audit Logs
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Wallets (NO update policy — users cannot update wallet records directly)
CREATE POLICY "Users can view own wallets" ON public.wallets FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can create wallets" ON public.wallets FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own wallets" ON public.wallets FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Transactions (NO update/delete — immutable ledger)
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can create transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all transactions" ON public.transactions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Token Price (public read, founder-only write)
CREATE POLICY "Anyone can view token price" ON public.token_price FOR SELECT USING (true);
CREATE POLICY "Only founders can update price" ON public.token_price FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'founder'));

-- Token Operations
CREATE POLICY "Users can view confirmed operations" ON public.token_operations FOR SELECT TO authenticated
  USING (status = 'confirmed');
CREATE POLICY "Admins can manage token operations" ON public.token_operations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Tokens
CREATE POLICY "Anyone can view active tokens" ON public.tokens FOR SELECT USING (is_active = true);
CREATE POLICY "Users can create tokens" ON public.tokens FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
CREATE POLICY "Creators can update own tokens" ON public.tokens FOR UPDATE TO authenticated USING (creator_id = auth.uid());
CREATE POLICY "Admins can manage all tokens" ON public.tokens FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Token Launches
CREATE POLICY "Anyone can view approved launches" ON public.token_launches FOR SELECT
  USING (status = ANY (ARRAY['live', 'upcoming', 'completed']));
CREATE POLICY "Creators can insert launches" ON public.token_launches FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());
CREATE POLICY "Creators can update own launches" ON public.token_launches FOR UPDATE TO authenticated
  USING (creator_id = auth.uid());
CREATE POLICY "Admins can manage all launches" ON public.token_launches FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Token Price Alerts
CREATE POLICY "Users can view own alerts" ON public.token_price_alerts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can create alerts" ON public.token_price_alerts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own alerts" ON public.token_price_alerts FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own alerts" ON public.token_price_alerts FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Token Watchlist
CREATE POLICY "Users can view own watchlist" ON public.token_watchlist FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can add to watchlist" ON public.token_watchlist FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can remove from watchlist" ON public.token_watchlist FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Network Validators
CREATE POLICY "Anyone can view validators" ON public.network_validators FOR SELECT USING (true);
CREATE POLICY "Admins can manage validators" ON public.network_validators FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Validator Delegations
CREATE POLICY "Users can view own delegations" ON public.validator_delegations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Anyone can view delegation counts" ON public.validator_delegations FOR SELECT USING (true);
CREATE POLICY "Users can create delegations" ON public.validator_delegations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own delegations" ON public.validator_delegations FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all delegations" ON public.validator_delegations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Liquidity Pools
CREATE POLICY "Anyone can view active pools" ON public.liquidity_pools FOR SELECT USING (is_active = true);
CREATE POLICY "Authenticated users can create pools" ON public.liquidity_pools FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid());
CREATE POLICY "Creators can update own pools" ON public.liquidity_pools FOR UPDATE TO authenticated
  USING (creator_id = auth.uid());
CREATE POLICY "Admins can manage all pools" ON public.liquidity_pools FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Node Installations
CREATE POLICY "Users can view own nodes" ON public.node_installations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own nodes" ON public.node_installations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own nodes" ON public.node_installations FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own nodes" ON public.node_installations FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can view all nodes" ON public.node_installations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all nodes" ON public.node_installations FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete nodes" ON public.node_installations FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Documentation
CREATE POLICY "Anyone can view documentation" ON public.documentation FOR SELECT USING (true);
CREATE POLICY "Admins can insert documentation" ON public.documentation FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update documentation" ON public.documentation FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Firewall Rules
CREATE POLICY "Anyone can view firewall rules" ON public.firewall_rules FOR SELECT USING (true);
CREATE POLICY "Admins can manage firewall rules" ON public.firewall_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- IP Access List
CREATE POLICY "Anyone can view IP access list" ON public.ip_access_list FOR SELECT USING (true);
CREATE POLICY "Admins can manage IP access list" ON public.ip_access_list FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- DDoS Protection
CREATE POLICY "Anyone can view DDoS protection" ON public.ddos_protection FOR SELECT USING (true);
CREATE POLICY "Admins can manage DDoS protection" ON public.ddos_protection FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Rate Limit Rules
CREATE POLICY "Anyone can view rate limit rules" ON public.rate_limit_rules FOR SELECT USING (true);
CREATE POLICY "Admins can manage rate limit rules" ON public.rate_limit_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Fail2Ban Jails
CREATE POLICY "Anyone can view fail2ban jails" ON public.fail2ban_jails FOR SELECT USING (true);
CREATE POLICY "Admins can manage fail2ban jails" ON public.fail2ban_jails FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- ─── Storage Buckets ─────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('token-logos', 'token-logos', true)
ON CONFLICT (id) DO NOTHING;

-- ─── Seed Data ───────────────────────────────────────────

INSERT INTO public.token_price (price, total_supply, circulating_supply, burned_total)
SELECT 0.0000001, 100000000000, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.token_price LIMIT 1);

-- ============================================================
-- Schema v2.1.0 — GYDSchain database is ready.
-- ============================================================
