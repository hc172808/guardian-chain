-- ============================================================
-- Migration 0002 — Full schema sync
-- All tables created via raw psql after the initial drizzle
-- migrations. Apply with:
--   psql "$DATABASE_URL" < migrations/0002_full_schema_sync.sql
-- Safe to re-run (all CREATE TABLE uses IF NOT EXISTS).
-- ============================================================

-- ── API Keys ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    key_prefix text NOT NULL,
    key_hash text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    request_count integer DEFAULT 0 NOT NULL,
    request_limit integer DEFAULT 10000 NOT NULL,
    last_used_at timestamp without time zone,
    expires_at timestamp without time zone,
    revoked boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    PRIMARY KEY (id)
);

-- ── API Usage Logs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key_id uuid NOT NULL,
    user_id text NOT NULL,
    endpoint text NOT NULL,
    method text NOT NULL,
    status_code integer NOT NULL,
    latency_ms integer DEFAULT 0,
    logged_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS api_usage_key_ts ON public.api_usage_logs (key_id, logged_at DESC);

-- ── Bridge Transfers ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bridge_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    from_chain text NOT NULL,
    to_chain text NOT NULL,
    from_token text NOT NULL,
    to_token text NOT NULL,
    amount numeric NOT NULL,
    received numeric,
    fee numeric DEFAULT 0,
    status text DEFAULT 'pending',
    tx_hash text,
    dest_tx_hash text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

-- ── Buy Requests ─────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.buy_requests_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE TABLE IF NOT EXISTS public.buy_requests (
    id integer NOT NULL DEFAULT nextval('public.buy_requests_id_seq'::regclass),
    user_id text NOT NULL,
    payment_method_id integer,
    payment_method_name text NOT NULL,
    token_symbol text DEFAULT 'GYD' NOT NULL,
    token_amount numeric NOT NULL,
    fiat_amount numeric,
    fiat_currency text DEFAULT 'USD',
    status text DEFAULT 'pending',
    reference text NOT NULL,
    notes text,
    payment_method text,
    created_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    PRIMARY KEY (id),
    UNIQUE (reference)
);

-- ── DID Documents ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.did_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    did text NOT NULL,
    document jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (did),
    UNIQUE (user_id)
);

-- ── Governance Treasury ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.governance_treasury (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coin text NOT NULL,
    balance numeric DEFAULT 0 NOT NULL,
    usd_value numeric,
    address text,
    updated_at timestamp without time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (coin)
);

-- ── Insurance Pools ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.insurance_pools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    coverage_type text NOT NULL,
    description text,
    total_coverage numeric DEFAULT 0,
    total_staked numeric DEFAULT 0,
    premium_rate numeric DEFAULT 0.02,
    claim_period integer DEFAULT 30,
    min_coverage numeric DEFAULT 1000,
    max_coverage numeric DEFAULT 1000000,
    image_emoji text DEFAULT '🛡️',
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

-- ── Insurance Policies ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.insurance_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pool_id uuid REFERENCES public.insurance_pools(id) ON DELETE CASCADE,
    holder_id integer NOT NULL,
    coverage_amount numeric NOT NULL,
    premium_paid numeric NOT NULL,
    starts_at timestamp with time zone DEFAULT now(),
    ends_at timestamp with time zone NOT NULL,
    status text DEFAULT 'active',
    claim_reason text,
    claim_submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

-- ── KYC Records ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kyc_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    tier integer DEFAULT 0,
    status text DEFAULT 'none',
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (user_id)
);

-- ── Multi-Sig Wallets ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.multisig_wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    address text NOT NULL,
    threshold integer DEFAULT 2 NOT NULL,
    creator_id text NOT NULL,
    balance numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (address)
);

CREATE TABLE IF NOT EXISTS public.multisig_signers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_id uuid NOT NULL REFERENCES public.multisig_wallets(id) ON DELETE CASCADE,
    address text NOT NULL,
    name text,
    user_id text,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (wallet_id, address)
);

