// Protocol-level replay protection for wallet-login nonces.
//
// Guarantees:
//   • Every issued nonce expires after NONCE_TTL_MS (stale nonces rejected).
//   • Every nonce is single-use — once consumed, replays are rejected for
//     REPLAY_MEMORY_MS even after the underlying store forgets it.
//   • A signature bound to an already-consumed nonce is rejected the same way,
//     which blocks classic replay attacks (attacker resubmits captured payload).
//
// The module is pure and dependency-free so it can be unit-tested without
// spinning up Express, a database, or an ethers signer.

export const NONCE_TTL_MS = 5 * 60_000;          // 5 minutes to sign
export const REPLAY_MEMORY_MS = 10 * 60_000;     // remember consumed nonces 10 min

type IssuedNonce = { nonce: string; issuedAt: number };
type ConsumedNonce = { at: number };

const issued = new Map<string, IssuedNonce>();       // address → active nonce
const consumed = new Map<string, ConsumedNonce>();   // `${address}:${nonce}` → seen-at

const key = (address: string, nonce: string) => `${address.toLowerCase()}:${nonce}`;

/** Remove entries older than their retention window. Called opportunistically. */
export function sweep(now: number = Date.now()): void {
  for (const [addr, v] of issued) {
    if (now - v.issuedAt > NONCE_TTL_MS) issued.delete(addr);
  }
  for (const [k, v] of consumed) {
    if (now - v.at > REPLAY_MEMORY_MS) consumed.delete(k);
  }
}

/** Register a freshly-minted nonce for an address. Overwrites any prior nonce. */
export function issueNonce(address: string, nonce: string, now: number = Date.now()): void {
  sweep(now);
  issued.set(address.toLowerCase(), { nonce, issuedAt: now });
}

export type NonceCheck =
  | { ok: true }
  | { ok: false; reason: "unknown" | "stale" | "mismatch" | "replayed" };

/**
 * Verify a nonce being presented for consumption.
 *   • unknown  — no active nonce for this address (never issued, or already consumed).
 *   • stale    — nonce was issued but is past NONCE_TTL_MS.
 *   • mismatch — a different nonce is active (client submitted an older one).
 *   • replayed — this exact nonce was already consumed within REPLAY_MEMORY_MS.
 * On ok:true the caller MUST call consumeNonce() after signature verification.
 */
export function checkNonce(address: string, nonce: string, now: number = Date.now()): NonceCheck {
  sweep(now);
  const addr = address.toLowerCase();
  if (consumed.has(key(addr, nonce))) return { ok: false, reason: "replayed" };
  const active = issued.get(addr);
  if (!active) return { ok: false, reason: "unknown" };
  if (now - active.issuedAt > NONCE_TTL_MS) return { ok: false, reason: "stale" };
  if (active.nonce !== nonce) return { ok: false, reason: "mismatch" };
  return { ok: true };
}

/** Mark a nonce as consumed. Idempotent. Call after signature verification succeeds. */
export function consumeNonce(address: string, nonce: string, now: number = Date.now()): void {
  const addr = address.toLowerCase();
  consumed.set(key(addr, nonce), { at: now });
  issued.delete(addr);
}

/** Test-only: wipe all in-memory state. */
export function _resetNonceGuardForTests(): void {
  issued.clear();
  consumed.clear();
}
