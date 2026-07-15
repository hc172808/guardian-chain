-- Migration 0004: Fix schema drift between legacy DB state and application code
-- Every ADD COLUMN uses IF NOT EXISTS; every backfill from a legacy column is
-- guarded in a DO block that first checks whether the source column exists.
-- This makes the migration safe on both old (drifted) and fresh installs.

-- ── 1. payment_methods ──────────────────────────────────────────────────────
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
ALTER TABLE api_usage_logs
  ADD COLUMN IF NOT EXISTS key_id      UUID,
  ADD COLUMN IF NOT EXISTS status_code INTEGER,
  ADD COLUMN IF NOT EXISTS logged_at   TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS api_usage_key_ts ON api_usage_logs(key_id, logged_at DESC);
-- Backfill only when legacy source columns exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_usage_logs' AND column_name = 'api_key_id'
  ) THEN
    UPDATE api_usage_logs
    SET  key_id = api_key_id
    WHERE key_id IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_usage_logs' AND column_name = 'status'
  ) THEN
    UPDATE api_usage_logs
    SET  status_code = status
    WHERE status_code IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_usage_logs' AND column_name = 'created_at'
  ) THEN
    UPDATE api_usage_logs
    SET  logged_at = created_at
    WHERE logged_at IS NULL;
  END IF;
END $$;

-- ── 4. nft_collections ───────────────────────────────────────────────────────
ALTER TABLE nft_collections
  ADD COLUMN IF NOT EXISTS floor_price     NUMERIC  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volume_24h      NUMERIC  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_24h      NUMERIC  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_items     INTEGER  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_emoji     TEXT     DEFAULT '🖼️',
  ADD COLUMN IF NOT EXISTS creator_address TEXT;
-- Allow inserts that omit creator_id (only on old schema where it exists and is NOT NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nft_collections'
      AND column_name = 'creator_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE nft_collections ALTER COLUMN creator_id SET DEFAULT '';
  END IF;
END $$;

-- ── 5. nft_tokens ────────────────────────────────────────────────────────────
ALTER TABLE nft_tokens
  ADD COLUMN IF NOT EXISTS owner_address TEXT    DEFAULT '0x0000000000000000000000000000000000000000',
  ADD COLUMN IF NOT EXISTS price         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sale     NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rarity        TEXT    DEFAULT 'Common',
  ADD COLUMN IF NOT EXISTS image_emoji   TEXT    DEFAULT '🖼️',
  ADD COLUMN IF NOT EXISTS listed        BOOLEAN DEFAULT true;
-- Backfill from legacy columns when they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nft_tokens' AND column_name = 'owner_id'
  ) THEN
    UPDATE nft_tokens
    SET  owner_address = COALESCE(owner_id, '0x0000000000000000000000000000000000000000')
    WHERE owner_address = '0x0000000000000000000000000000000000000000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nft_tokens' AND column_name = 'list_price'
  ) THEN
    UPDATE nft_tokens SET price = COALESCE(list_price, 0) WHERE price = 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nft_tokens' AND column_name = 'is_listed'
  ) THEN
    UPDATE nft_tokens SET listed = COALESCE(is_listed, false) WHERE listed = true AND is_listed IS NOT NULL;
  END IF;
END $$;

-- ── 6. insurance_pools ───────────────────────────────────────────────────────
ALTER TABLE insurance_pools
  ADD COLUMN IF NOT EXISTS coverage_type  TEXT    DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS total_coverage NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS premium_rate   NUMERIC DEFAULT 0.02,
  ADD COLUMN IF NOT EXISTS claim_period   INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS min_coverage   NUMERIC DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS max_coverage   NUMERIC DEFAULT 1000000,
  ADD COLUMN IF NOT EXISTS image_emoji    TEXT    DEFAULT '🛡️',
  ADD COLUMN IF NOT EXISTS active         BOOLEAN DEFAULT true;
-- Set default on legacy NOT NULL column when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'insurance_pools'
      AND column_name = 'token'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE insurance_pools ALTER COLUMN token SET DEFAULT '';
  END IF;
END $$;

-- ── 7. price_history ─────────────────────────────────────────────────────────
ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS coin      TEXT        DEFAULT '',
  ADD COLUMN IF NOT EXISTS open      NUMERIC     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS close     NUMERIC     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high      NUMERIC     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low       NUMERIC     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volume    BIGINT      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS price_history_coin_ts ON price_history(coin, timestamp DESC);
