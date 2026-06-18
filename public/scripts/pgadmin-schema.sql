-- ═══════════════════════════════════════════════════════════════════════════
--  GYDSchain — Complete Database Schema for pgAdmin Upload
--  Chain ID: 13370 (mainnet)  |  Dual coin: GYDS (gas) + GYD (stablecoin)
--
--  This file is the SAME as gydschain-complete-schema.sql but named for
--  easy upload to pgAdmin. Open pgAdmin, right-click your database,
--  choose Query Tool, paste this entire file, and click Run.
--
--  IDEMPOTENT: safe to run multiple times. All CREATE TABLE statements use
--  IF NOT EXISTS, and all ALTER TABLE uses IF NOT EXISTS / ADD COLUMN.
--  ═══════════════════════════════════════════════════════════════════════════

-- ============================================================
-- §01  Extensions & Types
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- §02  Core Auth & Roles
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    wallet_address TEXT UNIQUE,
    auth_nonce TEXT,
    totp_secret TEXT,
    totp_enabled BOOLEAN DEFAULT FALSE,
    totp_backup_codes TEXT,
    is_banned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT NOT NULL PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions(expire);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- §03  User Management & Profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    timezone TEXT DEFAULT 'UTC',
    language TEXT DEFAULT 'en',
    email_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT TRUE,
    telegram_chat_id TEXT,
    whatsapp_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- §04  Wallets & Transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,
    wallet_type TEXT NOT NULL DEFAULT 'metamask',
    is_active BOOLEAN DEFAULT TRUE,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tx_hash TEXT NOT NULL UNIQUE,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    amount TEXT NOT NULL,
    gas_used TEXT,
    gas_price TEXT,
    status TEXT DEFAULT 'pending',
    block_number INTEGER,
    chain_id INTEGER DEFAULT 13370,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_sender_idx ON transactions(sender);
CREATE INDEX IF NOT EXISTS transactions_recipient_idx ON transactions(recipient);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions(status);
CREATE INDEX IF NOT EXISTS transactions_block_idx ON transactions(block_number);

-- ============================================================
-- §05  Node Network
-- ============================================================
CREATE TABLE IF NOT EXISTS node_installations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    node_type TEXT NOT NULL,
    hostname TEXT,
    ip_address TEXT,
    port INTEGER DEFAULT 8545,
    is_approved BOOLEAN DEFAULT FALSE,
    is_online BOOLEAN DEFAULT FALSE,
    is_synced BOOLEAN DEFAULT FALSE,
    wireguard_public_key TEXT,
    wireguard_ip TEXT,
    version TEXT,
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS node_installations_user_id_idx ON node_installations(user_id);
CREATE INDEX IF NOT EXISTS node_installations_type_idx ON node_installations(node_type);
CREATE INDEX IF NOT EXISTS node_installations_online_idx ON node_installations(is_online);

-- ============================================================
-- §06  Mining & Validators
-- ============================================================
CREATE TABLE IF NOT EXISTS validators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address TEXT NOT NULL UNIQUE,
    public_key TEXT,
    stake TEXT NOT NULL DEFAULT '0',
    commission_rate INTEGER DEFAULT 10,
    uptime_percentage NUMERIC DEFAULT 0,
    blocks_produced INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    is_jailed BOOLEAN DEFAULT FALSE,
    unjail_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS validator_delegations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    validator_id UUID NOT NULL REFERENCES validators(id) ON DELETE CASCADE,
    delegator_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(validator_id, delegator_address)
);

CREATE TABLE IF NOT EXISTS validator_reward_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    validator_id UUID NOT NULL REFERENCES validators(id) ON DELETE CASCADE,
    delegator_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- §07  Tokens & Launchpad
-- ============================================================
CREATE TABLE IF NOT EXISTS tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    address TEXT NOT NULL UNIQUE,
    decimals INTEGER DEFAULT 18,
    total_supply TEXT NOT NULL,
    max_supply TEXT,
    burnable BOOLEAN DEFAULT FALSE,
    mintable BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    logo_url TEXT,
    website TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_launches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_id UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    launch_type TEXT NOT NULL DEFAULT 'public',
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    hard_cap TEXT,
    soft_cap TEXT,
    price_per_token TEXT,
    min_contribution TEXT,
    max_contribution TEXT,
    total_raised TEXT DEFAULT '0',
    participants INTEGER DEFAULT 0,
    is_finalized BOOLEAN DEFAULT FALSE,
    is_cancelled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_launch_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    launch_id UUID NOT NULL REFERENCES token_launches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount TEXT NOT NULL,
    tx_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- §08  DeFi — Pools / Swaps / Staking / Yield
