// Aggregates network stats from Supabase. Always returns JSON (never HTML).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const HEARTBEAT_FRESH_SECS = 90;
    const cutoff = new Date(Date.now() - HEARTBEAT_FRESH_SECS * 1000).toISOString();

    const [validators, miners, txCount, liveNodes, tokens] = await Promise.all([
      supabase.from("network_validators").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("node_installations").select("id", { count: "exact", head: true }).eq("is_online", true),
      supabase.from("transactions").select("id", { count: "exact", head: true }),
      supabase
        .from("node_installations")
        .select("hash_rate, last_heartbeat")
        .eq("is_online", true)
        .eq("is_approved", true)
        .gte("last_heartbeat", cutoff),
      supabase.from("tokens").select("id", { count: "exact", head: true }),
    ]);

    const live = liveNodes.data ?? [];
    const totalHashrate = live.reduce((s: number, n: any) => s + (Number(n.hash_rate) || 0), 0);

    return json({
      ok: true,
      timestamp: new Date().toISOString(),
      chainId: 198282,
      stats: {
        activeValidators: validators.count ?? 0,
        activeMiners: miners.count ?? 0,
        totalTransactions: txCount.count ?? 0,
        totalTokens: tokens.count ?? 0,
        liveNodes: live.length,
        networkHashRateThps: totalHashrate / 1e12,
        posFinality: 99.99,
      },
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
