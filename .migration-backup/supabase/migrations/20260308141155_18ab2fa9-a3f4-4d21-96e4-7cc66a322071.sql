
-- Rate limiting rules table
CREATE TABLE public.rate_limit_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  requests_per_window INTEGER NOT NULL DEFAULT 100,
  window_seconds INTEGER NOT NULL DEFAULT 60,
  burst_limit INTEGER NOT NULL DEFAULT 20,
  action TEXT NOT NULL DEFAULT 'throttle',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limit_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage rate limit rules"
  ON public.rate_limit_rules FOR ALL
  USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view rate limit rules"
  ON public.rate_limit_rules FOR SELECT
  USING (true);

-- DDoS protection config table
CREATE TABLE public.ddos_protection (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  protection_type TEXT NOT NULL DEFAULT 'syn_flood',
  threshold INTEGER NOT NULL DEFAULT 1000,
  action TEXT NOT NULL DEFAULT 'drop',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  parameters JSONB DEFAULT '{}',
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ddos_protection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage DDoS protection"
  ON public.ddos_protection FOR ALL
  USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view DDoS protection"
  ON public.ddos_protection FOR SELECT
  USING (true);