-- ============================================================
CREATE TABLE IF NOT EXISTS liquidity_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_a TEXT NOT NULL,
    token_b TEXT NOT NULL,
    pair_address TEXT NOT NULL UNIQUE,
    reserve_a TEXT NOT NULL DEFAULT '0',
    reserve_b TEXT NOT NULL DEFAULT '0',
    total_liquidity TEXT NOT NULL DEFAULT '0',
    fee_tier INTEGER DEFAULT 30,
    apr NUMERIC DEFAULT 0,
    tvl NUMERIC DEFAULT 0,
    volume_24h NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pool_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_id UUID NOT NULL REFERENCES liquidity_pools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lp_amount TEXT NOT NULL DEFAULT '0',
    token_a_amount TEXT NOT NULL DEFAULT '0',
    token_b_amount TEXT NOT NULL DEFAULT '0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS swaps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender TEXT NOT NULL,
    pool_id UUID NOT NULL REFERENCES liquidity_pools(id) ON DELETE CASCADE,
    token_in TEXT NOT NULL,
    token_out TEXT NOT NULL,
    amount_in TEXT NOT NULL,
    amount_out TEXT NOT NULL,
    fee TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staking_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    validator_id UUID NOT NULL REFERENCES validators(id) ON DELETE CASCADE,
    amount TEXT NOT NULL DEFAULT '0',
    rewards_accrued TEXT NOT NULL DEFAULT '0',
    is_withdrawn BOOLEAN DEFAULT FALSE,
    unstaked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vaults (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    strategy TEXT NOT NULL,
    apy NUMERIC DEFAULT 0,
    tvl NUMERIC DEFAULT 0,
    deposit_token TEXT NOT NULL,
    lock_period INTEGER DEFAULT 0,
    max_capacity TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount TEXT NOT NULL DEFAULT '0',
    rewards TEXT NOT NULL DEFAULT '0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_stablecoins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    peg_type TEXT NOT NULL DEFAULT 'usd',
    collateral_model TEXT NOT NULL DEFAULT 'over_collateralized',
    collateral_ratio INTEGER DEFAULT 150,
    max_supply TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_type TEXT NOT NULL DEFAULT 'limit',
    side TEXT NOT NULL,
    token_pair TEXT NOT NULL,
    amount TEXT NOT NULL,
    price TEXT,
    stop_price TEXT,
    filled_amount TEXT NOT NULL DEFAULT '0',
    status TEXT NOT NULL DEFAULT 'open',
    tx_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trade_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    seller_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    token_pair TEXT NOT NULL,
    amount TEXT NOT NULL,
    price TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- §09  Security & Firewall
-- ============================================================
CREATE TABLE IF NOT EXISTS firewall_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address TEXT NOT NULL,
    reason TEXT,
    blocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    blocked_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_type TEXT,
    target_id TEXT,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);

-- ============================================================
-- §10  Faucet & Testnet
-- ============================================================
CREATE TABLE IF NOT EXISTS faucet_drips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    ip_address TEXT,
    tx_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS faucet_drips_address_idx ON faucet_drips(recipient_address);
CREATE INDEX IF NOT EXISTS faucet_drips_created_at_idx ON faucet_drips(created_at);

-- ============================================================
-- §11  Governance & DAO
-- ============================================================
CREATE TABLE IF NOT EXISTS governance_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proposer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    proposal_type TEXT NOT NULL DEFAULT 'parameter',
    status TEXT NOT NULL DEFAULT 'pending',
    quorum TEXT NOT NULL,
    votes_for TEXT NOT NULL DEFAULT '0',
    votes_against TEXT NOT NULL DEFAULT '0',
    votes_abstain TEXT NOT NULL DEFAULT '0',
    end_block INTEGER,
    executed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS governance_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proposal_id UUID NOT NULL REFERENCES governance_proposals(id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote_type TEXT NOT NULL,
    weight TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(proposal_id, voter_id)
);

