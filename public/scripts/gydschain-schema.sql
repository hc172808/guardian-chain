-- GydsChain Indexer Database Schema v2.0
-- PostgreSQL database mirroring blockchain state for explorer and API
-- Domain: netlifegy.com | Chain ID: 13370

-- ═══════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS blocks (
    height BIGINT PRIMARY KEY,
    hash VARCHAR(66) NOT NULL UNIQUE,
    parent_hash VARCHAR(66) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    validator VARCHAR(42),
    tx_count INTEGER DEFAULT 0,
    gas_used BIGINT DEFAULT 0,
    gas_limit BIGINT DEFAULT 30000000,
    size INTEGER DEFAULT 0,
    state_root VARCHAR(66),
    receipts_root VARCHAR(66),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    hash VARCHAR(66) PRIMARY KEY,
    block_height BIGINT REFERENCES blocks(height),
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    fee NUMERIC(78, 18) DEFAULT 0,
    nonce BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    input_data TEXT,
    gas_used BIGINT DEFAULT 21000,
    gas_price NUMERIC(78, 18) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
    address VARCHAR(42) PRIMARY KEY,
    balance_gyds NUMERIC(78, 18) DEFAULT 0,
    balance_gyd NUMERIC(78, 6) DEFAULT 0,
    nonce BIGINT DEFAULT 0,
    tx_count INTEGER DEFAULT 0,
    is_contract BOOLEAN DEFAULT false,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_active TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- CONSENSUS TABLES
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS validators (
    address VARCHAR(42) PRIMARY KEY,
    name VARCHAR(255),
    stake NUMERIC(78, 18) DEFAULT 0,
    commission INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    is_jailed BOOLEAN DEFAULT false,
    uptime NUMERIC(5, 2) DEFAULT 100.00,
    blocks_proposed BIGINT DEFAULT 0,
    last_vote_height BIGINT DEFAULT 0,
    delegator_count INTEGER DEFAULT 0,
    total_delegated NUMERIC(78, 18) DEFAULT 0,
    registered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delegations (
    id SERIAL PRIMARY KEY,
    delegator_address VARCHAR(42) NOT NULL,
    validator_address VARCHAR(42) NOT NULL REFERENCES validators(address),
    amount NUMERIC(78, 18) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    delegated_at TIMESTAMPTZ DEFAULT NOW(),
    undelegated_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════
-- TOKEN TABLES
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS token_transfers (
    id SERIAL PRIMARY KEY,
    tx_hash VARCHAR(66) REFERENCES transactions(hash),
    token_address VARCHAR(42) NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tokens (
    address VARCHAR(42) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    decimals INTEGER DEFAULT 18,
    total_supply NUMERIC(78, 18) DEFAULT 0,
    creator_address VARCHAR(42),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- MINING TABLES
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS mining_rewards (
    id SERIAL PRIMARY KEY,
    block_height BIGINT REFERENCES blocks(height),
    miner_address VARCHAR(42) NOT NULL,
    shares INTEGER DEFAULT 0,
    reward NUMERIC(78, 18) DEFAULT 0,
    difficulty NUMERIC DEFAULT 0,
    algorithm VARCHAR(20) DEFAULT 'randomx',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_tx_block ON transactions(block_height);
CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_tx_to ON transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_blocks_time ON blocks(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_validator ON blocks(validator);
CREATE INDEX IF NOT EXISTS idx_token_transfers_token ON token_transfers(token_address);
CREATE INDEX IF NOT EXISTS idx_token_transfers_from ON token_transfers(from_address);
CREATE INDEX IF NOT EXISTS idx_token_transfers_to ON token_transfers(to_address);
CREATE INDEX IF NOT EXISTS idx_accounts_balance ON accounts(balance_gyds DESC);
CREATE INDEX IF NOT EXISTS idx_delegations_validator ON delegations(validator_address);
CREATE INDEX IF NOT EXISTS idx_delegations_delegator ON delegations(delegator_address);
CREATE INDEX IF NOT EXISTS idx_mining_rewards_block ON mining_rewards(block_height);
CREATE INDEX IF NOT EXISTS idx_mining_rewards_miner ON mining_rewards(miner_address);