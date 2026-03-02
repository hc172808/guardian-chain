
-- Create tokens table for public token listing
CREATE TABLE public.tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 18,
  total_supply NUMERIC NOT NULL,
  burned_supply NUMERIC NOT NULL DEFAULT 0,
  gyds_liquidity NUMERIC NOT NULL DEFAULT 0,
  logo_url TEXT,
  lp_lock_type TEXT NOT NULL DEFAULT 'burned',
  lp_unlock_time TIMESTAMPTZ,
  freeze_enabled BOOLEAN NOT NULL DEFAULT false,
  freeze_holder TEXT,
  freeze_locked BOOLEAN NOT NULL DEFAULT false,
  update_enabled BOOLEAN NOT NULL DEFAULT false,
  update_holder TEXT,
  update_locked BOOLEAN NOT NULL DEFAULT false,
  mint_enabled BOOLEAN NOT NULL DEFAULT false,
  mint_holder TEXT,
  mint_locked BOOLEAN NOT NULL DEFAULT false,
  address TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;

-- Anyone can view active tokens (public marketplace)
CREATE POLICY "Anyone can view active tokens"
  ON public.tokens FOR SELECT
  USING (is_active = true);

-- Authenticated users can create tokens
CREATE POLICY "Users can create tokens"
  ON public.tokens FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

-- Creators can update their own tokens
CREATE POLICY "Creators can update their tokens"
  ON public.tokens FOR UPDATE
  USING (auth.uid() = creator_id);

-- Admins can manage all tokens
CREATE POLICY "Admins can manage all tokens"
  ON public.tokens FOR ALL
  USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create storage bucket for token logos
INSERT INTO storage.buckets (id, name, public) VALUES ('token-logos', 'token-logos', true);

-- Public read access for token logos
CREATE POLICY "Token logos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'token-logos');

-- Authenticated users can upload token logos
CREATE POLICY "Users can upload token logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'token-logos' AND auth.uid() IS NOT NULL);

-- Users can update their own logos
CREATE POLICY "Users can update their token logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'token-logos' AND auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER update_tokens_updated_at
  BEFORE UPDATE ON public.tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
