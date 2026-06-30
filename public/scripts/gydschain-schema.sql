--
-- PostgreSQL database dump
--


-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'user',
    'admin',
    'founder'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievements (
    id text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    xp_reward integer DEFAULT 0 NOT NULL,
    icon text DEFAULT '🏆'::text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL
);


--
-- Name: admin_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_key text NOT NULL,
    config_value jsonb NOT NULL,
    updated_by text,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
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
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: api_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key_id uuid NOT NULL,
    user_id text NOT NULL,
    endpoint text NOT NULL,
    method text NOT NULL,
    status_code integer NOT NULL,
    latency_ms integer DEFAULT 0,
    logged_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    user_email text,
    action text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    target_type text,
    target_id text,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: bridge_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bridge_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    from_chain text NOT NULL,
    to_chain text NOT NULL,
    from_token text NOT NULL,
    to_token text NOT NULL,
    amount numeric NOT NULL,
    received numeric,
    fee numeric DEFAULT 0,
    status text DEFAULT 'pending'::text,
    tx_hash text,
    dest_tx_hash text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: buy_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buy_requests (
    id integer NOT NULL,
    user_id text NOT NULL,
    payment_method_id integer,
    payment_method_name text NOT NULL,
    token_symbol text DEFAULT 'GYD'::text NOT NULL,
    token_amount numeric NOT NULL,
    fiat_amount numeric,
    fiat_currency text DEFAULT 'USD'::text,
    status text DEFAULT 'pending'::text,
    reference text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone
);


--
-- Name: buy_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.buy_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: buy_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.buy_requests_id_seq OWNED BY public.buy_requests.id;


--
-- Name: cashout_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashout_requests (
    id integer NOT NULL,
    user_id text NOT NULL,
    asset text DEFAULT 'GYDS'::text NOT NULL,
    amount numeric NOT NULL,
    destination text NOT NULL,
    note text,
    reference text NOT NULL,
    payment_method text DEFAULT ''::text,
    status text DEFAULT 'pending'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone
);


--
-- Name: cashout_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cashout_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cashout_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cashout_requests_id_seq OWNED BY public.cashout_requests.id;


