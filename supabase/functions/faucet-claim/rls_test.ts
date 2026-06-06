// RLS regression test: confirms anonymous users cannot directly INSERT into
// faucet_claims or INSERT/DELETE token_price. Only service_role (used by the
// faucet-claim edge function) or founders may write.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const opts = { sanitizeResources: false, sanitizeOps: false };
const anon = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 1 } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

Deno.test("anon cannot INSERT into faucet_claims", opts, async () => {
  const { error } = await anon().from("faucet_claims").insert({
    user_id: crypto.randomUUID(),
    wallet_address: "0xattacker",
    token_type: "gyd",
    amount: 9999,
  });
  assert(error, "Expected RLS error on anonymous faucet_claims insert");
});

Deno.test("anon cannot INSERT into token_price", opts, async () => {
  const { error } = await anon().from("token_price").insert({
    price: 9.99,
    total_supply: 1,
    circulating_supply: 1,
    burned_total: 0,
  });
  assert(error, "Expected RLS error on anonymous token_price insert");
});

Deno.test("anon cannot DELETE from token_price", opts, async () => {
  const { error, count } = await anon()
    .from("token_price")
    .delete({ count: "exact" })
    .neq("id", "00000000-0000-0000-0000-000000000000");
  assert(error || count === 0, "Expected anonymous delete to be blocked");
});

Deno.test("anon CAN SELECT token_price (public read)", opts, async () => {
  const { error } = await anon().from("token_price").select("price").limit(1);
  assertEquals(error, null, "Public token_price read should succeed");
});
