-- Create wallets table for user wallet management
CREATE TABLE public.wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  address TEXT NOT NULL,
  encrypted_seed TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, address)
);

-- Enable RLS
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- Wallet policies
CREATE POLICY "Users can view their own wallets" 
ON public.wallets FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own wallets" 
ON public.wallets FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wallets" 
ON public.wallets FOR DELETE 
USING (auth.uid() = user_id);

-- Add approval fields to node_installations
ALTER TABLE public.node_installations 
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- Create documentation table for editable guides
CREATE TABLE public.documentation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_by UUID REFERENCES auth.users,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.documentation ENABLE ROW LEVEL SECURITY;

-- Everyone can read documentation
CREATE POLICY "Anyone can view documentation" 
ON public.documentation FOR SELECT 
USING (true);

-- Only founders/admins can edit documentation
CREATE POLICY "Admins can update documentation" 
ON public.documentation FOR UPDATE 
USING (public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert documentation" 
ON public.documentation FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_documentation_updated_at
BEFORE UPDATE ON public.documentation
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for wallets updated_at on node_installations
CREATE TRIGGER update_node_installations_updated_at
BEFORE UPDATE ON public.node_installations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Allow admins to view all node installations for approval
CREATE POLICY "Admins can view all installations" 
ON public.node_installations FOR SELECT 
USING (public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin'));

-- Allow admins to update installations (for approval)
CREATE POLICY "Admins can update all installations" 
ON public.node_installations FOR UPDATE 
USING (public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin'));

-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles FOR SELECT 
USING (public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin'));

-- Insert default documentation entries
INSERT INTO public.documentation (slug, title, content) VALUES
('blockchain-core', 'Blockchain Core', '# Blockchain Core\n\nThe ChainCore blockchain is a hybrid PoS/PoW system built in Go.\n\n## Features\n- State management with LevelDB\n- Transaction pool with priority ordering\n- Block validation and chain reorganization\n\n## Installation\n```bash\ngo build -o chaincore cmd/fullnode/main.go\n```'),
('pos-consensus', 'PoS Consensus', '# Proof of Stake Consensus\n\nChainCore uses PoS for block finality and validator selection.\n\n## Validator Requirements\n- Minimum stake: 10,000 CORE\n- Uptime requirement: 99%+\n- Slashing for double-signing\n\n## Block Production\nValidators are selected proportional to stake weight.'),
('mining-system', 'Mining System', '# Mining System\n\nMining is for reward distribution only - it does not affect consensus.\n\n## Block Time\n- Target: 120 seconds\n- Minimum share interval: 5 seconds\n\n## Anti-Bot Protection\n- Human score calculation\n- Rate limiting per address\n- Session caps'),
('rpc-server', 'RPC Server', '# RPC Server\n\nFull nodes expose JSON-RPC endpoints for lite nodes.\n\n## Endpoints\n- `eth_blockNumber` - Latest block\n- `eth_getBalance` - Account balance\n- `eth_sendTransaction` - Submit transaction\n\n## Default Port: 8546');