--
-- Name: community_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id text NOT NULL,
    body text NOT NULL,
    upvotes integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: community_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    post_type text DEFAULT 'discussion'::text NOT NULL,
    upvotes integer DEFAULT 0 NOT NULL,
    downvotes integer DEFAULT 0 NOT NULL,
    reply_count integer DEFAULT 0 NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: community_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    target_id uuid NOT NULL,
    target_type text NOT NULL,
    direction text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: ddos_protection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ddos_protection (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    protection_type text DEFAULT 'syn_flood'::text NOT NULL,
    threshold integer DEFAULT 1000 NOT NULL,
    action text DEFAULT 'drop'::text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    parameters jsonb DEFAULT '{}'::jsonb,
    description text,
    created_by text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: did_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.did_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    did text NOT NULL,
    document jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: documentation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    updated_by text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: fail2ban_jails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fail2ban_jails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jail_name text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    max_retries integer DEFAULT 5 NOT NULL,
    ban_time integer DEFAULT 3600 NOT NULL,
    find_time integer DEFAULT 600 NOT NULL,
    log_path text,
    filter_name text,
    action text DEFAULT 'iptables-multiport'::text,
    description text,
    banned_ips text[] DEFAULT '{}'::text[],
    created_by text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: faucet_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faucet_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    wallet_address text NOT NULL,
    token_type text NOT NULL,
    amount numeric NOT NULL,
    tx_hash text,
    ip_address text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: firewall_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firewall_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_type text DEFAULT 'ufw'::text NOT NULL,
    action text DEFAULT 'allow'::text NOT NULL,
    protocol text DEFAULT 'tcp'::text NOT NULL,
    port text,
    ip_address text,
    direction text DEFAULT 'in'::text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: governance_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    proposal_type text DEFAULT 'parameter'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    votes_for numeric DEFAULT '0'::numeric NOT NULL,
    votes_against numeric DEFAULT '0'::numeric NOT NULL,
    votes_abstain numeric DEFAULT '0'::numeric NOT NULL,
    quorum_required numeric DEFAULT '1000000'::numeric NOT NULL,
    created_by text NOT NULL,
    end_date timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: governance_treasury; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_treasury (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coin text NOT NULL,
    balance numeric DEFAULT 0 NOT NULL,
    usd_value numeric,
    address text,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: governance_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposal_id uuid NOT NULL,
    user_id text NOT NULL,
    choice text NOT NULL,
    voting_power numeric DEFAULT '1'::numeric NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: insurance_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pool_id uuid,
    holder_id integer NOT NULL,
    coverage_amount numeric NOT NULL,
    premium_paid numeric NOT NULL,
    starts_at timestamp with time zone DEFAULT now(),
    ends_at timestamp with time zone NOT NULL,
    status text DEFAULT 'active'::text,
    claim_reason text,
    claim_submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: insurance_pools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_pools (
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
    image_emoji text DEFAULT '🛡️'::text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ip_access_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ip_access_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_address text NOT NULL,
    list_type text DEFAULT 'whitelist'::text NOT NULL,
    reason text,
    expires_at timestamp without time zone,
    created_by text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: kyc_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kyc_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    tier integer DEFAULT 0,
    status text DEFAULT 'none'::text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: liquidity_pools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liquidity_pools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id text NOT NULL,
    token_a_symbol text NOT NULL,
    token_b_symbol text NOT NULL,
    token_a_address text,
    token_b_address text,
    fee_tier numeric DEFAULT 0.3 NOT NULL,
    tvl numeric DEFAULT '0'::numeric NOT NULL,
    volume_24h numeric DEFAULT '0'::numeric NOT NULL,
    fees_24h numeric DEFAULT '0'::numeric NOT NULL,
    apr numeric DEFAULT '0'::numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: multisig_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.multisig_signatures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tx_id uuid NOT NULL,
    signer_id text NOT NULL,
    action text NOT NULL,
    signed_at timestamp with time zone DEFAULT now()
);


--
-- Name: multisig_signers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.multisig_signers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_id uuid NOT NULL,
    address text NOT NULL,
    name text,
    user_id text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: multisig_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.multisig_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_id uuid NOT NULL,
    proposer_id text NOT NULL,
    to_address text NOT NULL,
    amount numeric NOT NULL,
    symbol text DEFAULT 'GYDS'::text,
    description text,
    approvals integer DEFAULT 0,
    rejections integer DEFAULT 0,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: multisig_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.multisig_wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    address text NOT NULL,
    threshold integer DEFAULT 2 NOT NULL,
    creator_id text NOT NULL,
    balance numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: network_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.network_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    active_validators integer DEFAULT 0,
    active_nodes integer DEFAULT 0,
    total_transactions bigint DEFAULT 0,
    total_tokens integer DEFAULT 0,
    tps numeric DEFAULT 0,
    captured_at timestamp with time zone DEFAULT now()
);


--
-- Name: network_validators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.network_validators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    address text NOT NULL,
    name text,
    stake numeric DEFAULT '0'::numeric NOT NULL,
    commission integer DEFAULT 10 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_jailed boolean DEFAULT false NOT NULL,
    uptime numeric DEFAULT 100.00 NOT NULL,
    blocks_proposed bigint DEFAULT 0 NOT NULL,
    last_vote_height bigint DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by text
);


--
-- Name: nft_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nft_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    symbol text,
    description text,
    floor_price numeric DEFAULT 0,
    volume_24h numeric DEFAULT 0,
    change_24h numeric DEFAULT 0,
    total_items integer DEFAULT 0,
    image_emoji text DEFAULT '🖼️'::text,
    creator_address text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: nft_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nft_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_id uuid,
    name text NOT NULL,
    token_id integer NOT NULL,
    owner_address text DEFAULT '0x0000000000000000000000000000000000000000'::text,
    price numeric DEFAULT 0,
    last_sale numeric DEFAULT 0,
    rarity text DEFAULT 'Common'::text,
    image_emoji text DEFAULT '🖼️'::text,
    listed boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    minted_at timestamp with time zone DEFAULT now()
);


--
-- Name: node_installations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_installations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    node_type text NOT NULL,
    ip_address text,
    hostname text,
    rpc_port integer DEFAULT 8545,
    wireguard_public_key text,
    wireguard_private_key text,
    is_synced boolean DEFAULT false,
    last_sync_at timestamp without time zone,
    is_approved boolean DEFAULT false,
    approved_by text,
    approved_at timestamp without time zone,
    is_online boolean DEFAULT false,
    last_heartbeat timestamp without time zone,
    hash_rate bigint DEFAULT 0,
    valid_shares bigint DEFAULT 0,
    total_rewards numeric DEFAULT '0'::numeric,
    uptime_seconds bigint DEFAULT 0,
    connection_quality integer DEFAULT 100,
    sync_progress integer DEFAULT 0,
    blocks_synced bigint DEFAULT 0,
    last_block_height bigint DEFAULT 0,
    error_count integer DEFAULT 0,
    peer_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: oracle_feeds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oracle_feeds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feed_id text NOT NULL,
    description text,
    value numeric DEFAULT 0,
    decimals integer DEFAULT 8,
    provider text DEFAULT 'internal'::text,
    active boolean DEFAULT true,
    last_updated timestamp with time zone DEFAULT now()
);


