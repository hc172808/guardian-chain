
-- Add token metadata columns
ALTER TABLE public.tokens 
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS twitter text,
  ADD COLUMN IF NOT EXISTS telegram text,
  ADD COLUMN IF NOT EXISTS facebook text,
  ADD COLUMN IF NOT EXISTS discord text,
  ADD COLUMN IF NOT EXISTS hosted_site_url text,
  ADD COLUMN IF NOT EXISTS hosted_site_fee_paid numeric DEFAULT 0;

-- Create storage bucket for token websites (HTML files)
INSERT INTO storage.buckets (id, name, public)
VALUES ('token-sites', 'token-sites', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: anyone can view token site files
CREATE POLICY "Anyone can view token sites"
ON storage.objects FOR SELECT
USING (bucket_id = 'token-sites');

-- RLS: authenticated users can upload their own token site
CREATE POLICY "Users can upload token sites"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'token-sites');
