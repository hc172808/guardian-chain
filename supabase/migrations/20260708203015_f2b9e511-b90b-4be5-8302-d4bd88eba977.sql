
-- 1. Restrict public read on security config tables
DROP POLICY IF EXISTS "Anyone can view DDoS protection" ON public.ddos_protection;
DROP POLICY IF EXISTS "Anyone can view fail2ban jails" ON public.fail2ban_jails;
DROP POLICY IF EXISTS "Anyone can view firewall rules" ON public.firewall_rules;
DROP POLICY IF EXISTS "Anyone can view IP access list" ON public.ip_access_list;
DROP POLICY IF EXISTS "Anyone can view rate limit rules" ON public.rate_limit_rules;

CREATE POLICY "Admins can view DDoS protection" ON public.ddos_protection
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view fail2ban jails" ON public.fail2ban_jails
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view firewall rules" ON public.firewall_rules
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view IP access list" ON public.ip_access_list
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view rate limit rules" ON public.rate_limit_rules
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 2. Duplicate policy on validator_delegations
DROP POLICY IF EXISTS "Anyone can view delegation counts" ON public.validator_delegations;

-- 3. Storage buckets: owner-only mutations, add DELETE policy
DROP POLICY IF EXISTS "Users can update their token logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload token logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload token sites" ON storage.objects;

CREATE POLICY "Users can upload token logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'token-logos' AND owner = auth.uid());
CREATE POLICY "Owners can update their token logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'token-logos' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'token-logos' AND owner = auth.uid());
CREATE POLICY "Owners can delete their token logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'token-logos' AND owner = auth.uid());

CREATE POLICY "Users can upload token sites" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'token-sites' AND owner = auth.uid());
CREATE POLICY "Owners can update their token sites" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'token-sites' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'token-sites' AND owner = auth.uid());
CREATE POLICY "Owners can delete their token sites" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'token-sites' AND owner = auth.uid());

-- 4. Revoke public execute on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
-- has_role stays executable by 'authenticated' because RLS policies invoke it as the caller.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