--
-- Name: oracle_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oracle_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feed_id text NOT NULL,
    submitter text NOT NULL,
    value numeric NOT NULL,
    block_height bigint,
    submitted_at timestamp with time zone DEFAULT now()
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    side text NOT NULL,
    order_type text NOT NULL,
    price numeric,
    stop_price numeric,
    amount numeric NOT NULL,
    filled numeric DEFAULT '0'::numeric NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_methods (
    id integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    description text,
    instructions text,
    icon text,
    is_enabled boolean DEFAULT true,
    config_json text DEFAULT '{}'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: payment_methods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_methods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_methods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_methods_id_seq OWNED BY public.payment_methods.id;


--
-- Name: price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coin text NOT NULL,
    open numeric NOT NULL,
    close numeric NOT NULL,
    high numeric NOT NULL,
    low numeric NOT NULL,
    volume bigint DEFAULT 0,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    email text,
    role text DEFAULT 'user'::text NOT NULL,
    display_name text,
    username text,
    bio text,
    avatar_url text,
    locale text DEFAULT 'en'::text,
    timezone text DEFAULT 'UTC'::text,
    notification_prefs jsonb,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: rate_limit_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    endpoint text NOT NULL,
    requests_per_window integer DEFAULT 100 NOT NULL,
    window_seconds integer DEFAULT 60 NOT NULL,
    burst_limit integer DEFAULT 20 NOT NULL,
    action text DEFAULT 'throttle'::text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    description text,
    created_by text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: referral_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_id text NOT NULL,
    referee_id text NOT NULL,
    reward_amount numeric DEFAULT 500 NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    code text NOT NULL,
    referred_count integer DEFAULT 0 NOT NULL,
    total_earned numeric DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: rwa_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rwa_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    description text,
    total_value numeric DEFAULT 0,
    token_price numeric DEFAULT 1,
    tokens_available integer DEFAULT 0,
    total_tokens integer DEFAULT 1,
    apy numeric DEFAULT 0,
    currency text DEFAULT 'USDT'::text,
    jurisdiction text,
    audited boolean DEFAULT false,
    maturity text,
    doc_cid text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: rwa_holdings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rwa_holdings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    asset_id uuid NOT NULL,
    tokens_held numeric DEFAULT 0,
    invested_amount numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: social_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    platform text NOT NULL,
    handle text NOT NULL,
    challenge_code text NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    verified_at timestamp with time zone
);


--
-- Name: token_launches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_launches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id text NOT NULL,
    token_id uuid,
    name text NOT NULL,
    symbol text NOT NULL,
    description text,
    logo_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    target_raise numeric DEFAULT '0'::numeric NOT NULL,
    raised_amount numeric DEFAULT '0'::numeric NOT NULL,
    participants integer DEFAULT 0 NOT NULL,
    bonding_curve_type text DEFAULT 'linear'::text NOT NULL,
    bonding_curve_steepness numeric DEFAULT 1.0 NOT NULL,
    initial_price numeric DEFAULT 0.001 NOT NULL,
    max_price numeric,
    is_premier boolean DEFAULT false NOT NULL,
    starts_at timestamp without time zone,
    ends_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    is_visible boolean DEFAULT true
);


--
-- Name: token_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operation_type text NOT NULL,
    amount numeric NOT NULL,
    usdt_amount numeric DEFAULT '0'::numeric,
    wallet_address text NOT NULL,
    tx_hash text,
    created_by text,
    created_at timestamp without time zone DEFAULT now(),
    status text DEFAULT 'pending'::text NOT NULL
);


