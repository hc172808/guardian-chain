/**
 * Integration tests: protocol-level nonce replay protection for every
 * wallet-login-related endpoint.
 *
 * Exercises the shared `verifyWalletChallenge` helper — the exact code path
 * that /api/auth/web3 and /api/auth/reset-password/wallet run through — using
 * a real ECDSA signer against an in-memory storage stub.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import {
  verifyWalletChallenge,
  CHALLENGE_MESSAGE,
  type WalletChallengeStorage,
} from '../../server/walletChallenge';
import { issueNonce, _resetNonceGuardForTests } from '../../server/nonceGuard';

/** Minimal in-memory storage that mirrors what real endpoints touch. */
function makeStorage(): WalletChallengeStorage & { _nonces: Map<string, string> } {
  const _nonces = new Map<string, string>();
  return {
    _nonces,
    async getUserNonce(a) { return _nonces.get(a.toLowerCase()) ?? null; },
    async clearUserNonce(a) { _nonces.delete(a.toLowerCase()); },
  };
}

async function mintChallenge(storage: ReturnType<typeof makeStorage>, wallet: ethers.Wallet) {
  // Simulates what GET /api/auth/nonce does end-to-end.
  const nonce = 'n_' + Math.random().toString(36).slice(2, 20);
  const addr = wallet.address.toLowerCase();
  storage._nonces.set(addr, nonce);
  issueNonce(addr, nonce);
  const signature = await wallet.signMessage(CHALLENGE_MESSAGE(nonce));
  return { nonce, signature, address: addr };
}

describe('wallet-login endpoints: protocol-level replay protection', () => {
  let storage: ReturnType<typeof makeStorage>;
  let wallet: ethers.Wallet;

  beforeEach(() => {
    _resetNonceGuardForTests();
    storage = makeStorage();
    wallet = ethers.Wallet.createRandom();
  });

  it('accepts a valid signature exactly once (single-use nonce)', async () => {
    const { signature, address } = await mintChallenge(storage, wallet);
    const first = await verifyWalletChallenge(address, signature, storage);
    expect(first.ok).toBe(true);

    // Same payload again — this is the classic replay attack.
    const second = await verifyWalletChallenge(address, signature, storage);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('NONCE_MISSING'); // store was cleared
  });

  it('rejects a replayed signature even if the storage row is re-populated', async () => {
    // Simulates an attacker who captured a signature and races the DB clear.
    const { nonce, signature, address } = await mintChallenge(storage, wallet);
    const first = await verifyWalletChallenge(address, signature, storage);
    expect(first.ok).toBe(true);

    // Attacker forces the same nonce back into storage (simulating a race
    // window / compromised path) and replays the signature. The in-memory
    // guard remembers the consumed nonce for 10 minutes and rejects it.
    storage._nonces.set(address, nonce);
    const replay = await verifyWalletChallenge(address, signature, storage);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.code).toBe('NONCE_REPLAYED');
  });

  it('rejects a stale signature signed against an old nonce after rotation', async () => {
    const { signature: oldSig, address } = await mintChallenge(storage, wallet);
    // Rotate: user requested a new challenge before submitting the first.
    const { signature: newSig } = await mintChallenge(storage, wallet);

    // Old signature no longer matches the active nonce.
    const stale = await verifyWalletChallenge(address, oldSig, storage);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe('BAD_SIGNATURE');

    // Fresh signature still works.
    const ok = await verifyWalletChallenge(address, newSig, storage);
    expect(ok.ok).toBe(true);
  });

  it('rejects a signature from a different wallet (address mismatch)', async () => {
    const { signature, address } = await mintChallenge(storage, wallet);
    const attacker = ethers.Wallet.createRandom().address.toLowerCase();
    // Attacker copies signature but submits their own address — but they have
    // no active nonce, so the guard rejects before signature check.
    const res = await verifyWalletChallenge(attacker, signature, storage);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NONCE_MISSING');
    expect(address).not.toBe(attacker);
  });

  it('rejects a forged signature over the correct nonce', async () => {
    const { nonce, address } = await mintChallenge(storage, wallet);
    const forger = ethers.Wallet.createRandom();
    const forgedSig = await forger.signMessage(CHALLENGE_MESSAGE(nonce));
    const res = await verifyWalletChallenge(address, forgedSig, storage);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BAD_SIGNATURE');
  });

  it('rejects missing or malformed inputs', async () => {
    const missing = await verifyWalletChallenge(undefined, undefined, storage);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('MISSING_FIELDS');

    const badAddr = await verifyWalletChallenge('not-an-address', 'sig', storage);
    expect(badAddr.ok).toBe(false);
    if (!badAddr.ok) expect(badAddr.code).toBe('BAD_ADDRESS');
  });

  it('the same helper protects /api/auth/web3 AND /api/auth/reset-password/wallet', async () => {
    // Both endpoints call verifyWalletChallenge with the same signature.
    // A signature spent on the login endpoint MUST NOT be reusable on the
    // password-reset endpoint (or vice-versa) — the replay memory is shared.
    const { signature, address, nonce } = await mintChallenge(storage, wallet);

    const loginOk = await verifyWalletChallenge(address, signature, storage);
    expect(loginOk.ok).toBe(true);

    // Repopulate the storage row exactly as a race attacker would.
    storage._nonces.set(address, nonce);
    const resetReplay = await verifyWalletChallenge(address, signature, storage);
    expect(resetReplay.ok).toBe(false);
    if (!resetReplay.ok) expect(resetReplay.code).toBe('NONCE_REPLAYED');
  });
});
