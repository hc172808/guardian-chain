
-- Smart contract templates (pre-built by admin)
CREATE TABLE public.contract_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'token',
  solidity_code TEXT NOT NULL,
  abi JSONB DEFAULT '[]'::jsonb,
  parameters JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User-deployed smart contracts
CREATE TABLE public.smart_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  source_code TEXT NOT NULL,
  abi JSONB DEFAULT '[]'::jsonb,
  bytecode TEXT,
  contract_address TEXT,
  constructor_args JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  deploy_tx_hash TEXT,
  deployed_at TIMESTAMP WITH TIME ZONE,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Feature toggles table
CREATE TABLE public.feature_toggles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_key TEXT NOT NULL UNIQUE,
  feature_name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  admin_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default feature toggles
INSERT INTO public.feature_toggles (feature_key, feature_name, description, is_enabled) VALUES
  ('smart_contracts', 'Smart Contracts', 'Allow users to create and deploy smart contracts', true),
  ('token_factory', 'Token Factory', 'Allow users to create custom tokens', true),
  ('defi_swap', 'DeFi Swap', 'Allow users to swap tokens', true),
  ('defi_bridge', 'Cross-Chain Bridge', 'Allow users to bridge tokens', true),
  ('defi_stake', 'Staking', 'Allow users to stake tokens', true),
  ('defi_pools', 'Liquidity Pools', 'Allow users to create and manage pools', true),
  ('launchpad', 'Launchpad', 'Allow users to launch tokens via launchpad', true),
  ('mining', 'Mining', 'Allow users to participate in mining', true),
  ('token_authorities', 'Token Authorities', 'Allow token creators to use freeze/mint/update authorities', true),
  ('hosted_sites', 'Hosted Token Sites', 'Allow users to host websites for their tokens', true);

-- RLS for contract_templates
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active templates" ON public.contract_templates
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage templates" ON public.contract_templates
  FOR ALL USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS for smart_contracts
ALTER TABLE public.smart_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contracts" ON public.smart_contracts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create contracts" ON public.smart_contracts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contracts" ON public.smart_contracts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own draft contracts" ON public.smart_contracts
  FOR DELETE USING (auth.uid() = user_id AND status = 'draft');

CREATE POLICY "Admins can manage all contracts" ON public.smart_contracts
  FOR ALL USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS for feature_toggles
ALTER TABLE public.feature_toggles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view feature toggles" ON public.feature_toggles
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage feature toggles" ON public.feature_toggles
  FOR ALL USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
