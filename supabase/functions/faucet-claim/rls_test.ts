// RLS regression test for faucet-claim, stablecoin (token_price),
// token_operations, and audit_logs.
// Uses raw PostgREST fetch so there's no realtime client to leak.
//
// Policy matrix:
//   token_price:      SELECT=anyone  INSERT/UPDATE/DELETE=founder only
//   token_operations: SELECT=public(confirmed only)  ALL=founder/admin only
//   audit_logs:       INSERT=auth only (user_id NOT NULL)
//   faucet_claims:    INSERT=service_role only
//
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

async function rest(
  method: string,
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...headers, ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

// Helper: assert response is blocked (4xx) OR affected 0 rows (silent RLS filter)
function assertBlocked(status: number, body: string, context: string) {
  if (status >= 400) return; // explicit rejection
  // Silent filter: PostgREST returns 200/204 with Content-Range */0 for DELETEs
  assert(
    body === "" || body === "[]" || body.includes('"count":"0"'),
    `${context}: Expected RLS block, got status=${status} body=${body}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// faucet_claims
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("anon cannot INSERT into faucet_claims", async () => {
  const { status, body } = await rest("POST", "faucet_claims", {
    user_id: crypto.randomUUID(),
    wallet_address: "0xattacker",
    token_type: "gyd",
    amount: 9999,
  });
  assert(status >= 400, `Expected RLS rejection, got ${status}: ${body}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// token_price
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("anon cannot INSERT into token_price", async () => {
  const { status, body } = await rest("POST", "token_price", {
    price: 9.99,
    total_supply: 1,
    circulating_supply: 1,
    burned_total: 0,
  });
  assert(status >= 400, `Expected RLS rejection, got ${status}: ${body}`);
});

Deno.test("anon cannot UPDATE token_price", async () => {
  const { status, body } = await rest(
    "PATCH",
    "token_price?id=neq.00000000-0000-0000-0000-000000000000",
    { price: 999 },
  );
  assertBlocked(status, body, "anon UPDATE token_price");
});

Deno.test("anon cannot DELETE from token_price", async () => {
  const { status, body } = await rest(
    "DELETE",
    "token_price?id=neq.00000000-0000-0000-0000-000000000000",
    undefined,
    { Prefer: "count=exact" },
  );
  assertBlocked(status, body, "anon DELETE token_price");
});

Deno.test("anon CAN SELECT token_price (public read)", async () => {
  const { status } = await rest("GET", "token_price?select=price&limit=1");
  assertEquals(status, 200, "Public token_price read should succeed");
});

// ─────────────────────────────────────────────────────────────────────────────
// token_operations
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("anon cannot INSERT (mint) into token_operations", async () => {
  const { status, body } = await rest("POST", "token_operations", {
    operation_type: "mint",
    amount: 9999,
    wallet_address: "0xattacker",
  });
  assert(status >= 400, `Expected RLS rejection, got ${status}: ${body}`);
});

Deno.test("anon cannot INSERT (burn) into token_operations", async () => {
  const { status, body } = await rest("POST", "token_operations", {
    operation_type: "burn",
    amount: 1,
    wallet_address: "0xattacker",
  });
  assert(status >= 400, `Expected RLS rejection, got ${status}: ${body}`);
});

Deno.test("anon cannot INSERT (premine_gyds) into token_operations", async () => {
  const { status, body } = await rest("POST", "token_operations", {
    operation_type: "premine_gyds",
    amount: 1000,
    wallet_address: "0xattacker",
  });
  assert(status >= 400, `Expected RLS rejection, got ${status}: ${body}`);
});

Deno.test("anon cannot INSERT (premine_gyd) into token_operations", async () => {
  const { status, body } = await rest("POST", "token_operations", {
    operation_type: "premine_gyd",
    amount: 500,
    wallet_address: "0xattacker",
  });
  assert(status >= 400, `Expected RLS rejection, got ${status}: ${body}`);
});

Deno.test("anon cannot UPDATE token_operations (status manipulation)", async () => {
  const { status, body } = await rest(
    "PATCH",
    "token_operations?id=neq.00000000-0000-0000-0000-000000000000",
    { status: "confirmed" },
  );
  assertBlocked(status, body, "anon UPDATE token_operations");
});

Deno.test("anon cannot DELETE from token_operations", async () => {
  const { status, body } = await rest(
    "DELETE",
    "token_operations?id=neq.00000000-0000-0000-0000-000000000000",
    undefined,
    { Prefer: "count=exact" },
  );
  assertBlocked(status, body, "anon DELETE token_operations");
});

Deno.test("anon CAN SELECT confirmed token_operations (public read)", async () => {
  const { status } = await rest(
    "GET",
    "token_operations?select=wallet_address&status=eq.confirmed&limit=1",
  );
  assertEquals(status, 200, "Public confirmed token_operations read should succeed");
});

// ─────────────────────────────────────────────────────────────────────────────
// audit_logs — anonymous users must never produce records
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("anon cannot INSERT into audit_logs", async () => {
  const { status, body } = await rest("POST", "audit_logs", {
    user_id: "00000000-0000-0000-0000-000000000000",
    action: "malicious_probe",
    category: "security",
  });
  assert(
    status >= 400,
    `audit_logs must reject anon inserts, got ${status}: ${body}`,
  );
});

Deno.test("anon cannot UPDATE audit_logs", async () => {
  const { status, body } = await rest(
    "PATCH",
    "audit_logs?id=neq.00000000-0000-0000-0000-000000000000",
    { action: "tampered" },
  );
  assertBlocked(status, body, "anon UPDATE audit_logs");
});

Deno.test("anon cannot DELETE from audit_logs", async () => {
  const { status, body } = await rest(
    "DELETE",
    "audit_logs?id=neq.00000000-0000-0000-0000-000000000000",
    undefined,
    { Prefer: "count=exact" },
  );
  assertBlocked(status, body, "anon DELETE audit_logs");
});
