/**
 * Faucet — 24-hour cooldown tests
 *
 * Covers:
 *  - canClaim() pure logic with fake time
 *  - nextClaimIn() countdown formatting
 *  - Button disabled/enabled state mirrors cooldown state
 *  - Exact 24-hour boundary behaviour
 *  - Token-type independence (gyd vs gyds)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ── Pure logic mirrored verbatim from src/pages/Faucet.tsx ───────────────────
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function canClaim(lastClaim: Record<string, number>, type: string): boolean {
  const last = lastClaim[type] || 0;
  return Date.now() - last > COOLDOWN_MS;
}

function nextClaimIn(lastClaim: Record<string, number>, type: string): string {
  const last = lastClaim[type] || 0;
  const remaining = COOLDOWN_MS - (Date.now() - last);
  if (remaining <= 0) return '';
  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}
// ─────────────────────────────────────────────────────────────────────────────

// Base timestamp well past COOLDOWN_MS from epoch, so Date.now() - 0 > COOLDOWN_MS
// and a "never claimed" (last=0) entry is correctly seen as claimable.
const BASE = COOLDOWN_MS * 10; // ~10 days past epoch

describe('canClaim — pure logic', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows claim when there is no prior claim record', () => {
    vi.setSystemTime(BASE);
    expect(canClaim({}, 'gyd')).toBe(true);
    expect(canClaim({}, 'gyds')).toBe(true);
  });

  it('blocks claim at t=0 (immediately after claiming)', () => {
    const now = BASE;
    vi.setSystemTime(now);
    expect(canClaim({ gyd: now }, 'gyd')).toBe(false);
  });

  it('blocks claim 1 second before the 24-hour mark', () => {
    const claimedAt = BASE;
    vi.setSystemTime(claimedAt + COOLDOWN_MS - 1_000);
    expect(canClaim({ gyd: claimedAt }, 'gyd')).toBe(false);
  });

  it('blocks claim exactly at 24h - 1ms', () => {
    const claimedAt = BASE;
    vi.setSystemTime(claimedAt + COOLDOWN_MS - 1);
    expect(canClaim({ gyd: claimedAt }, 'gyd')).toBe(false);
  });

  it('re-enables claim at exactly the 24-hour boundary (+1ms)', () => {
    const claimedAt = BASE;
    vi.setSystemTime(claimedAt + COOLDOWN_MS + 1);
    expect(canClaim({ gyd: claimedAt }, 'gyd')).toBe(true);
  });

  it('re-enables claim well after 24h (25h later)', () => {
    const claimedAt = BASE;
    vi.setSystemTime(claimedAt + COOLDOWN_MS + 3_600_000);
    expect(canClaim({ gyd: claimedAt }, 'gyd')).toBe(true);
  });

  it('gyd cooldown does not affect gyds token type', () => {
    const now = BASE;
    vi.setSystemTime(now);
    const lastClaim = { gyd: now };          // gyd just claimed → disabled
    expect(canClaim(lastClaim, 'gyd')).toBe(false);
    expect(canClaim(lastClaim, 'gyds')).toBe(true);  // gyds unaffected
  });

  it('gyds cooldown does not affect gyd token type', () => {
    const now = BASE;
    vi.setSystemTime(now);
    const lastClaim = { gyds: now };         // gyds just claimed → disabled
    expect(canClaim(lastClaim, 'gyds')).toBe(false);
    expect(canClaim(lastClaim, 'gyd')).toBe(true);   // gyd unaffected
  });
});

describe('nextClaimIn — countdown format', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns empty string when cooldown has expired', () => {
    const claimedAt = 1_000_000;
    vi.setSystemTime(claimedAt + COOLDOWN_MS + 1_000);
    expect(nextClaimIn({ gyd: claimedAt }, 'gyd')).toBe('');
  });

  it('returns empty string when there is no prior claim', () => {
    // BASE >> COOLDOWN_MS so Date.now() - 0 > COOLDOWN_MS → remaining ≤ 0 → ''
    vi.setSystemTime(BASE);
    expect(nextClaimIn({}, 'gyd')).toBe('');
  });

  it('shows "23h 59m" one minute after a fresh claim', () => {
    const claimedAt = BASE;
    vi.setSystemTime(claimedAt + 60_000);
    expect(nextClaimIn({ gyd: claimedAt }, 'gyd')).toBe('23h 59m');
  });

  it('shows "12h 0m" at the midpoint of the cooldown', () => {
    const claimedAt = BASE;
    vi.setSystemTime(claimedAt + 12 * 3_600_000);
    expect(nextClaimIn({ gyd: claimedAt }, 'gyd')).toBe('12h 0m');
  });

  it('shows "1h 30m" with 1h 30m remaining', () => {
    const claimedAt = BASE;
    const remaining = 1 * 3_600_000 + 30 * 60_000;
    vi.setSystemTime(claimedAt + COOLDOWN_MS - remaining);
    expect(nextClaimIn({ gyd: claimedAt }, 'gyd')).toBe('1h 30m');
  });

  it('shows "0h 1m" with one minute remaining', () => {
    const claimedAt = BASE;
    vi.setSystemTime(claimedAt + COOLDOWN_MS - 60_000);
    expect(nextClaimIn({ gyd: claimedAt }, 'gyd')).toBe('0h 1m');
  });
});

describe('Claim Button — disabled attribute matches cooldown state', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function ClaimButton({
    type,
    lastClaim,
  }: {
    type: string;
    lastClaim: Record<string, number>;
  }) {
    const enabled = canClaim(lastClaim, type);
    const countdown = nextClaimIn(lastClaim, type);
    return (
      <button disabled={!enabled} data-testid="claim-btn">
        {!enabled ? `Wait ${countdown || 'Cooldown'}` : `Claim ${type.toUpperCase()}`}
      </button>
    );
  }

  it('button is enabled and shows "Claim GYD" with no prior claim', () => {
    vi.setSystemTime(BASE);
    render(<ClaimButton type="gyd" lastClaim={{}} />);
    const btn = screen.getByTestId('claim-btn');
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveTextContent('Claim GYD');
  });

  it('button is disabled immediately after claiming', () => {
    const now = BASE;
    vi.setSystemTime(now);
    render(<ClaimButton type="gyd" lastClaim={{ gyd: now }} />);
    expect(screen.getByTestId('claim-btn')).toBeDisabled();
  });

  it('button shows the countdown timer text while disabled', () => {
    const claimedAt = BASE;
    vi.setSystemTime(claimedAt + 60_000);
    render(<ClaimButton type="gyd" lastClaim={{ gyd: claimedAt }} />);
    const btn = screen.getByTestId('claim-btn');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('23h 59m');
  });

  it('button re-enables and shows "Claim GYDS" exactly after 24h', () => {
    const claimedAt = BASE;
    vi.setSystemTime(claimedAt + COOLDOWN_MS + 1);
    render(<ClaimButton type="gyds" lastClaim={{ gyds: claimedAt }} />);
    const btn = screen.getByTestId('claim-btn');
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveTextContent('Claim GYDS');
  });

  it('gyd button stays disabled while gyds button is enabled (independent)', () => {
    const now = BASE;
    vi.setSystemTime(now);
    const { rerender } = render(<ClaimButton type="gyd" lastClaim={{ gyd: now }} />);
    expect(screen.getByTestId('claim-btn')).toBeDisabled();
    rerender(<ClaimButton type="gyds" lastClaim={{ gyd: now }} />);
    expect(screen.getByTestId('claim-btn')).not.toBeDisabled();
  });
});
