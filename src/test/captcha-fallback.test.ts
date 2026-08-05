import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { createFallbackChallenge, reportCaptchaEvent } from '@/lib/captchaFallback';
import { generateChallenge, verifyMathChallenge, fallbackAttemptLog } from '../../server/captcha';

describe('captcha outage fallback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    fallbackAttemptLog.length = 0;
  });

  it('survives an HTML captcha route response but still requires server verification', () => {
    vi.setSystemTime(1_800_000_000_000);
    const challenge = createFallbackChallenge(1_800_000_000_000);
    vi.setSystemTime(1_800_000_000_100);

    expect(verifyMathChallenge(challenge.challengeId, '999')).toBe(false);
    expect(verifyMathChallenge(challenge.challengeId, challenge.answer)).toBe(true);
    expect(verifyMathChallenge(challenge.challengeId, challenge.answer)).toBe(false);
  });

  it('keeps normal server-issued challenges authoritative when available', () => {
    const challenge = generateChallenge();
    expect(challenge.challengeId).not.toContain('fallback:');
    expect(verifyMathChallenge(challenge.challengeId, 'not-an-answer')).toBe(false);
  });

  it('expires fallback challenges after the tightened 2-minute window', () => {
    vi.setSystemTime(1_800_000_000_000);
    const challenge = createFallbackChallenge(1_800_000_000_000);
    vi.setSystemTime(1_800_000_000_000 + 2 * 60_000 + 1_000);
    expect(verifyMathChallenge(challenge.challengeId, challenge.answer)).toBe(false);
    expect(fallbackAttemptLog[0]).toMatchObject({ challengeId: challenge.challengeId, outcome: 'expired' });
  });

  it('logs every fallback attempt by challenge ID, including replays', () => {
    vi.setSystemTime(1_800_000_100_000);
    const challenge = createFallbackChallenge(1_800_000_100_000);
    verifyMathChallenge(challenge.challengeId, challenge.answer);
    verifyMathChallenge(challenge.challengeId, challenge.answer);
    const outcomes = fallbackAttemptLog.filter(a => a.challengeId === challenge.challengeId).map(a => a.outcome);
    expect(outcomes).toEqual(['replayed', 'accepted']);
  });

  it('reports HTML responses for operator alerting without blocking the UI', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'Content-Type': 'application/json' } }),
    );

    await expect(reportCaptchaEvent('html_response', { status: 200 })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/captcha/events', expect.objectContaining({ method: 'POST' }));
  });

  it('handles repeated HTML captcha responses: warns, reports each one, never bypasses verification', async () => {
    const html = '<!DOCTYPE html><html><body>SPA</body></html>';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(typeof input === 'string' ? input : input?.url ?? '');
      if (url.includes('/api/auth/captcha/events')) {
        return new Response(JSON.stringify({ ok: true, requestId: 'req' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
    });

    vi.setSystemTime(1_800_000_200_000);
    const degraded: boolean[] = [];
    const challenges: string[] = [];

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch('/api/auth/captcha');
      const isHtml = !(res.headers.get('content-type') ?? '').includes('application/json');
      degraded.push(isHtml);
      await reportCaptchaEvent('html_response', { status: res.status, attempt });
      const challenge = createFallbackChallenge(Date.now() + attempt);
      challenges.push(challenge.challengeId);
      // Server-side verification still runs and still enforces correctness.
      expect(verifyMathChallenge(challenge.challengeId, 'wrong')).toBe(false);
      expect(verifyMathChallenge(challenge.challengeId, challenge.answer)).toBe(true);
    }

    expect(degraded).toEqual([true, true, true]);
    expect(new Set(challenges).size).toBe(3);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/auth/captcha/events')).length,
    ).toBe(3);
    // No challenge may be reused after a successful verification.
    for (const id of challenges) expect(verifyMathChallenge(id, undefined as any)).toBe(false);
  });
});