CREATE TABLE IF NOT EXISTS treasury_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset TEXT NOT NULL UNIQUE,
    balance TEXT NOT NULL DEFAULT '0',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grant_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'micro',
    amount_requested TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    tx_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- §12  NFT & Digital Assets
-- ============================================================
CREATE TABLE IF NOT EXISTS nft_collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    contract_address TEXT NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    floor_price TEXT,
    total_volume TEXT,
    items_count INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nfts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id UUID NOT NULL REFERENCES nft_collections(id) ON DELETE CASCADE,
    token_id TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    name TEXT,
    description TEXT,
    image_url TEXT,
    metadata_uri TEXT,
    traits JSONB,
    is_listed BOOLEAN DEFAULT FALSE,
    list_price TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nfts_collection_id_idx ON nfts(collection_id);
CREATE INDEX IF NOT EXISTS nfts_owner_idx ON nfts(owner_address);

-- ============================================================
-- §13  Advanced Analytics & Price Data
-- ============================================================
CREATE TABLE IF NOT EXISTS network_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    block_height INTEGER NOT NULL,
    total_transactions INTEGER DEFAULT 0,
    total_addresses INTEGER DEFAULT 0,
    active_validators INTEGER DEFAULT 0,
    total_staked TEXT,
    gas_used TEXT,
    gas_price TEXT,
    avg_block_time NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS network_snapshots_height_idx ON network_snapshots(block_height);
CREATE INDEX IF NOT EXISTS network_snapshots_created_at_idx ON network_snapshots(created_at);

CREATE TABLE IF NOT EXISTS price_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token TEXT NOT NULL,
    price_usd NUMERIC NOT NULL,
    volume_24h NUMERIC DEFAULT 0,
    market_cap NUMERIC DEFAULT 0,
    change_24h NUMERIC DEFAULT 0,
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_data_token_idx ON price_data(token);
CREATE INDEX IF NOT EXISTS price_data_created_at_idx ON price_data(created_at);

CREATE TABLE IF NOT EXISTS ohlcv_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token TEXT NOT NULL,
    interval TEXT NOT NULL,
    open NUMERIC NOT NULL,
    high NUMERIC NOT NULL,
    low NUMERIC NOT NULL,
    close NUMERIC NOT NULL,
    volume NUMERIC NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE(token, interval, timestamp)
);

CREATE INDEX IF NOT EXISTS ohlcv_data_token_interval_ts_idx ON ohlcv_data(token, interval, timestamp);

-- ============================================================
-- §14  Notifications & Webhooks
-- ============================================================
CREATE TABLE IF NOT EXISTS user_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_id_idx ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS user_notifications_read_idx ON user_notifications(is_read);

CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret TEXT,
    events JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB,
    status TEXT NOT NULL,
    status_code INTEGER,
    response_body TEXT,
    attempt_count INTEGER DEFAULT 1,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx ON push_subscriptions(endpoint);

-- ============================================================
-- §15  Social & Community
-- ============================================================
CREATE TABLE IF NOT EXISTS community_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'discussion',
    tags JSONB,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS community_posts_author_id_idx ON community_posts(author_id);
CREATE INDEX IF NOT EXISTS community_posts_category_idx ON community_posts(category);

CREATE TABLE IF NOT EXISTS community_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_id UUID REFERENCES community_comments(id) ON DELETE CASCADE,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS community_comments_post_id_idx ON community_comments(post_id);

CREATE TABLE IF NOT EXISTS community_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES community_comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, post_id),
    UNIQUE(user_id, comment_id)
);

CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    reward_amount TEXT NOT NULL DEFAULT '0',
    reward_claimed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS referrals_referral_code_idx ON referrals(referral_code);

CREATE TABLE IF NOT EXISTS follows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

-- ============================================================
-- §16  Multi-Signature Wallets
-- ============================================================
CREATE TABLE IF NOT EXISTS multisig_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT NOT NULL UNIQUE,
    required_signatures INTEGER NOT NULL,
    total_signers INTEGER NOT NULL,
    balance TEXT NOT NULL DEFAULT '0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS multisig_signers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES multisig_wallets(id) ON DELETE CASCADE,
    signer_address TEXT NOT NULL,
    signer_name TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS multisig_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES multisig_wallets(id) ON DELETE CASCADE,
    to_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    data TEXT,
    description TEXT,
    signatures JSONB,
    sign_count INTEGER DEFAULT 0,
    is_executed BOOLEAN DEFAULT FALSE,
    tx_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- §17  Compliance, KYC & Sanctions