-- Set defaults on legacy NOT NULL columns and backfill new columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_history'
      AND column_name = 'symbol'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE price_history ALTER COLUMN symbol SET DEFAULT '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_history'
      AND column_name = 'price'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE price_history ALTER COLUMN price SET DEFAULT 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_history' AND column_name = 'symbol'
  ) THEN
    UPDATE price_history
    SET  coin      = COALESCE(symbol, ''),
         close     = COALESCE(price, 0),
         open      = COALESCE(price, 0),
         high      = COALESCE(price, 0),
         low       = COALESCE(price, 0),
         timestamp = COALESCE(recorded_at, NOW())
    WHERE coin = '' OR coin IS NULL;
  END IF;
END $$;

-- ── 8. rwa_assets ────────────────────────────────────────────────────────────
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
-- Set defaults on legacy NOT NULL columns and backfill
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rwa_assets'
      AND column_name = 'creator_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE rwa_assets ALTER COLUMN creator_id SET DEFAULT '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rwa_assets'
      AND column_name = 'asset_type'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE rwa_assets ALTER COLUMN asset_type SET DEFAULT 'general';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rwa_assets' AND column_name = 'asset_type'
  ) THEN
    UPDATE rwa_assets
    SET  type = asset_type
    WHERE type IS NULL OR type = '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rwa_assets' AND column_name = 'value'
  ) THEN
    UPDATE rwa_assets
    SET  total_value = COALESCE(value, 0)
    WHERE total_value = 0 AND value IS NOT NULL AND value > 0;
  END IF;
END $$;

-- ── 9. network_snapshots ─────────────────────────────────────────────────────
ALTER TABLE network_snapshots
  ADD COLUMN IF NOT EXISTS active_validators  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_nodes       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_transactions BIGINT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS captured_at        TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS network_snapshots_captured_idx ON network_snapshots(captured_at DESC);
-- Backfill from legacy columns when they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'network_snapshots' AND column_name = 'active_wallets'
  ) THEN
    UPDATE network_snapshots SET active_validators = COALESCE(active_wallets, 0)
    WHERE active_validators = 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'network_snapshots' AND column_name = 'tx_count'
  ) THEN
    UPDATE network_snapshots SET active_nodes = COALESCE(tx_count, 0)
    WHERE active_nodes = 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'network_snapshots' AND column_name = 'block_height'
  ) THEN
    UPDATE network_snapshots SET total_transactions = COALESCE(block_height, 0)
    WHERE total_transactions = 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'network_snapshots' AND column_name = 'token_count'
  ) THEN
    UPDATE network_snapshots SET total_tokens = COALESCE(token_count, 0)
    WHERE total_tokens = 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'network_snapshots' AND column_name = 'created_at'
  ) THEN
    UPDATE network_snapshots SET captured_at = COALESCE(created_at, NOW())
    WHERE captured_at IS NULL;
  END IF;
END $$;

-- ── 10. trade_history ────────────────────────────────────────────────────────
ALTER TABLE trade_history
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS taker_id    TEXT,
  ADD COLUMN IF NOT EXISTS maker_id    TEXT;
CREATE INDEX IF NOT EXISTS idx_trade_hist_pair ON trade_history(pair, executed_at DESC);
-- Set defaults on legacy NOT NULL columns and backfill
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trade_history'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE trade_history ALTER COLUMN user_id SET DEFAULT '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trade_history'
      AND column_name = 'total'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE trade_history ALTER COLUMN total SET DEFAULT 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trade_history' AND column_name = 'created_at'
  ) THEN
    UPDATE trade_history SET executed_at = created_at WHERE executed_at IS NULL;
  END IF;
END $$;

-- ── 11. webhook_deliveries ───────────────────────────────────────────────────
ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS webhook_id      UUID,
  ADD COLUMN IF NOT EXISTS response_status INTEGER,
  ADD COLUMN IF NOT EXISTS response_body   TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms     INTEGER,
  ADD COLUMN IF NOT EXISTS success         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS attempted_at    TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS wh_delivery_webhook_idx ON webhook_deliveries(webhook_id, attempted_at DESC);
-- Backfill from legacy columns when they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_deliveries' AND column_name = 'endpoint_id'
  ) THEN
    UPDATE webhook_deliveries SET webhook_id = endpoint_id WHERE webhook_id IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_deliveries' AND column_name = 'created_at'
  ) THEN
    UPDATE webhook_deliveries SET attempted_at = created_at WHERE attempted_at IS NULL;
  END IF;
END $$;