CREATE TABLE IF NOT EXISTS public.multisig_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_id uuid NOT NULL REFERENCES public.multisig_wallets(id) ON DELETE CASCADE,
    proposer_id text NOT NULL,
    to_address text NOT NULL,
    amount numeric NOT NULL,
    symbol text DEFAULT 'GYDS',
    description text,
    approvals integer DEFAULT 0,
    rejections integer DEFAULT 0,
    status text DEFAULT 'pending',
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.multisig_signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tx_id uuid NOT NULL REFERENCES public.multisig_transactions(id) ON DELETE CASCADE,
    signer_id text NOT NULL,
    action text NOT NULL,
    signed_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (tx_id, signer_id)
);

-- ── Network Snapshots ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.network_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    active_validators integer DEFAULT 0,
    active_nodes integer DEFAULT 0,
    total_transactions bigint DEFAULT 0,
    total_tokens integer DEFAULT 0,
    tps numeric DEFAULT 0,
    captured_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS network_snapshots_captured_idx ON public.network_snapshots (captured_at DESC);

-- ── NFT Collections & Tokens ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nft_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    symbol text,
    description text,
    floor_price numeric DEFAULT 0,
    volume_24h numeric DEFAULT 0,
    change_24h numeric DEFAULT 0,
    total_items integer DEFAULT 0,
    image_emoji text DEFAULT '🖼️',
    creator_address text,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.nft_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_id uuid REFERENCES public.nft_collections(id) ON DELETE CASCADE,
    name text NOT NULL,
    token_id integer NOT NULL,
    owner_address text DEFAULT '0x0000000000000000000000000000000000000000',
    price numeric DEFAULT 0,
    last_sale numeric DEFAULT 0,
    rarity text DEFAULT 'Common',
    image_emoji text DEFAULT '🖼️',
    listed boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    minted_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

-- ── Oracle Feeds & Submissions ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.oracle_feeds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feed_id text NOT NULL,
    description text,
    value numeric DEFAULT 0,
    decimals integer DEFAULT 8,
    provider text DEFAULT 'internal',
    active boolean DEFAULT true,
    last_updated timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (feed_id)
);

CREATE TABLE IF NOT EXISTS public.oracle_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feed_id text NOT NULL,
    submitter text NOT NULL,
    value numeric NOT NULL,
    block_height bigint,
    submitted_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS oracle_sub_feed_idx ON public.oracle_submissions (feed_id, submitted_at DESC);

-- ── Payment Methods ──────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.payment_methods_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id integer NOT NULL DEFAULT nextval('public.payment_methods_id_seq'::regclass),
    name text NOT NULL,
    type text NOT NULL,
    description text,
    instructions text,
    icon text,
    is_enabled boolean DEFAULT true,
    config_json text DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

-- ── Price History ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.price_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coin text NOT NULL,
    open numeric NOT NULL,
    close numeric NOT NULL,
    high numeric NOT NULL,
    low numeric NOT NULL,
    volume bigint DEFAULT 0,
    timestamp timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS price_history_coin_ts ON public.price_history (coin, timestamp DESC);

-- ── Referrals ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    code text NOT NULL,
    referred_count integer DEFAULT 0 NOT NULL,
    total_earned numeric DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (code),
    UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.referral_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_id text NOT NULL,
    referee_id text NOT NULL,
    reward_amount numeric DEFAULT 500 NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (referee_id)
);

-- ── Relations (social graph) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    follower_id text NOT NULL,
    following_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (follower_id, following_id)
);

-- ── RWA Assets & Holdings ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rwa_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    description text,
    total_value numeric DEFAULT 0,
    token_price numeric DEFAULT 1,
    tokens_available integer DEFAULT 0,
    total_tokens integer DEFAULT 1,
    apy numeric DEFAULT 0,
    currency text DEFAULT 'USDT',
    jurisdiction text,
    audited boolean DEFAULT false,
    maturity text,
    doc_cid text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.rwa_holdings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    asset_id uuid NOT NULL REFERENCES public.rwa_assets(id) ON DELETE CASCADE,
    tokens_held numeric DEFAULT 0,
    invested_amount numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (user_id, asset_id)
);

-- ── Social Verifications ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    platform text NOT NULL,
    handle text NOT NULL,
    challenge_code text NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    verified_at timestamp with time zone,
    PRIMARY KEY (id),
    UNIQUE (user_id, platform)
);

