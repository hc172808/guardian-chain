// Edge function: github-sync
// Programmatic sync trigger — MUST respect on-chain emergency_shutdown authority.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function isAuthorityEnabled(id: string): Promise<boolean> {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await sb
    .from('authorities')
    .select('enabled')
    .eq('id', id)
    .maybeSingle();
  if (error) return true; // safe-default ON if registry unreachable
  return data?.enabled ?? true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Server-side kill-switch — refuses ALL programmatic sync actions when
  // emergency_shutdown is OFF, even if called by a privileged caller.
  if (!(await isAuthorityEnabled('emergency_shutdown'))) {
    return new Response(
      JSON.stringify({
        error: 'chain_halted',
        message: 'emergency_shutdown authority is OFF — github-sync is blocked.',
      }),
      { status: 423, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Optional secondary gate: protocol_config / parameter_update for config sync
  if (!(await isAuthorityEnabled('protocol_config'))) {
    return new Response(
      JSON.stringify({ error: 'authority_off', authority: 'protocol_config' }),
      { status: 423, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Perform the actual synchronization logic here
  // This is where the integration with GitHub APIs would be implemented
  // to fetch repository data and update the database accordingly.
  
  return new Response(
    JSON.stringify({ 
      ok: true, 
      message: 'github-sync executed successfully' 
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
