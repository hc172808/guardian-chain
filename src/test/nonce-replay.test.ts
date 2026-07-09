/**
 * Protocol-level nonce replay protection.
 * Verifies stale, unknown, mismatched, and replayed nonces are all rejected.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  issueNonce,
  checkNonce,
  consumeNonce,
  _resetNonceGuardForTests,
  NONCE_TTL_MS,
} from '../../server/nonceGuard';

const ADDR = '0xabc0000000000000000000000000000000000001';

describe('nonceGuard', () => {
  beforeEach(() => _resetNonceGuardForTests());

  it('accepts a freshly-issued nonce exactly once', () => {
    const now = 1_000_000;
    issueNonce(ADDR, 'n1', now);
    expect(checkNonce(ADDR, 'n1', now)).toEqual({ ok: true });
    consumeNonce(ADDR, 'n1', now);
    // Second submit of same nonce is a replay
    expect(checkNonce(ADDR, 'n1', now + 1)).toEqual({ ok: false, reason: 'replayed' });
  });

  it('rejects unknown nonces (never issued or already forgotten)', () => {
    expect(checkNonce(ADDR, 'never-issued')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('rejects a stale nonce past its TTL', () => {
    const now = 5_000_000;
    issueNonce(ADDR, 'n2', now);
    expect(checkNonce(ADDR, 'n2', now + NONCE_TTL_MS + 1)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('rejects a nonce that does not match the active one (rotation)', () => {
    const now = 2_000_000;
    issueNonce(ADDR, 'old', now);
    issueNonce(ADDR, 'new', now + 10); // rotate
    expect(checkNonce(ADDR, 'old', now + 20)).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkNonce(ADDR, 'new', now + 20)).toEqual({ ok: true });
  });

  it('blocks captured-payload replays even across a re-issue', () => {
    const now = 3_000_000;
    issueNonce(ADDR, 'captured', now);
    consumeNonce(ADDR, 'captured', now);
    // Attacker replays original payload later; even if a new nonce was issued
    // in the meantime, the captured one is still rejected as replayed.
    issueNonce(ADDR, 'fresh', now + 1000);
    expect(checkNonce(ADDR, 'captured', now + 2000)).toEqual({ ok: false, reason: 'replayed' });
  });
});
