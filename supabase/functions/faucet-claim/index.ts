// Faucet claim — server-side enforcement of 24h cooldown per (user, token_type).
// Bypasses RLS via service role; logs in faucet_claims + token_operations.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const AMOUNTS: Record<string, number> = { gyd: 100, gyds: 0.5 };
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json(401, { ok: false, error: 'Not authenticated' });
    const user = userRes.user;

    const body = await req.json().catch(() => ({}));
    const tokenType = String(body.token_type ?? '').toLowerCase();
    const walletAddress = String(body.wallet_address ?? '').trim();
    if (!AMOUNTS[tokenType]) return json(400, { ok: false, error: 'Invalid token_type (gyd|gyds)' });
    if (!walletAddress) return json(400, { ok: false, error: 'wallet_address required' });

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Cooldown check
    const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
    const { data: recent, error: recentErr } = await admin
      .from('faucet_claims')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('token_type', tokenType)
      .gte('created_at', since)
      .limit(1);
    if (recentErr) return json(500, { ok: false, error: recentErr.message });
    if (recent && recent.length > 0) {
      const next = new Date(new Date(recent[0].created_at).getTime() + COOLDOWN_MS).toISOString();
      return json(429, { ok: false, error: 'Cooldown active', next_claim_at: next });
    }

    const amount = AMOUNTS[tokenType];
    const txHash = `0xfaucet-${tokenType}-${Date.now().toString(16)}-${crypto.randomUUID().slice(0, 8)}`;

    const { error: claimErr } = await admin.from('faucet_claims').insert({
      user_id: user.id,
      wallet_address: walletAddress,
      token_type: tokenType,
      amount,
      tx_hash: txHash,
      ip_address: req.headers.get('x-forwarded-for') ?? null,
    });
    if (claimErr) return json(500, { ok: false, error: `claim insert: ${claimErr.message}` });

    const { error: opErr } = await admin.from('token_operations').insert({
      operation_type: tokenType === 'gyd' ? 'mint_gyd' : 'mint_gyds',
      amount,
      wallet_address: walletAddress,
      tx_hash: txHash,
      status: 'confirmed',
      created_by: user.id,
    });
    if (opErr) return json(500, { ok: false, error: `op insert: ${opErr.message}` });

    return json(200, { ok: true, tx_hash: txHash, amount, token_type: tokenType });
  } catch (e) {
    return json(500, { ok: false, error: e instanceof Error ? e.message : 'Unknown error' });
  }
});
