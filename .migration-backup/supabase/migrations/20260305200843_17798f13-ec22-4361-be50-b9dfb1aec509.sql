
-- Launchpad submissions table
CREATE TABLE public.token_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  token_id uuid REFERENCES public.tokens(id) ON DELETE CASCADE,
  name text NOT NULL,
  symbol text NOT NULL,
  description text,
  logo_url text,
  status text NOT NULL DEFAULT 'pending',
  target_raise numeric NOT NULL DEFAULT 0,
  raised_amount numeric NOT NULL DEFAULT 0,
  participants integer NOT NULL DEFAULT 0,
  bonding_curve_type text NOT NULL DEFAULT 'linear',
  bonding_curve_steepness numeric NOT NULL DEFAULT 1.0,
  initial_price numeric NOT NULL DEFAULT 0.001,
  max_price numeric,
  is_premier boolean NOT NULL DEFAULT false,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.token_launches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view approved launches" ON public.token_launches
  FOR SELECT TO authenticated USING (status IN ('live', 'upcoming', 'completed'));

CREATE POLICY "Creators can insert launches" ON public.token_launches
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creators can update own launches" ON public.token_launches
  FOR UPDATE TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "Admins can manage all launches" ON public.token_launches
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Liquidity pools table
CREATE TABLE public.liquidity_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  token_a_symbol text NOT NULL,
  token_b_symbol text NOT NULL,
  token_a_address text,
  token_b_address text,
  fee_tier numeric NOT NULL DEFAULT 0.3,
  tvl numeric NOT NULL DEFAULT 0,
  volume_24h numeric NOT NULL DEFAULT 0,
  fees_24h numeric NOT NULL DEFAULT 0,
  apr numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.liquidity_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active pools" ON public.liquidity_pools
  FOR SELECT USING (is_active = true);

CREATE POLICY "Authenticated users can create pools" ON public.liquidity_pools
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creators can update own pools" ON public.liquidity_pools
  FOR UPDATE TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "Admins can manage all pools" ON public.liquidity_pools
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'founder') OR has_role(auth.uid(), 'admin'));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.token_launches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.liquidity_pools;
