
-- Firewall rules table
CREATE TABLE public.firewall_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_type TEXT NOT NULL DEFAULT 'ufw',
  action TEXT NOT NULL DEFAULT 'allow',
  protocol TEXT NOT NULL DEFAULT 'tcp',
  port TEXT,
  ip_address TEXT,
  direction TEXT NOT NULL DEFAULT 'in',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.firewall_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage firewall rules"
  ON public.firewall_rules FOR ALL
  USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view firewall rules"
  ON public.firewall_rules FOR SELECT
  USING (true);

-- Fail2Ban jails table
CREATE TABLE public.fail2ban_jails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jail_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  max_retries INTEGER NOT NULL DEFAULT 5,
  ban_time INTEGER NOT NULL DEFAULT 3600,
  find_time INTEGER NOT NULL DEFAULT 600,
  log_path TEXT,
  filter_name TEXT,
  action TEXT DEFAULT 'iptables-multiport',
  description TEXT,
  banned_ips TEXT[] DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fail2ban_jails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage fail2ban jails"
  ON public.fail2ban_jails FOR ALL
  USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view fail2ban jails"
  ON public.fail2ban_jails FOR SELECT
  USING (true);

-- IP whitelist/blacklist
CREATE TABLE public.ip_access_list (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL,
  list_type TEXT NOT NULL DEFAULT 'whitelist',
  reason TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ip_access_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage IP access list"
  ON public.ip_access_list FOR ALL
  USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view IP access list"
  ON public.ip_access_list FOR SELECT
  USING (true);