-- ============================================================
CREATE TABLE IF NOT EXISTS kyc_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL DEFAULT 'none',
    full_name TEXT,
    document_type TEXT,
    document_number TEXT,
    document_country TEXT,
    verification_status TEXT NOT NULL DEFAULT 'pending',
    verified_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sanctions_screenings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    match_found BOOLEAN DEFAULT FALSE,
    match_details TEXT,
    screened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- §18  API Access Management
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    scopes JSONB,
    rate_limit INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_usage_logs_api_key_id_idx ON api_usage_logs(api_key_id);
CREATE INDEX IF NOT EXISTS api_usage_logs_created_at_idx ON api_usage_logs(created_at);

-- ============================================================
-- §19  Gamification & Achievements
-- ============================================================
CREATE TABLE IF NOT EXISTS user_xp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    total_xp INTEGER NOT NULL DEFAULT 0,
    tier TEXT NOT NULL DEFAULT 'newcomer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS xp_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    xp_amount INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS xp_events_user_id_idx ON xp_events(user_id);

CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    icon TEXT,
    required_criteria JSONB,
    xp_reward INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

-- ============================================================
-- §20  Content, Media & Announcements
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    is_active BOOLEAN DEFAULT TRUE,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_url TEXT NOT NULL,
    mime_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- §21  Smart Contracts & Oracle Network
-- ============================================================
CREATE TABLE IF NOT EXISTS smart_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deployer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT NOT NULL UNIQUE,
    abi JSONB,
    bytecode TEXT,
    source_code TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    contract_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oracle_feeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol TEXT NOT NULL UNIQUE,
    price NUMERIC NOT NULL,
    confidence NUMERIC DEFAULT 0,
    source TEXT,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oracle_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feed_id UUID NOT NULL REFERENCES oracle_feeds(id) ON DELETE CASCADE,
    node_id UUID NOT NULL REFERENCES node_installations(id) ON DELETE CASCADE,
    submitted_price NUMERIC NOT NULL,
    deviation NUMERIC DEFAULT 0,
    is_accepted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- §22  Admin & Configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE,
    value JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    target_price NUMERIC NOT NULL,
    direction TEXT NOT NULL DEFAULT 'above',
    is_active BOOLEAN DEFAULT TRUE,
    triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    coverage_type TEXT NOT NULL,
    max_coverage TEXT NOT NULL,
    premium_rate NUMERIC NOT NULL,
    min_stake TEXT NOT NULL,
    tvl TEXT NOT NULL DEFAULT '0',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_id UUID NOT NULL REFERENCES insurance_pools(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coverage_amount TEXT NOT NULL,
    premium_paid TEXT NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id UUID NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
    amount_claimed TEXT NOT NULL,
    reason TEXT NOT NULL,
    evidence_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cashout_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount TEXT NOT NULL,
    currency TEXT NOT NULL,
    recipient_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    tx_hash TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS did_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    did TEXT NOT NULL UNIQUE,
    document JSONB,
    reputation_score INTEGER DEFAULT 0,
    kyc_tier TEXT DEFAULT 'none',
    social_links JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS soulbound_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    did_id UUID NOT NULL REFERENCES did_records(id) ON DELETE CASCADE,
    token_type TEXT NOT NULL,
    issuer TEXT NOT NULL,
    metadata JSONB,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rwa_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    description TEXT,
    total_value TEXT NOT NULL,
    min_investment TEXT,
    yield_rate NUMERIC,
    legal_document_cid TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rwa_holdings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES rwa_assets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount TEXT NOT NULL,
    purchase_price TEXT,
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_address TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, token_address)
);

CREATE TABLE IF NOT EXISTS node_repo_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repo_name TEXT NOT NULL UNIQUE,
    go_mod_module TEXT,
    binary_name TEXT,
    block_time INTEGER,
    node_mode TEXT,
    status TEXT DEFAULT 'unknown',
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cron_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    schedule TEXT NOT NULL,
    task TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS network_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    block_height INTEGER NOT NULL,
    total_txs INTEGER DEFAULT 0,
    active_addresses INTEGER DEFAULT 0,
    gas_used TEXT,
    avg_gas_price TEXT,
    tvl NUMERIC DEFAULT 0,
    market_cap NUMERIC DEFAULT 0,
    price_usd NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS network_stats_created_at_idx ON network_stats(created_at);

