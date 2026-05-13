
-- Token watchlist
CREATE TABLE IF NOT EXISTS public.token_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id UUID NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, token_id)
);

ALTER TABLE public.token_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watchlist" ON public.token_watchlist
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can add to watchlist" ON public.token_watchlist
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from watchlist" ON public.token_watchlist
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Token price alerts
CREATE TABLE IF NOT EXISTS public.token_price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id UUID NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  target_price NUMERIC NOT NULL,
  direction TEXT NOT NULL DEFAULT 'above' CHECK (direction IN ('above', 'below')),
  is_triggered BOOLEAN NOT NULL DEFAULT false,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.token_price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts" ON public.token_price_alerts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create alerts" ON public.token_price_alerts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts" ON public.token_price_alerts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own alerts" ON public.token_price_alerts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Network validators (admin managed)
CREATE TABLE IF NOT EXISTS public.network_validators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL UNIQUE,
  name TEXT,
  stake NUMERIC NOT NULL DEFAULT 0,
  commission INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_jailed BOOLEAN NOT NULL DEFAULT false,
  uptime NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  blocks_proposed BIGINT NOT NULL DEFAULT 0,
  last_vote_height BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.network_validators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view validators" ON public.network_validators
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage validators" ON public.network_validators
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin'));
