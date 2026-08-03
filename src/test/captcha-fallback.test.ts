import { describe, expect, it, vi, afterEach } from 'vitest';
import { createFallbackChallenge, reportCaptchaEvent } from '@/lib/captchaFallback';
import { generateChallenge, verifyMathChallenge } from '../../server/captcha';

describe('captcha outage fallback', () => {
  afterEach(() => vi.restoreAllMocks());

  it('survives an HTML captcha route response but still requires server verification', () => {
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

  it('reports HTML responses for operator alerting without blocking the UI', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'Content-Type': 'application/json' } }),
    );

    await expect(reportCaptchaEvent('html_response', { status: 200 })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/captcha/events', expect.objectContaining({ method: 'POST' }));
  });
});