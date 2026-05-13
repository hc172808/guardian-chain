-- Add burn/mint tracking table
CREATE TABLE public.token_operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('burn', 'mint')),
  amount NUMERIC NOT NULL,
  usdt_amount NUMERIC DEFAULT 0,
  wallet_address TEXT NOT NULL,
  tx_hash TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed'))
);

-- Add node health tracking columns
ALTER TABLE public.node_installations 
ADD COLUMN IF NOT EXISTS uptime_seconds BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS connection_quality INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS sync_progress INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS blocks_synced BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_block_height BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS peer_count INTEGER DEFAULT 0;

-- Add price tracking
CREATE TABLE public.token_price (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  price NUMERIC NOT NULL DEFAULT 0.0000001,
  total_supply NUMERIC NOT NULL DEFAULT 100000000000,
  circulating_supply NUMERIC NOT NULL DEFAULT 0,
  burned_total NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert initial price
INSERT INTO public.token_price (price, total_supply, circulating_supply, burned_total)
VALUES (0.0000001, 100000000000, 0, 0);

-- Enable RLS
ALTER TABLE public.token_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_price ENABLE ROW LEVEL SECURITY;

-- Token operations policies
CREATE POLICY "Admins can manage token operations"
ON public.token_operations
FOR ALL
USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view confirmed operations"
ON public.token_operations
FOR SELECT
USING (status = 'confirmed');

-- Token price policies
CREATE POLICY "Anyone can view token price"
ON public.token_price
FOR SELECT
USING (true);

CREATE POLICY "Only founders can update price"
ON public.token_price
FOR UPDATE
USING (has_role(auth.uid(), 'founder'::app_role));

-- Enable realtime for transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;