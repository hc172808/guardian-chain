// Shared wallet-challenge verifier used by every wallet-login-related endpoint.
//
// Every endpoint that accepts a signed nonce (Web3 login, wallet password
// reset, future signature-gated actions) MUST route through this helper so
// replay/staleness protection stays consistent across the codebase.

import { ethers } from "ethers";
import { checkNonce, consumeNonce, type NonceCheck } from "./nonceGuard";

export const CHALLENGE_MESSAGE = (nonce: string) => `Sign in to ChainCore\nNonce: ${nonce}`;

export interface WalletChallengeStorage {
  getUserNonce: (address: string) => Promise<string | null | undefined>;
  clearUserNonce: (address: string) => Promise<unknown>;
}

export type WalletChallengeResult =
  | { ok: true; address: string; nonce: string }
  | { ok: false; status: number; error: string; code: string };

/**
 * Verify a wallet signature against the currently-active nonce for the
 * address. On success the nonce is cleared from persistent storage AND
 * marked as consumed in the in-process replay guard, so any later request
 * that reuses the same nonce (or its captured signature) is rejected with
 * `NONCE_REPLAYED` — even if it arrives before the storage row is cleared.
 */
export async function verifyWalletChallenge(
  rawAddress: unknown,
  signature: unknown,
  storage: WalletChallengeStorage,
): Promise<WalletChallengeResult> {
  if (typeof rawAddress !== "string" || typeof signature !== "string" || !rawAddress || !signature) {
    return { ok: false, status: 400, error: "address and signature required", code: "MISSING_FIELDS" };
  }
  const address = rawAddress.toLowerCase();
  if (!address.startsWith("0x") || address.length !== 42) {
    return { ok: false, status: 400, error: "invalid address", code: "BAD_ADDRESS" };
  }

  const nonce = await storage.getUserNonce(address);
  if (!nonce) {
    return { ok: false, status: 400, error: "No active challenge — request a new nonce first", code: "NONCE_MISSING" };
  }

  const guard: NonceCheck = checkNonce(address, nonce);
  if (!guard.ok) {
    const reason = guard.reason;
    return {
      ok: false,
      status: 400,
      code: `NONCE_${reason.toUpperCase()}`,
      error:
        reason === "replayed" ? "Nonce already used — replay rejected" :
        reason === "stale"    ? "Nonce expired — request a new one"    :
        reason === "mismatch" ? "Nonce mismatch — request a new one"   :
                                "No active nonce — request a new one",
    };
  }

  let recovered: string;
  try {
    recovered = ethers.verifyMessage(CHALLENGE_MESSAGE(nonce), signature).toLowerCase();
  } catch {
    return { ok: false, status: 401, error: "Signature verification failed", code: "BAD_SIGNATURE" };
  }
  if (recovered !== address) {
    return { ok: false, status: 401, error: "Signature verification failed", code: "BAD_SIGNATURE" };
  }

  // One-time use — clear from persistent store AND record in the replay guard
  // so any concurrent/late replay of this nonce is rejected immediately.
  await storage.clearUserNonce(address).catch(() => {});
  consumeNonce(address, nonce);
  return { ok: true, address, nonce };
}
