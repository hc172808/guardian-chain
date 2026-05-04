// Public bootnodes endpoint — `GET /functions/v1/bootnodes` returns a JSON
// document with the current set of trusted bootnodes per network so that
// `install-fullnode.sh` / `install-litenode.sh` can `curl` it on first boot.
//
// Source of truth: `admin_config.bootnodes` (managed by founders via the
// admin UI). Falls back to a hard-coded baked-in list per network so that
// nodes can still bootstrap even if the database row is missing.
//
// Response shape (stable):
// {
//   "version": 1,
//   "generated_at": "<ISO timestamp>",
//   "networks": {
//     "mainnet": { "chain_id": 13370, "bootnodes": ["enode://..."] },
//     "testnet": { "chain_id": 13371, "bootnodes": ["enode://..."] },
//     "devnet":  { "chain_id": 13372, "bootnodes": ["enode://..."] }
//   }
// }
//
// Query params:
//   ?network=mainnet|testnet|devnet  → returns only that network's bootnode list

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const FALLBACK = {
  mainnet: {
    chain_id: 13370,
    bootnodes: [
      'enode://0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000@bootnode.netlifegy.com:30301',
    ],
  },
  testnet: {
    chain_id: 13371,
    bootnodes: [
      'enode://1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111@testnet-bootnode.netlifegy.com:30301',
    ],
  },
  devnet: {
    chain_id: 13372,
    bootnodes: [
      'enode://2222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222@devnet-bootnode.netlifegy.com:30301',
    ],
  },
};

type NetworkKey = keyof typeof FALLBACK;
const VALID_NETWORKS: NetworkKey[] = ['mainnet', 'testnet', 'devnet'];

function isEnode(s: unknown): s is string {
  return typeof s === 'string' && /^enode:\/\/[0-9a-fA-F]{128}@[^:]+:\d+$/.test(s);
}

function normalize(raw: unknown): typeof FALLBACK | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: any = {};
  for (const net of VALID_NETWORKS) {
    const entry = (raw as any)[net];
    if (entry && typeof entry === 'object') {
      const list = Array.isArray(entry.bootnodes) ? entry.bootnodes.filter(isEnode) : [];
      out[net] = {
        chain_id: typeof entry.chain_id === 'number' ? entry.chain_id : FALLBACK[net].chain_id,
        bootnodes: list.length > 0 ? list : FALLBACK[net].bootnodes,
      };
    } else if (Array.isArray(entry)) {
      // Legacy shape: bootnodes stored as plain array under each network key
      const list = entry.filter(isEnode);
      out[net] = {
        chain_id: FALLBACK[net].chain_id,
        bootnodes: list.length > 0 ? list : FALLBACK[net].bootnodes,
      };
    } else {
      out[net] = FALLBACK[net];
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const networkParam = url.searchParams.get('network');
  if (networkParam && !VALID_NETWORKS.includes(networkParam as NetworkKey)) {
    return new Response(
      JSON.stringify({ error: 'invalid_network', allowed: VALID_NETWORKS }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let networks = FALLBACK as typeof FALLBACK;
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && serviceKey) {
      const sb = createClient(supabaseUrl, serviceKey);
      const { data } = await sb
        .from('admin_config')
        .select('config_value')
        .eq('config_key', 'bootnodes')
        .maybeSingle();
      const normalized = normalize(data?.config_value);
      if (normalized) networks = normalized;
    }
  } catch (e) {
    console.error('bootnodes: db read failed, falling back', e);
  }

  const body = networkParam
    ? { version: 1, generated_at: new Date().toISOString(), network: networkParam, ...networks[networkParam as NetworkKey] }
    : { version: 1, generated_at: new Date().toISOString(), networks };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      // Cache 60s at the edge so install scripts hammering it don't stress the DB
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });
});
