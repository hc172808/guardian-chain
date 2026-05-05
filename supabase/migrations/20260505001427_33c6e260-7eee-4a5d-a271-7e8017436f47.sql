CREATE TABLE IF NOT EXISTS public.faucet_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_address text NOT NULL,
  token_type text NOT NULL CHECK (token_type IN ('gyd','gyds')),
  amount numeric NOT NULL,
  ip_address text,
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faucet_claims_user_token_time
  ON public.faucet_claims (user_id, token_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_faucet_claims_wallet_token_time
  ON public.faucet_claims (wallet_address, token_type, created_at DESC);

ALTER TABLE public.faucet_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own faucet claims" ON public.faucet_claims;
CREATE POLICY "Users can view own faucet claims"
  ON public.faucet_claims FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all faucet claims" ON public.faucet_claims;
CREATE POLICY "Admins can view all faucet claims"
  ON public.faucet_claims FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(),'founder'::app_role) OR has_role(auth.uid(),'admin'::app_role));