--
-- Name: token_price; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_price (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    price numeric DEFAULT 0.0000001 NOT NULL,
    total_supply numeric DEFAULT '100000000000'::numeric NOT NULL,
    circulating_supply numeric DEFAULT '0'::numeric NOT NULL,
    burned_total numeric DEFAULT '0'::numeric NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: token_price_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_price_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    token_id uuid NOT NULL,
    target_price numeric NOT NULL,
    direction text DEFAULT 'above'::text NOT NULL,
    is_triggered boolean DEFAULT false NOT NULL,
    triggered_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: token_watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_watchlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    token_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id text NOT NULL,
    name text NOT NULL,
    symbol text NOT NULL,
    decimals integer DEFAULT 18 NOT NULL,
    total_supply numeric NOT NULL,
    burned_supply numeric DEFAULT '0'::numeric NOT NULL,
    gyds_liquidity numeric DEFAULT '0'::numeric NOT NULL,
    logo_url text,
    lp_lock_type text DEFAULT 'burned'::text NOT NULL,
    lp_unlock_time timestamp without time zone,
    freeze_enabled boolean DEFAULT false NOT NULL,
    freeze_holder text,
    freeze_locked boolean DEFAULT false NOT NULL,
    update_enabled boolean DEFAULT false NOT NULL,
    update_holder text,
    update_locked boolean DEFAULT false NOT NULL,
    mint_enabled boolean DEFAULT false NOT NULL,
    mint_holder text,
    mint_locked boolean DEFAULT false NOT NULL,
    address text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    network_type text DEFAULT 'devnet'::text NOT NULL,
    mainnet_promoted_at timestamp without time zone,
    market_cap_usd numeric DEFAULT '0'::numeric NOT NULL,
    extra_authorities jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: trade_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_history (
    id integer NOT NULL,
    pair text DEFAULT 'GYDS/USDT'::text NOT NULL,
    price numeric(30,18) NOT NULL,
    amount numeric(30,6) NOT NULL,
    side text NOT NULL,
    taker_id text,
    maker_id text,
    executed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trade_history_side_check CHECK ((side = ANY (ARRAY['buy'::text, 'sell'::text])))
);


--
-- Name: trade_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trade_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trade_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trade_history_id_seq OWNED BY public.trade_history.id;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_address text NOT NULL,
    to_address text NOT NULL,
    amount numeric NOT NULL,
    fee numeric DEFAULT 0.001 NOT NULL,
    tx_hash text,
    status text DEFAULT 'pending'::text NOT NULL,
    block_height bigint,
    wallet_id uuid,
    user_id text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    confirmed_at timestamp without time zone,
    token_symbol text DEFAULT 'GYD'::text NOT NULL
);


--
-- Name: trust_beneficiaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trust_beneficiaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trust_id uuid NOT NULL,
    name text NOT NULL,
    wallet_address text NOT NULL,
    percentage numeric(5,2) NOT NULL,
    relationship text,
    condition_note text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: trust_conditions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trust_conditions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trust_id uuid NOT NULL,
    type text NOT NULL,
    description text NOT NULL,
    trigger_date timestamp without time zone,
    triggered boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: trust_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trust_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trust_id uuid NOT NULL,
    user_id text NOT NULL,
    amount numeric(20,8) NOT NULL,
    payment_type text NOT NULL,
    tx_hash text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: trusts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trusts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    fee_paid boolean DEFAULT false,
    setup_fee_tx text,
    trustee_address text,
    successor_trustee text,
    vault_balance numeric(20,8) DEFAULT 0,
    expires_at timestamp without time zone,
    activated_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    achievement_id text NOT NULL,
    unlocked_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_features (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    feature_key text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    granted_by text NOT NULL,
    granted_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    type text DEFAULT 'announcement'::text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    read boolean DEFAULT false,
    dismissed boolean DEFAULT false,
    link text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    role public.app_role DEFAULT 'user'::public.app_role NOT NULL
);


--
-- Name: user_stablecoins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_stablecoins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id text NOT NULL,
    name text NOT NULL,
    symbol text NOT NULL,
    decimals integer DEFAULT 18 NOT NULL,
    description text,
    logo_url text,
    peg_type text DEFAULT 'usd'::text NOT NULL,
    peg_value numeric DEFAULT 1.00 NOT NULL,
    basket_weights jsonb DEFAULT '[]'::jsonb,
    collateral_type text DEFAULT 'over_collateralized'::text NOT NULL,
    collateral_ratio numeric DEFAULT '150'::numeric NOT NULL,
    liquidation_threshold numeric DEFAULT '120'::numeric NOT NULL,
    reserve_assets jsonb DEFAULT '["GYD", "GYDS"]'::jsonb NOT NULL,
    stability_fee numeric DEFAULT 2.50 NOT NULL,
    minting_fee numeric DEFAULT 0.50 NOT NULL,
    burn_fee numeric DEFAULT 0.10 NOT NULL,
    total_supply numeric DEFAULT '0'::numeric NOT NULL,
    circulating_supply numeric DEFAULT '0'::numeric NOT NULL,
    total_collateral_usd numeric DEFAULT '0'::numeric NOT NULL,
    website_url text,
    twitter_url text,
    address text,
    status text DEFAULT 'pending_review'::text NOT NULL,
    is_approved boolean DEFAULT false NOT NULL,
    approved_by text,
    approved_at timestamp without time zone,
    paused_reason text,
    creation_fee_paid numeric DEFAULT '0'::numeric NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_xp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_xp (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    total_xp integer DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text,
    username text,
    password_hash text,
    wallet_address text,
    auth_nonce text,
    first_name text,
    last_name text,
    profile_image_url text,
    totp_secret text,
    totp_enabled boolean DEFAULT false,
    is_banned boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: validator_delegations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.validator_delegations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    validator_id uuid NOT NULL,
    amount numeric DEFAULT '0'::numeric NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    delegated_at timestamp without time zone DEFAULT now(),
    undelegated_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: vault_positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vault_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    vault_id text NOT NULL,
    vault_name text NOT NULL,
    token text NOT NULL,
    amount numeric NOT NULL,
    apy numeric NOT NULL,
    auto_compound boolean DEFAULT true NOT NULL,
    lock_days integer,
    locked_until timestamp without time zone,
    status text DEFAULT 'active'::text NOT NULL,
    deposited_at timestamp without time zone DEFAULT now(),
    withdrawn_at timestamp without time zone
);