-- ── Trade History ────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.trade_history_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE TABLE IF NOT EXISTS public.trade_history (
    id integer NOT NULL DEFAULT nextval('public.trade_history_id_seq'::regclass),
    pair text DEFAULT 'GYDS/USDT' NOT NULL,
    price numeric(30,18) NOT NULL,
    amount numeric(30,6) NOT NULL,
    side text NOT NULL CHECK (side = ANY (ARRAY['buy', 'sell'])),
    taker_id text REFERENCES public.users(id) ON DELETE SET NULL,
    maker_id text REFERENCES public.users(id) ON DELETE SET NULL,
    executed_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_trade_hist_pair ON public.trade_history (pair, executed_at DESC);

-- ── Living Trusts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trusts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL,
    description text,
    status text DEFAULT 'draft' NOT NULL,
    fee_paid boolean DEFAULT false,
    setup_fee_tx text,
    trustee_address text,
    successor_trustee text,
    vault_balance numeric(20,8) DEFAULT 0,
    expires_at timestamp without time zone,
    activated_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.trust_beneficiaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trust_id uuid NOT NULL REFERENCES public.trusts(id) ON DELETE CASCADE,
    name text NOT NULL,
    wallet_address text NOT NULL,
    percentage numeric(5,2) NOT NULL,
    relationship text,
    condition_note text,
    created_at timestamp without time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.trust_conditions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trust_id uuid NOT NULL REFERENCES public.trusts(id) ON DELETE CASCADE,
    type text NOT NULL,
    description text NOT NULL,
    trigger_date timestamp without time zone,
    triggered boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.trust_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trust_id uuid NOT NULL REFERENCES public.trusts(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    amount numeric(20,8) NOT NULL,
    payment_type text NOT NULL,
    tx_hash text,
    created_at timestamp without time zone DEFAULT now(),
    PRIMARY KEY (id)
);

-- ── User Features (per-user feature flags) ───────────────────
CREATE TABLE IF NOT EXISTS public.user_features (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    feature_key text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    granted_by text NOT NULL,
    granted_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    PRIMARY KEY (id)
);

-- ── User Notifications ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    type text DEFAULT 'announcement' NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    read boolean DEFAULT false,
    dismissed boolean DEFAULT false,
    link text,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS notif_user_idx ON public.user_notifications (user_id, created_at DESC);

-- ── Voting Delegations ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voting_delegations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delegator_id integer NOT NULL,
    delegate_address text NOT NULL,
    delegate_username text,
    power_delegated integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone,
    PRIMARY KEY (id)
);

-- ── Wallet App Releases ──────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.wallet_releases_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE TABLE IF NOT EXISTS public.wallet_releases (
    id integer NOT NULL DEFAULT nextval('public.wallet_releases_id_seq'::regclass),
    platform text NOT NULL CHECK (platform = ANY (ARRAY['android', 'ios', 'windows', 'mac'])),
    version text NOT NULL,
    filename text NOT NULL,
    original_name text NOT NULL,
    file_size integer DEFAULT 0 NOT NULL,
    notes text DEFAULT '',
    download_count integer DEFAULT 0 NOT NULL,
    uploaded_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (id)
);

-- ── Webhook Endpoints & Deliveries ───────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    url text NOT NULL,
    secret text NOT NULL,
    events text[] DEFAULT ARRAY['tx.confirmed', 'block.new'],
    active boolean DEFAULT true,
    delivery_count integer DEFAULT 0,
    last_delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid NOT NULL,
    event text NOT NULL,
    payload jsonb,
    response_status integer,
    response_body text,
    duration_ms integer,
    success boolean DEFAULT false,
    attempted_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS wh_delivery_webhook_idx ON public.webhook_deliveries (webhook_id, attempted_at DESC);

-- ── Extra columns added post-migration ───────────────────────
-- totp_backup_codes column on users (added via raw ALTER TABLE)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT;

-- cashout_requests.payment_method column
ALTER TABLE public.cashout_requests ADD COLUMN IF NOT EXISTS payment_method TEXT;
