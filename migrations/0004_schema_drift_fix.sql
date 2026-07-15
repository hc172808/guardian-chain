-- Migration: Fix schema drift between DB state and application code
-- All ALTER TABLE statements use IF NOT EXISTS / SET DEFAULT so they are safe to re-run.

-- ── 1. payment_methods ──────────────────────────────────────────────────────
-- Table existed with fewer columns than the code expects.
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS description  TEXT,
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS icon         TEXT,
  ADD COLUMN IF NOT EXISTS is_enabled   BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS config_json  TEXT DEFAULT '{}';

-- ── 2. governance_treasury ───────────────────────────────────────────────────
ALTER TABLE governance_treasury
  ADD COLUMN IF NOT EXISTS usd_value NUMERIC,
  ADD COLUMN IF NOT EXISTS address   TEXT;

-- ── 3. api_usage_logs ────────────────────────────────────────────────────────
-- Original columns: api_key_id, status, created_at
-- Code expects:     key_id,     status_code, logged_at
ALTER TABLE api_usage_logs
  ADD COLUMN IF NOT EXISTS key_id      UUID,
  ADD COLUMN IF NOT EXISTS status_code INTEGER,
  ADD COLUMN IF NOT EXISTS logged_at   TIMESTAMPTZ DEFAULT NOW();
-- Backfill alias columns from legacy ones
UPDATE api_usage_logs
SET  key_id      = api_key_id,
     status_code = status,
     logged_at   = created_at
WHERE key_id IS NULL;
CREATE INDEX IF NOT EXISTS api_usage_key_ts ON api_usage_logs(key_id, logged_at DESC);

-- ── 4. nft_collections ───────────────────────────────────────────────────────
ALTER TABLE nft_collections
  ADD COLUMN IF NOT EXISTS floor_price     NUMERIC  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volume_24h      NUMERIC  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_24h      NUMERIC  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_items     INTEGER  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_emoji     TEXT     DEFAULT '🖼️',
  ADD COLUMN IF NOT EXISTS creator_address TEXT;
-- Make creator_id nullable for new inserts that don't supply it
ALTER TABLE nft_collections ALTER COLUMN creator_id SET DEFAULT '';

-- ── 5. nft_tokens ────────────────────────────────────────────────────────────
-- Original columns: owner_id, is_listed, list_price
-- Code expects:     owner_address, listed, price, last_sale, rarity, image_emoji
ALTER TABLE nft_tokens
  ADD COLUMN IF NOT EXISTS owner_address TEXT    DEFAULT '0x0000000000000000000000000000000000000000',
  ADD COLUMN IF NOT EXISTS price         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sale     NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rarity        TEXT    DEFAULT 'Common',
  ADD COLUMN IF NOT EXISTS image_emoji   TEXT    DEFAULT '🖼️',
  ADD COLUMN IF NOT EXISTS listed        BOOLEAN DEFAULT true;
UPDATE nft_tokens
SET  owner_address = COALESCE(owner_id, '0x0000000000000000000000000000000000000000'),
     price         = COALESCE(list_price, 0),
     listed        = COALESCE(is_listed, false)
WHERE owner_address = '0x0000000000000000000000000000000000000000';

-- ── 6. insurance_pools ───────────────────────────────────────────────────────
-- Original table had: token (NOT NULL), apy, is_active
-- Code expects: coverage_type, description, total_coverage, premium_rate, etc.
ALTER TABLE insurance_pools
  ADD COLUMN IF NOT EXISTS coverage_type TEXT    DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS total_coverage NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS premium_rate  NUMERIC DEFAULT 0.02,
  ADD COLUMN IF NOT EXISTS claim_period  INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS min_coverage  NUMERIC DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS max_coverage  NUMERIC DEFAULT 1000000,
  ADD COLUMN IF NOT EXISTS image_emoji   TEXT    DEFAULT '🛡️',
  ADD COLUMN IF NOT EXISTS active        BOOLEAN DEFAULT true;
ALTER TABLE insurance_pools ALTER COLUMN token SET DEFAULT '';

-- ── 7. price_history ─────────────────────────────────────────────────────────
-- Original columns: token_id, symbol (NOT NULL), price (NOT NULL), volume_24h, recorded_at
-- Code expects:     coin, open, close, high, low, volume, timestamp
ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS coin      TEXT      DEFAULT '',
  ADD COLUMN IF NOT EXISTS open      NUMERIC   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS close     NUMERIC   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high      NUMERIC   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low       NUMERIC   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volume    BIGINT    DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE price_history ALTER COLUMN symbol SET DEFAULT '';
