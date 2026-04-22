-- Devnet/Mainnet network type + extended authorities for the tokens table.
-- The runtime ALSO mirrors this state into admin_config rows
-- (key: token_network_<token_id>) so the feature works immediately even
-- before this migration is applied to the live Supabase database.

ALTER TABLE public.tokens
  ADD COLUMN IF NOT EXISTS network_type text NOT NULL DEFAULT 'devnet'
    CHECK (network_type IN ('devnet','mainnet')),
  ADD COLUMN IF NOT EXISTS mainnet_promoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS market_cap_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_authorities jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tokens_network_type ON public.tokens(network_type);
CREATE INDEX IF NOT EXISTS idx_tokens_devnet_age
  ON public.tokens(created_at)
  WHERE network_type = 'devnet';
