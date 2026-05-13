
-- Staking delegations table
CREATE TABLE public.validator_delegations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  validator_id UUID NOT NULL REFERENCES public.network_validators(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  delegated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  undelegated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.validator_delegations ENABLE ROW LEVEL SECURITY;

-- Users can view their own delegations
CREATE POLICY "Users can view own delegations"
  ON public.validator_delegations FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create delegations
CREATE POLICY "Users can create delegations"
  ON public.validator_delegations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update own delegations (for undelegating)
CREATE POLICY "Users can update own delegations"
  ON public.validator_delegations FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all delegations
CREATE POLICY "Admins can view all delegations"
  ON public.validator_delegations FOR SELECT
  USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Anyone can view aggregate delegation stats (for validator display)
CREATE POLICY "Anyone can view delegation counts"
  ON public.validator_delegations FOR SELECT
  USING (true);