ALTER TABLE price_history ALTER COLUMN price  SET DEFAULT 0;
UPDATE price_history
SET  coin      = symbol,
     close     = price,
     open      = price,
     high      = price,
     low       = price,
     timestamp = recorded_at
WHERE coin IS NULL OR coin = '';
CREATE INDEX IF NOT EXISTS price_history_coin_ts ON price_history(coin, timestamp DESC);

-- ── 8. rwa_assets ────────────────────────────────────────────────────────────
-- Original columns: creator_id (NOT NULL), asset_type (NOT NULL), value, status, documents
-- Code expects:     type, description, total_value, token_price, tokens_available, total_tokens,
--                   apy, currency, jurisdiction, audited, maturity, doc_cid, active
ALTER TABLE rwa_assets
  ADD COLUMN IF NOT EXISTS type             TEXT    DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS total_value      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS token_price      NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tokens_available INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens     INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS apy              NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency         TEXT    DEFAULT 'USDT',
  ADD COLUMN IF NOT EXISTS jurisdiction     TEXT,
  ADD COLUMN IF NOT EXISTS audited          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS maturity         TEXT,
  ADD COLUMN IF NOT EXISTS doc_cid          TEXT,
  ADD COLUMN IF NOT EXISTS active           BOOLEAN DEFAULT true;
ALTER TABLE rwa_assets ALTER COLUMN creator_id  SET DEFAULT '';
ALTER TABLE rwa_assets ALTER COLUMN asset_type  SET DEFAULT 'general';
UPDATE rwa_assets
SET  type        = asset_type,
     total_value = value
WHERE type IS NULL OR type = '';

-- ── 9. network_snapshots ─────────────────────────────────────────────────────
-- Original columns: block_height, tx_count, active_wallets, token_count, tps, snapshot_data, created_at
-- Code expects: active_validators, active_nodes, total_transactions, total_tokens, captured_at
ALTER TABLE network_snapshots
  ADD COLUMN IF NOT EXISTS active_validators  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_nodes       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_transactions BIGINT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS captured_at        TIMESTAMPTZ DEFAULT NOW();
UPDATE network_snapshots
SET  active_validators  = COALESCE(active_wallets, 0),
     active_nodes       = COALESCE(tx_count, 0),
     total_transactions = COALESCE(block_height, 0),
     total_tokens       = COALESCE(token_count, 0),
     captured_at        = COALESCE(created_at, NOW())
WHERE captured_at IS NULL;
CREATE INDEX IF NOT EXISTS network_snapshots_captured_idx ON network_snapshots(captured_at DESC);

-- ── 10. trade_history ────────────────────────────────────────────────────────
-- Original columns: user_id (NOT NULL), pair, side, price, amount, total (NOT NULL), fee, status, created_at
-- Code expects: executed_at, taker_id, maker_id; no user_id / total required
ALTER TABLE trade_history
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS taker_id    TEXT,
  ADD COLUMN IF NOT EXISTS maker_id    TEXT;
ALTER TABLE trade_history ALTER COLUMN user_id SET DEFAULT '';
ALTER TABLE trade_history ALTER COLUMN total  SET DEFAULT 0;
UPDATE trade_history SET executed_at = created_at WHERE executed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trade_hist_pair ON trade_history(pair, executed_at DESC);

-- ── 11. webhook_deliveries ───────────────────────────────────────────────────
-- Original columns: endpoint_id (NOT NULL), event, payload, status, attempts, created_at
-- Code expects: webhook_id, response_status, response_body, duration_ms, success, attempted_at
ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS webhook_id     UUID,
  ADD COLUMN IF NOT EXISTS response_status INTEGER,
  ADD COLUMN IF NOT EXISTS response_body  TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms    INTEGER,
  ADD COLUMN IF NOT EXISTS success        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS attempted_at   TIMESTAMPTZ DEFAULT NOW();
UPDATE webhook_deliveries
SET  webhook_id   = endpoint_id,
     attempted_at = created_at
WHERE webhook_id IS NULL;
CREATE INDEX IF NOT EXISTS wh_delivery_webhook_idx ON webhook_deliveries(webhook_id, attempted_at DESC);
