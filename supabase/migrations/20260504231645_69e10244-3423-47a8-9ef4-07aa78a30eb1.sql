-- AI Security events table
CREATE TABLE IF NOT EXISTS public.ai_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  model TEXT,
  action TEXT NOT NULL DEFAULT 'flagged' CHECK (action IN ('allowed','blocked','flagged','review')),
  subject_user_id UUID,
  subject_address TEXT,
  source TEXT NOT NULL DEFAULT 'edge'
);

CREATE INDEX IF NOT EXISTS idx_ai_security_events_created_at ON public.ai_security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_security_events_severity ON public.ai_security_events (severity);
CREATE INDEX IF NOT EXISTS idx_ai_security_events_subject_user ON public.ai_security_events (subject_user_id);

ALTER TABLE public.ai_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Founders/admins read ai_security_events" ON public.ai_security_events;
CREATE POLICY "Founders/admins read ai_security_events"
  ON public.ai_security_events FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Founders/admins insert ai_security_events" ON public.ai_security_events;
CREATE POLICY "Founders/admins insert ai_security_events"
  ON public.ai_security_events FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'founder') OR public.has_role(auth.uid(), 'admin')
  );

-- Seed default ai_security config row (only if missing).
INSERT INTO public.admin_config (config_key, config_value)
SELECT 'ai_security', jsonb_build_object(
  'enabled', true,
  'model', 'google/gemini-3-flash-preview',
  'sensitivity', 'medium',
  'block_on_critical', true,
  'monitored_categories', jsonb_build_array(
    'admin_command','wallet_send','token_burn','token_mint','bridge','swap','auth_login','prompt_injection'
  ),
  'override_role', 'founder'
)
WHERE NOT EXISTS (SELECT 1 FROM public.admin_config WHERE config_key = 'ai_security');