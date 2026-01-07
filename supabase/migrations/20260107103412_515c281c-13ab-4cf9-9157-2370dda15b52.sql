-- Transactions table for real transaction history
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  fee DECIMAL NOT NULL DEFAULT 0.001,
  tx_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  block_height BIGINT,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
CREATE POLICY "Users can view their own transactions"
ON public.transactions
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own transactions
CREATE POLICY "Users can create their own transactions"
ON public.transactions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admin can view all transactions
CREATE POLICY "Admins can view all transactions"
ON public.transactions
FOR SELECT
USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add status fields to node_installations for real-time monitoring
ALTER TABLE public.node_installations ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
ALTER TABLE public.node_installations ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.node_installations ADD COLUMN IF NOT EXISTS hash_rate BIGINT DEFAULT 0;
ALTER TABLE public.node_installations ADD COLUMN IF NOT EXISTS valid_shares BIGINT DEFAULT 0;
ALTER TABLE public.node_installations ADD COLUMN IF NOT EXISTS total_rewards DECIMAL DEFAULT 0;
ALTER TABLE public.node_installations ADD COLUMN IF NOT EXISTS wireguard_private_key TEXT;

-- Enable realtime for node status monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.node_installations;

-- Database config table for admin
CREATE TABLE public.admin_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;

-- Only founders can manage admin config
CREATE POLICY "Founders can manage admin config"
ON public.admin_config
FOR ALL
USING (has_role(auth.uid(), 'founder'::app_role));

-- Public can read non-sensitive config
CREATE POLICY "Public can read public config"
ON public.admin_config
FOR SELECT
USING (config_key NOT LIKE 'secret_%');

-- Insert default config
INSERT INTO public.admin_config (config_key, config_value) VALUES
('database_connection', '{"type": "cloud", "enabled": true}'::jsonb),
('network_settings', '{"block_time": 120, "min_share_interval": 5, "max_shares_per_minute": 12}'::jsonb)
ON CONFLICT (config_key) DO NOTHING;