--
-- Name: voting_delegations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voting_delegations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delegator_id integer NOT NULL,
    delegate_address text NOT NULL,
    delegate_username text,
    power_delegated integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone
);


--
-- Name: wallet_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_releases (
    id integer NOT NULL,
    platform text NOT NULL,
    version text NOT NULL,
    filename text NOT NULL,
    original_name text NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    notes text,
    download_count integer DEFAULT 0 NOT NULL,
    uploaded_by text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT wallet_releases_platform_check CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text, 'windows'::text, 'macos'::text])))
);


--
-- Name: wallet_releases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_releases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_releases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallet_releases_id_seq OWNED BY public.wallet_releases.id;


--
-- Name: wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    address text NOT NULL,
    encrypted_seed text DEFAULT ''::text NOT NULL,
    pin_hash text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid NOT NULL,
    event text NOT NULL,
    payload jsonb,
    response_status integer,
    response_body text,
    duration_ms integer,
    success boolean DEFAULT false,
    attempted_at timestamp with time zone DEFAULT now()
);


--
-- Name: webhook_endpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_endpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    url text NOT NULL,
    secret text NOT NULL,
    events text[] DEFAULT ARRAY['tx.confirmed'::text, 'block.new'::text],
    active boolean DEFAULT true,
    delivery_count integer DEFAULT 0,
    last_delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: xp_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xp_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    event_type text NOT NULL,
    xp_awarded integer NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: buy_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_requests ALTER COLUMN id SET DEFAULT nextval('public.buy_requests_id_seq'::regclass);


--
-- Name: cashout_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashout_requests ALTER COLUMN id SET DEFAULT nextval('public.cashout_requests_id_seq'::regclass);


--
-- Name: payment_methods id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods ALTER COLUMN id SET DEFAULT nextval('public.payment_methods_id_seq'::regclass);


--
-- Name: trade_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_history ALTER COLUMN id SET DEFAULT nextval('public.trade_history_id_seq'::regclass);


--
-- Name: wallet_releases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_releases ALTER COLUMN id SET DEFAULT nextval('public.wallet_releases_id_seq'::regclass);


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- Name: admin_config admin_config_config_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_config
    ADD CONSTRAINT admin_config_config_key_unique UNIQUE (config_key);


--
-- Name: admin_config admin_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_config
    ADD CONSTRAINT admin_config_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: api_usage_logs api_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_usage_logs
    ADD CONSTRAINT api_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: bridge_transfers bridge_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bridge_transfers
    ADD CONSTRAINT bridge_transfers_pkey PRIMARY KEY (id);


--
-- Name: buy_requests buy_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_requests
    ADD CONSTRAINT buy_requests_pkey PRIMARY KEY (id);


--
-- Name: buy_requests buy_requests_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_requests
    ADD CONSTRAINT buy_requests_reference_key UNIQUE (reference);


--
-- Name: cashout_requests cashout_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashout_requests
    ADD CONSTRAINT cashout_requests_pkey PRIMARY KEY (id);


--
-- Name: cashout_requests cashout_requests_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashout_requests
    ADD CONSTRAINT cashout_requests_reference_key UNIQUE (reference);


--
-- Name: community_comments community_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comments
    ADD CONSTRAINT community_comments_pkey PRIMARY KEY (id);


--
-- Name: community_posts community_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_pkey PRIMARY KEY (id);


--
-- Name: community_votes community_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_votes
    ADD CONSTRAINT community_votes_pkey PRIMARY KEY (id);


--
-- Name: ddos_protection ddos_protection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ddos_protection
    ADD CONSTRAINT ddos_protection_pkey PRIMARY KEY (id);


--
-- Name: did_documents did_documents_did_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.did_documents
    ADD CONSTRAINT did_documents_did_key UNIQUE (did);


--
-- Name: did_documents did_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.did_documents
    ADD CONSTRAINT did_documents_pkey PRIMARY KEY (id);


--
-- Name: did_documents did_documents_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.did_documents
    ADD CONSTRAINT did_documents_user_id_key UNIQUE (user_id);


