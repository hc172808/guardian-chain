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
  type WalletChallengeResult,
} from '../../server/walletChallenge';
import { issueNonce, _resetNonceGuardForTests } from '../../server/nonceGuard';

/** Minimal in-memory storage that mirrors what real endpoints touch. */
function makeStorage(): WalletChallengeStorage & { _nonces: Map<string, string> } {
  const _nonces = new Map<string, string>();
  return {
    _nonces,
    async getUserNonce(a: string) { return _nonces.get(a.toLowerCase()) ?? null; },
    async clearUserNonce(a: string) { _nonces.delete(a.toLowerCase()); },
  };
}

/** Any object with a signMessage method — covers Wallet and HDNodeWallet. */
type Signer = { address: string; signMessage: (m: string) => Promise<string> };

async function mintChallenge(storage: ReturnType<typeof makeStorage>, signer: Signer) {
  const nonce = 'n_' + Math.random().toString(36).slice(2, 20);
  const addr = signer.address.toLowerCase();
  storage._nonces.set(addr, nonce);
  issueNonce(addr, nonce);
  const signature = await signer.signMessage(CHALLENGE_MESSAGE(nonce));
  return { nonce, signature, address: addr };
}

/** Narrowing helper — asserts result is a failure and returns the code. */
function failCode(res: WalletChallengeResult): string {
  if (res.ok === true) throw new Error(`expected failure, got success`);
  return res.code;
}

// jsdom's Buffer-returning randomBytes trips ethers.Wallet.createRandom, so
// use deterministic private keys for reproducibility.
function makeWallet(seed: number): Signer {
  const hex = seed.toString(16).padStart(64, '0');
  return new ethers.Wallet('0x' + hex);
}

describe('wallet-login endpoints: protocol-level replay protection', () => {
  let storage: ReturnType<typeof makeStorage>;
  let wallet: Signer;

  beforeEach(() => {
    _resetNonceGuardForTests();
    storage = makeStorage();
    wallet = makeWallet(1);
  });

  it('accepts a valid signature exactly once (single-use nonce)', async () => {
    const { signature, address } = await mintChallenge(storage, wallet);
    const first = await verifyWalletChallenge(address, signature, storage);
    expect(first.ok).toBe(true);

    // Same payload again — this is the classic replay attack.
    const second = await verifyWalletChallenge(address, signature, storage);
    expect(failCode(second)).toBe('NONCE_MISSING'); // store was cleared
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
    expect(failCode(replay)).toBe('NONCE_REPLAYED');
  });

  it('rejects a stale signature signed against an old nonce after rotation', async () => {
    const { signature: oldSig, address } = await mintChallenge(storage, wallet);
    // Rotate: user requested a new challenge before submitting the first.
    const { signature: newSig } = await mintChallenge(storage, wallet);

    // Old signature no longer matches the active nonce.
    const stale = await verifyWalletChallenge(address, oldSig, storage);
    expect(failCode(stale)).toBe('BAD_SIGNATURE');

    // Fresh signature still works.
    const ok = await verifyWalletChallenge(address, newSig, storage);
    expect(ok.ok).toBe(true);
  });

  it('rejects a signature from a different wallet (address mismatch)', async () => {
    const { signature, address } = await mintChallenge(storage, wallet);
    const attacker = makeWallet(Math.floor(Math.random()*1e9)+2).address.toLowerCase();
    // Attacker copies signature but submits their own address — but they have
    // no active nonce, so the guard rejects before signature check.
    const res = await verifyWalletChallenge(attacker, signature, storage);
    expect(failCode(res)).toBe('NONCE_MISSING');
    expect(address).not.toBe(attacker);
  });

  it('rejects a forged signature over the correct nonce', async () => {
    const { nonce, address } = await mintChallenge(storage, wallet);
    const forger = makeWallet(Math.floor(Math.random()*1e9)+2);
    const forgedSig = await forger.signMessage(CHALLENGE_MESSAGE(nonce));
    const res = await verifyWalletChallenge(address, forgedSig, storage);
    expect(failCode(res)).toBe('BAD_SIGNATURE');
  });

  it('rejects missing or malformed inputs', async () => {
    const missing = await verifyWalletChallenge(undefined, undefined, storage);
    expect(failCode(missing)).toBe('MISSING_FIELDS');

    const badAddr = await verifyWalletChallenge('not-an-address', 'sig', storage);
    expect(failCode(badAddr)).toBe('BAD_ADDRESS');
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
    expect(failCode(resetReplay)).toBe('NONCE_REPLAYED');
  });
});
