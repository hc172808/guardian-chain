-- 1) Recreate v_authority_summary with security_invoker so it respects caller's RLS, not view creator's
DROP VIEW IF EXISTS public.v_authority_summary;
CREATE VIEW public.v_authority_summary
WITH (security_invoker = true)
AS
SELECT category,
       count(*) AS total,
       count(*) FILTER (WHERE enabled) AS enabled_count,
       count(*) FILTER (WHERE NOT enabled) AS disabled_count
FROM public.authorities
GROUP BY category;

GRANT SELECT ON public.v_authority_summary TO authenticated;

-- 2) Lock down SECURITY DEFINER functions: revoke EXECUTE from public/anon/authenticated.
--    has_role is invoked from inside RLS policies — RLS bypasses grants, so revoke is safe.
--    handle_new_user / handle_new_user_role are trigger functions — triggers run regardless of grants.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;

-- 3) Public storage bucket listing — restrict SELECT on storage.objects so files are readable by URL
--    only when their key is known, not enumerable via list().
--    Drop any broad permissive SELECT policies for our two buckets and replace with owner-only listing.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND polcmd = 'r'
      AND (
        polname ILIKE '%token-logos%' OR
        polname ILIKE '%token-sites%' OR
        polname ILIKE '%public read%' OR
        polname ILIKE '%public access%' OR
        polname ILIKE '%anyone can%' OR
        polname ILIKE '%publicly accessible%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.polname);
  END LOOP;
END $$;

-- Owners can list their own objects (used by admin upload UIs)
CREATE POLICY "token-logos owner can list"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'token-logos' AND owner = auth.uid());

CREATE POLICY "token-sites owner can list"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'token-sites' AND owner = auth.uid());

-- Note: buckets remain public for direct URL fetches (signed/known paths still work via the storage CDN).
-- Listing/enumeration via API is now blocked unless caller owns the object.