--
-- Name: documentation documentation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentation
    ADD CONSTRAINT documentation_pkey PRIMARY KEY (id);


--
-- Name: documentation documentation_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentation
    ADD CONSTRAINT documentation_slug_unique UNIQUE (slug);


--
-- Name: fail2ban_jails fail2ban_jails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fail2ban_jails
    ADD CONSTRAINT fail2ban_jails_pkey PRIMARY KEY (id);


--
-- Name: faucet_claims faucet_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faucet_claims
    ADD CONSTRAINT faucet_claims_pkey PRIMARY KEY (id);


--
-- Name: firewall_rules firewall_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firewall_rules
    ADD CONSTRAINT firewall_rules_pkey PRIMARY KEY (id);


--
-- Name: governance_proposals governance_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_proposals
    ADD CONSTRAINT governance_proposals_pkey PRIMARY KEY (id);


--
-- Name: governance_treasury governance_treasury_coin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_treasury
    ADD CONSTRAINT governance_treasury_coin_key UNIQUE (coin);


--
-- Name: governance_treasury governance_treasury_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_treasury
    ADD CONSTRAINT governance_treasury_pkey PRIMARY KEY (id);


--
-- Name: governance_votes governance_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_votes
    ADD CONSTRAINT governance_votes_pkey PRIMARY KEY (id);


--
-- Name: insurance_policies insurance_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_pkey PRIMARY KEY (id);


--
-- Name: insurance_pools insurance_pools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_pools
    ADD CONSTRAINT insurance_pools_pkey PRIMARY KEY (id);


--
-- Name: ip_access_list ip_access_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_access_list
    ADD CONSTRAINT ip_access_list_pkey PRIMARY KEY (id);


--
-- Name: kyc_records kyc_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_records
    ADD CONSTRAINT kyc_records_pkey PRIMARY KEY (id);


--
-- Name: kyc_records kyc_records_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_records
    ADD CONSTRAINT kyc_records_user_id_key UNIQUE (user_id);


--
-- Name: liquidity_pools liquidity_pools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liquidity_pools
    ADD CONSTRAINT liquidity_pools_pkey PRIMARY KEY (id);


--
-- Name: multisig_signatures multisig_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisig_signatures
    ADD CONSTRAINT multisig_signatures_pkey PRIMARY KEY (id);


--
-- Name: multisig_signatures multisig_signatures_tx_id_signer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisig_signatures
    ADD CONSTRAINT multisig_signatures_tx_id_signer_id_key UNIQUE (tx_id, signer_id);


--
-- Name: multisig_signers multisig_signers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisig_signers
    ADD CONSTRAINT multisig_signers_pkey PRIMARY KEY (id);


--
-- Name: multisig_signers multisig_signers_wallet_id_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisig_signers
    ADD CONSTRAINT multisig_signers_wallet_id_address_key UNIQUE (wallet_id, address);


--
-- Name: multisig_transactions multisig_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisig_transactions
    ADD CONSTRAINT multisig_transactions_pkey PRIMARY KEY (id);


--
-- Name: multisig_wallets multisig_wallets_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisig_wallets
    ADD CONSTRAINT multisig_wallets_address_key UNIQUE (address);


--
-- Name: multisig_wallets multisig_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisig_wallets
    ADD CONSTRAINT multisig_wallets_pkey PRIMARY KEY (id);


--
-- Name: network_snapshots network_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.network_snapshots
    ADD CONSTRAINT network_snapshots_pkey PRIMARY KEY (id);


--
-- Name: network_validators network_validators_address_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.network_validators
    ADD CONSTRAINT network_validators_address_unique UNIQUE (address);


--
-- Name: network_validators network_validators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.network_validators
    ADD CONSTRAINT network_validators_pkey PRIMARY KEY (id);


--
-- Name: nft_collections nft_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nft_collections
    ADD CONSTRAINT nft_collections_pkey PRIMARY KEY (id);


--
-- Name: nft_tokens nft_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nft_tokens
    ADD CONSTRAINT nft_tokens_pkey PRIMARY KEY (id);


--
-- Name: node_installations node_installations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_installations
    ADD CONSTRAINT node_installations_pkey PRIMARY KEY (id);


--
-- Name: oracle_feeds oracle_feeds_feed_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oracle_feeds
    ADD CONSTRAINT oracle_feeds_feed_id_key UNIQUE (feed_id);


--
-- Name: oracle_feeds oracle_feeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oracle_feeds
    ADD CONSTRAINT oracle_feeds_pkey PRIMARY KEY (id);


--
-- Name: oracle_submissions oracle_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oracle_submissions
    ADD CONSTRAINT oracle_submissions_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_unique UNIQUE (token);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: price_history price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);


