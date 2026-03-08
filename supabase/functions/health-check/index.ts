import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function checkEndpoint(
  url: string,
  options: { timeout?: number; method?: string } = {}
): Promise<{ reachable: boolean; latency: number; error?: string }> {
  const start = Date.now();
  const timeout = options.timeout || 5000;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      method: options.method || "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { reachable: res.ok || res.status < 500, latency: Date.now() - start };
  } catch (e: any) {
    return { reachable: false, latency: Date.now() - start, error: e.message };
  }
}

async function checkRPC(url: string): Promise<{ reachable: boolean; latency: number; blockNumber?: string; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    return {
      reachable: !!data.result,
      latency: Date.now() - start,
      blockNumber: data.result,
    };
  } catch (e: any) {
    return { reachable: false, latency: Date.now() - start, error: e.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Database check
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const dbStart = Date.now();
    const { error: dbError } = await sb.from("profiles").select("id").limit(1);
    const dbCheck = {
      reachable: !dbError,
      latency: Date.now() - dbStart,
      error: dbError?.message,
    };

    // 2. RPC checks (parallel)
    const rpcEndpoints = [
      "https://rpc.netlifegy.com",
      "https://rpc2.netlifegy.com",
      "https://rpc3.netlifegy.com",
    ];

    const rpcChecks = await Promise.all(rpcEndpoints.map((url) => checkRPC(url).then((r) => ({ url, ...r }))));

    // 3. WebSocket check (HTTP upgrade test)
    const wsCheck = await checkEndpoint("https://ws.netlifegy.com", { timeout: 5000 });

    // 4. Explorer check
    const explorerCheck = await checkEndpoint("https://explorer.netlifegy.com", { timeout: 5000 });

    // 5. VPN endpoint check (ICMP not available, so just DNS/TCP test)
    const vpnCheck = await checkEndpoint("https://vpn.netlifegy.com", { timeout: 3000 });

    // 6. Testnet RPC
    const testnetCheck = await checkRPC("https://testnet-rpc.netlifegy.com");

    const allRpcOk = rpcChecks.some((r) => r.reachable);
    const overallHealthy = dbCheck.reachable && allRpcOk;

    const result = {
      status: overallHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      chain_id: 13370,
      components: {
        database: dbCheck,
        rpc: rpcChecks,
        websocket: { url: "wss://ws.netlifegy.com", ...wsCheck },
        explorer: { url: "https://explorer.netlifegy.com", ...explorerCheck },
        vpn: { url: "vpn.netlifegy.com", ...vpnCheck },
        testnet: { url: "https://testnet-rpc.netlifegy.com", ...testnetCheck },
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: overallHealthy ? 200 : 503,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ status: "error", error: e.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
