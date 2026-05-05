// Server-side faucet with hard 24h cooldown enforced in DB.
// Cannot be bypassed by clearing localStorage.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const COOLDOWN_HOURS = 24;
const FAUCET_AMOUNTS: Record<'gyd' | 'gyds', number> = { gyd: 100, gyds: 0.5 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const tokenType = body?.token_type as 'gyd' | 'gyds';
    const walletAddress = String(body?.wallet_address || '').trim();

    if (tokenType !== 'gyd' && tokenType !== 'gyds') {
      return json({ error: 'invalid token_type (must be gyd|gyds)' }, 400);
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return json({ error: 'invalid wallet_address' }, 400);
    }

    // Service-role client for privileged checks/inserts
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check authority kill-switch
    const { data: shutdown } = await admin
      .from('authorities')
      .select('enabled')
      .eq('id', 'emergency_shutdown')
      .maybeSingle();
    if (shutdown && shutdown.enabled === false) {
      return json({ error: 'chain_halted' }, 423);
    }

    const cooldownCutoff = new Date(
      Date.now() - COOLDOWN_HOURS * 3600 * 1000
    ).toISOString();

    // Cooldown check by user
    const { data: recentByUser } = await admin
      .from('faucet_claims')
      .select('created_at')
      .eq('user_id', userId)
      .eq('token_type', tokenType)
      .gte('created_at', cooldownCutoff)
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentByUser && recentByUser.length > 0) {
      const next = new Date(
        new Date(recentByUser[0].created_at).getTime() + COOLDOWN_HOURS * 3600 * 1000
      );
      return json(
        { error: 'cooldown_active', next_available_at: next.toISOString() },
        429
      );
    }

    // Cooldown check by wallet (prevents account-hopping)
    const { data: recentByWallet } = await admin
      .from('faucet_claims')
      .select('created_at')
      .eq('wallet_address', walletAddress)
      .eq('token_type', tokenType)
      .gte('created_at', cooldownCutoff)
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentByWallet && recentByWallet.length > 0) {
      const next = new Date(
        new Date(recentByWallet[0].created_at).getTime() + COOLDOWN_HOURS * 3600 * 1000
      );
      return json(
        { error: 'cooldown_active_wallet', next_available_at: next.toISOString() },
        429
      );
    }

    const amount = FAUCET_AMOUNTS[tokenType];
    const txHash = `0xfaucet-${Date.now().toString(16)}-${crypto.randomUUID().slice(0, 8)}`;
    const opType = tokenType === 'gyd' ? 'mint_gyd' : 'mint_gyds';
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      null;

    // Record the claim FIRST (cooldown anchor)
    const { error: claimErr } = await admin.from('faucet_claims').insert({
      user_id: userId,
      wallet_address: walletAddress,
      token_type: tokenType,
      amount,
      ip_address: ip,
      tx_hash: txHash,
    });
    if (claimErr) throw claimErr;

    // Then credit the wallet via token_operations
    const { error: opErr } = await admin.from('token_operations').insert({
      operation_type: opType,
      amount,
      wallet_address: walletAddress,
      tx_hash: txHash,
      status: 'confirmed',
      created_by: userId,
    });
    if (opErr) throw opErr;

    return json({
      ok: true,
      amount,
      token_type: tokenType,
      tx_hash: txHash,
      next_available_at: new Date(Date.now() + COOLDOWN_HOURS * 3600 * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[faucet-claim]', err);
    return json({ error: (err as Error).message || 'server_error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