--
-- Name: rate_limit_rules rate_limit_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_rules
    ADD CONSTRAINT rate_limit_rules_pkey PRIMARY KEY (id);


--
-- Name: referral_events referral_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_events
    ADD CONSTRAINT referral_events_pkey PRIMARY KEY (id);


--
-- Name: referral_events referral_events_referee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_events
    ADD CONSTRAINT referral_events_referee_id_key UNIQUE (referee_id);


--
-- Name: referrals referrals_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_code_key UNIQUE (code);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_user_id_key UNIQUE (user_id);


--
-- Name: rwa_assets rwa_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rwa_assets
    ADD CONSTRAINT rwa_assets_pkey PRIMARY KEY (id);


--
-- Name: rwa_holdings rwa_holdings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rwa_holdings
    ADD CONSTRAINT rwa_holdings_pkey PRIMARY KEY (id);


--
-- Name: rwa_holdings rwa_holdings_user_id_asset_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rwa_holdings
    ADD CONSTRAINT rwa_holdings_user_id_asset_id_key UNIQUE (user_id, asset_id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: social_verifications social_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_verifications
    ADD CONSTRAINT social_verifications_pkey PRIMARY KEY (id);


--
-- Name: social_verifications social_verifications_user_id_platform_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_verifications
    ADD CONSTRAINT social_verifications_user_id_platform_key UNIQUE (user_id, platform);


--
-- Name: token_launches token_launches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_launches
    ADD CONSTRAINT token_launches_pkey PRIMARY KEY (id);


--
-- Name: token_operations token_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_operations
    ADD CONSTRAINT token_operations_pkey PRIMARY KEY (id);


--
-- Name: token_price_alerts token_price_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_price_alerts
    ADD CONSTRAINT token_price_alerts_pkey PRIMARY KEY (id);


--
-- Name: token_price token_price_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_price
    ADD CONSTRAINT token_price_pkey PRIMARY KEY (id);


--
-- Name: token_watchlist token_watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_watchlist
    ADD CONSTRAINT token_watchlist_pkey PRIMARY KEY (id);


--
-- Name: tokens tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tokens
    ADD CONSTRAINT tokens_pkey PRIMARY KEY (id);


--
-- Name: trade_history trade_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_history
    ADD CONSTRAINT trade_history_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_tx_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_tx_hash_unique UNIQUE (tx_hash);


--
-- Name: trust_beneficiaries trust_beneficiaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trust_beneficiaries
    ADD CONSTRAINT trust_beneficiaries_pkey PRIMARY KEY (id);


--
-- Name: trust_conditions trust_conditions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trust_conditions
    ADD CONSTRAINT trust_conditions_pkey PRIMARY KEY (id);


--
-- Name: trust_payments trust_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trust_payments
    ADD CONSTRAINT trust_payments_pkey PRIMARY KEY (id);


--
-- Name: trusts trusts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trusts
    ADD CONSTRAINT trusts_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- Name: user_features user_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_features
    ADD CONSTRAINT user_features_pkey PRIMARY KEY (id);


--
-- Name: user_notifications user_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_stablecoins user_stablecoins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_stablecoins
    ADD CONSTRAINT user_stablecoins_pkey PRIMARY KEY (id);


--
-- Name: user_stablecoins user_stablecoins_symbol_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_stablecoins
    ADD CONSTRAINT user_stablecoins_symbol_unique UNIQUE (symbol);


--
-- Name: user_xp user_xp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_xp
    ADD CONSTRAINT user_xp_pkey PRIMARY KEY (id);


--
-- Name: user_xp user_xp_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_xp
    ADD CONSTRAINT user_xp_user_id_unique UNIQUE (user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: users users_wallet_address_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_wallet_address_unique UNIQUE (wallet_address);


--
-- Name: validator_delegations validator_delegations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validator_delegations
    ADD CONSTRAINT validator_delegations_pkey PRIMARY KEY (id);


--
-- Name: vault_positions vault_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_positions
    ADD CONSTRAINT vault_positions_pkey PRIMARY KEY (id);


--
-- Name: voting_delegations voting_delegations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voting_delegations
    ADD CONSTRAINT voting_delegations_pkey PRIMARY KEY (id);


--
-- Name: wallet_releases wallet_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_releases
    ADD CONSTRAINT wallet_releases_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: webhook_endpoints webhook_endpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_pkey PRIMARY KEY (id);


--
-- Name: xp_events xp_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xp_events
    ADD CONSTRAINT xp_events_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: api_usage_key_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_usage_key_ts ON public.api_usage_logs USING btree (key_id, logged_at DESC);


--
-- Name: idx_trade_hist_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trade_hist_pair ON public.trade_history USING btree (pair, executed_at DESC);


--
-- Name: network_snapshots_captured_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX network_snapshots_captured_idx ON public.network_snapshots USING btree (captured_at DESC);


--
-- Name: notif_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notif_user_idx ON public.user_notifications USING btree (user_id, created_at DESC);


--
-- Name: oracle_sub_feed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX oracle_sub_feed_idx ON public.oracle_submissions USING btree (feed_id, submitted_at DESC);


--
-- Name: price_history_coin_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX price_history_coin_ts ON public.price_history USING btree (coin, "timestamp" DESC);


--
-- Name: wh_delivery_webhook_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wh_delivery_webhook_idx ON public.webhook_deliveries USING btree (webhook_id, attempted_at DESC);


--
-- Name: community_comments community_comments_post_id_community_posts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comments
    ADD CONSTRAINT community_comments_post_id_community_posts_id_fk FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;


--
-- Name: community_comments community_comments_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comments
    ADD CONSTRAINT community_comments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: community_posts community_posts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: community_votes community_votes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_votes
    ADD CONSTRAINT community_votes_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: governance_proposals governance_proposals_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_proposals
    ADD CONSTRAINT governance_proposals_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: governance_votes governance_votes_proposal_id_governance_proposals_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_votes
    ADD CONSTRAINT governance_votes_proposal_id_governance_proposals_id_fk FOREIGN KEY (proposal_id) REFERENCES public.governance_proposals(id) ON DELETE CASCADE;


--
-- Name: governance_votes governance_votes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_votes
    ADD CONSTRAINT governance_votes_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: insurance_policies insurance_policies_pool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES public.insurance_pools(id) ON DELETE CASCADE;


--
-- Name: multisig_signatures multisig_signatures_tx_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisig_signatures
    ADD CONSTRAINT multisig_signatures_tx_id_fkey FOREIGN KEY (tx_id) REFERENCES public.multisig_transactions(id) ON DELETE CASCADE;


--
-- Name: multisig_signers multisig_signers_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisig_signers
    ADD CONSTRAINT multisig_signers_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.multisig_wallets(id) ON DELETE CASCADE;


--
-- Name: multisig_transactions multisig_transactions_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multisig_transactions
    ADD CONSTRAINT multisig_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.multisig_wallets(id) ON DELETE CASCADE;


--
-- Name: nft_tokens nft_tokens_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nft_tokens
    ADD CONSTRAINT nft_tokens_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.nft_collections(id) ON DELETE CASCADE;


--
-- Name: node_installations node_installations_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_installations
    ADD CONSTRAINT node_installations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: orders orders_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: rwa_holdings rwa_holdings_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rwa_holdings
    ADD CONSTRAINT rwa_holdings_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.rwa_assets(id) ON DELETE CASCADE;


--
-- Name: token_price_alerts token_price_alerts_token_id_tokens_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_price_alerts
    ADD CONSTRAINT token_price_alerts_token_id_tokens_id_fk FOREIGN KEY (token_id) REFERENCES public.tokens(id) ON DELETE CASCADE;


--
-- Name: token_price_alerts token_price_alerts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_price_alerts
    ADD CONSTRAINT token_price_alerts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: token_watchlist token_watchlist_token_id_tokens_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_watchlist
    ADD CONSTRAINT token_watchlist_token_id_tokens_id_fk FOREIGN KEY (token_id) REFERENCES public.tokens(id) ON DELETE CASCADE;


--
-- Name: token_watchlist token_watchlist_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_watchlist
    ADD CONSTRAINT token_watchlist_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trade_history trade_history_maker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_history
    ADD CONSTRAINT trade_history_maker_id_fkey FOREIGN KEY (maker_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: trade_history trade_history_taker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_history
    ADD CONSTRAINT trade_history_taker_id_fkey FOREIGN KEY (taker_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: transactions transactions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_achievement_id_achievements_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_achievements_id_fk FOREIGN KEY (achievement_id) REFERENCES public.achievements(id);


--
-- Name: user_achievements user_achievements_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_features user_features_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_features
    ADD CONSTRAINT user_features_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_xp user_xp_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_xp
    ADD CONSTRAINT user_xp_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: validator_delegations validator_delegations_validator_id_network_validators_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validator_delegations
    ADD CONSTRAINT validator_delegations_validator_id_network_validators_id_fk FOREIGN KEY (validator_id) REFERENCES public.network_validators(id) ON DELETE CASCADE;


--
-- Name: vault_positions vault_positions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vault_positions
    ADD CONSTRAINT vault_positions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: wallets wallets_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: xp_events xp_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xp_events
    ADD CONSTRAINT xp_events_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


