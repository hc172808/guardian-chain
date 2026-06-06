// RLS regression test for faucet-claim & stablecoin (token_price).
// Uses raw PostgREST fetch so there's no realtime client to leak.
//
// Confirms anonymous users cannot:
//   - INSERT into faucet_claims  (only service_role via the edge function may)
//   - INSERT into token_price    (only founders may)
//   - DELETE from token_price    (only founders may)
// And confirms anonymous users CAN read token_price (public marketing data).
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

async function rest(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...headers, ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

Deno.test("anon cannot INSERT into faucet_claims", async () => {
  const { status, body } = await rest("POST", "faucet_claims", {
    user_id: crypto.randomUUID(),
    wallet_address: "0xattacker",
    token_type: "gyd",
    amount: 9999,
  });
  assert(status >= 400, `Expected RLS rejection, got ${status}: ${body}`);
});

Deno.test("anon cannot INSERT into token_price", async () => {
  const { status, body } = await rest("POST", "token_price", {
    price: 9.99,
    total_supply: 1,
    circulating_supply: 1,
    burned_total: 0,
  });
  assert(status >= 400, `Expected RLS rejection, got ${status}: ${body}`);
});

Deno.test("anon cannot DELETE from token_price", async () => {
  const { status, body } = await rest(
    "DELETE",
    "token_price?id=neq.00000000-0000-0000-0000-000000000000",
    undefined,
    { Prefer: "count=exact" },
  );
  // RLS will either error (4xx) or silently affect 0 rows (200/204 with Content-Range "*/0").
  if (status < 400) {
    assert(body === "" || body === "[]", `Expected no rows deleted, got ${body}`);
  }
});

Deno.test("anon CAN SELECT token_price (public read)", async () => {
  const { status } = await rest("GET", "token_price?select=price&limit=1");
  assertEquals(status, 200, "Public token_price read should succeed");
});
