// Admin-only health check for the saved GYDS_INDEXER_DB_URL secret.
// Never returns or logs the connection string, host, user or password.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import postgres from 'npm:postgres@3.4.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Strip anything that could echo the secret back in an error message.
function scrub(msg: string, secret: string): string {
  let out = msg;
  try {
    const u = new URL(secret);
    for (const part of [secret, u.password, u.username, u.hostname, decodeURIComponent(u.password)]) {
      if (part) out = out.split(part).join('***');
    }
  } catch { out = out.split(secret).join('***'); }
  return out.replace(/postgres(ql)?:\/\/\S+/gi, 'postgresql://***').slice(0, 300);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) return json(401, { ok: false, error: 'Not authenticated' });

  const admin = createClient(SUPABASE_URL, SERVICE);
  const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', u.user.id);
  const isAdmin = (roles ?? []).some((r: { role: string }) => ['admin', 'founder'].includes(String(r.role)));
  if (!isAdmin) return json(403, { ok: false, error: 'Admin access required' });

  const url = Deno.env.get('GYDS_INDEXER_DB_URL');
  if (!url) return json(200, { ok: false, configured: false, error: 'GYDS_INDEXER_DB_URL is not set' });

  const started = Date.now();
  let sql: ReturnType<typeof postgres> | null = null;
  try {
    sql = postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 2, prepare: false, onnotice: () => {} });
    // Read-only, side-effect-free checks.
    const [row] = await sql`select 1 as ok, current_setting('server_version') as version,
      current_database() as database, pg_is_in_recovery() as replica`;
    const [tx] = await sql`select current_setting('transaction_read_only') as read_only`;
    return json(200, {
      ok: row?.ok === 1,
      configured: true,
      latency_ms: Date.now() - started,
      server_version: row?.version,
      database: row?.database,
      replica: row?.replica,
      read_only: tx?.read_only === 'on',
      checked_at: new Date().toISOString(),
    });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return json(200, {
      ok: false, configured: true, latency_ms: Date.now() - started,
      error_code: err.code ?? null, error: scrub(String(err.message ?? e), url),
    });
  } finally {
    try { await sql?.end({ timeout: 2 }); } catch { /* ignore */ }
  }
});
