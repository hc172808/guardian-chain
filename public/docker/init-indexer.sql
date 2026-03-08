-- GydsChain Indexer Database Schema
-- This PostgreSQL database mirrors blockchain state for the explorer and API

CREATE TABLE IF NOT EXISTS blocks (
    height BIGINT PRIMARY KEY,
    hash VARCHAR(66) NOT NULL UNIQUE,
    parent_hash VARCHAR(66) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    validator VARCHAR(42),
    tx_count INTEGER DEFAULT 0,
    gas_used BIGINT DEFAULT 0,
    size INTEGER DEFAULT 0,
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
    address VARCHAR(42) PRIMARY KEY,
    balance NUMERIC(78, 18) DEFAULT 0,
    nonce BIGINT DEFAULT 0,
    tx_count INTEGER DEFAULT 0,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_active TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS validators (
    address VARCHAR(42) PRIMARY KEY,
    stake NUMERIC(78, 18) DEFAULT 0,
    commission INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    is_jailed BOOLEAN DEFAULT false,
    uptime NUMERIC(5, 2) DEFAULT 100.00,
    blocks_proposed BIGINT DEFAULT 0,
    last_vote_height BIGINT DEFAULT 0,
    registered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_transfers (
    id SERIAL PRIMARY KEY,
    tx_hash VARCHAR(66) REFERENCES transactions(hash),
    token_address VARCHAR(42) NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    amount NUMERIC(78, 18) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tx_block ON transactions(block_height);
CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_tx_to ON transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_blocks_time ON blocks(timestamp);
CREATE INDEX IF NOT EXISTS idx_token_transfers_token ON token_transfers(token_address);
CREATE INDEX IF NOT EXISTS idx_accounts_balance ON accounts(balance DESC);