-- ============================================================
-- §23  Seeding (run after tables exist)
-- ============================================================
INSERT INTO users (id, username, email, password_hash, is_banned)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'netlifegy',
    'netlifegy@netlifegy.com',
    '$2b$10$hashplaceholder_for_bcrypt_hash',
    FALSE
)
ON CONFLICT (username) DO NOTHING;

INSERT INTO user_roles (user_id, role)
SELECT id, 'founder' FROM users WHERE username = 'netlifegy'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role)
SELECT id, 'admin' FROM users WHERE username = 'netlifegy'
ON CONFLICT DO NOTHING;

INSERT INTO treasury_balances (asset, balance) VALUES
('GYDS', '100000000000000000000000000'),
('GYD', '10000000000000000000000000'),
('ETH', '1000000000000000000000')
ON CONFLICT (asset) DO NOTHING;

INSERT INTO achievements (name, description, category, icon, xp_reward) VALUES
('first_transaction', 'Completed first transaction', 'general', 'zap', 100),
('validator_staker', 'Staked with a validator', 'staking', 'shield', 250),
('token_creator', 'Created a custom token', 'token', 'coins', 500),
('governance_voter', 'Voted on a governance proposal', 'governance', 'vote', 200),
('nft_minter', 'Minted your first NFT', 'nft', 'image', 300),
('liquidity_provider', 'Added liquidity to a pool', 'defi', 'droplets', 400),
('bridge_user', 'Used the cross-chain bridge', 'bridge', 'link', 350),
('insurance_buyer', 'Purchased insurance coverage', 'insurance', 'umbrella', 200)
ON CONFLICT (name) DO NOTHING;

INSERT INTO insurance_pools (name, description, coverage_type, max_coverage, premium_rate, min_stake, tvl) VALUES
('Smart Contract Shield', 'Coverage for smart contract exploits', 'smart_contract', '500000', 2.5, '1000', '2500000'),
('Validator Slashing', 'Protection against validator slashing', 'slashing', '100000', 1.5, '500', '1200000'),
('Bridge Protection', 'Insurance for cross-chain bridge risks', 'bridge', '1000000', 3.0, '2000', '5000000'),
('Stablecoin Depeg', 'Protection against stablecoin depegging', 'depeg', '250000', 4.0, '1000', '3000000'),
('General Asset', 'General asset protection coverage', 'general', '100000', 2.0, '500', '1500000')
ON CONFLICT DO NOTHING;

INSERT INTO vaults (name, strategy, apy, tvl, deposit_token, lock_period) VALUES
('GYDS Auto-Stake', 'auto_compound', 8.5, 500000, 'GYDS', 0),
('GYDS-GYD LP', 'lp_yield', 24.3, 1200000, 'GYDS-GYD', 0),
('GYD Stable', 'stable_yield', 5.2, 800000, 'GYD', 0),
('GYDS Boosted', 'boosted_stake', 45.8, 300000, 'GYDS', 30),
('Validator Support', 'validator_boost', 18.9, 600000, 'GYDS', 14)
ON CONFLICT DO NOTHING;

INSERT INTO rwa_assets (name, asset_type, description, total_value, min_investment, yield_rate, is_active) VALUES
('NYC Office Tower', 'real_estate', 'Commercial office building in Manhattan', '50000000', '50000', 8.5, TRUE),
('US Treasury Bond', 'bond', 'US government treasury bond', '10000000', '1000', 4.2, TRUE),
('Gold Reserve', 'commodity', 'Physical gold bullion reserve', '25000000', '10000', 3.8, TRUE),
('Tech Invoice #001', 'invoice', 'Invoice from tech consulting project', '500000', '1000', 12.0, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO admin_config (key, value) VALUES
('bridge_networks_enabled', 'true'),
('maintenance_mode', 'false'),
('maintenance_message', 'System is under maintenance. Please check back later.'),
('explorer_mode', 'co-located'),
('rpc_endpoint', 'https://rpc.netlifegy.com'),
('ws_endpoint', 'wss://ws.netlifegy.com')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- §24  Schema Verification
-- ============================================================
SELECT 'GYDSchain schema applied successfully' AS status;
SELECT COUNT(*) AS total_tables FROM information_schema.tables WHERE table_schema = 'public';
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
