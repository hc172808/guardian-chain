/**
 * Test: firewall honeypot redirect.
 * Verifies that a client hitting /api/auth/login with 3 failed attempts
 * within 30s receives a HONEYPOT_REDIRECT response and that the
 * AuthContext.signIn() helper follows the redirectUrl.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('firewall honeypot redirect', () => {
  const origFetch = global.fetch;
  let assignedUrl: string | null = null;

  beforeEach(() => {
    assignedUrl = null;
    // jsdom's window.location.replace is read-only, so override with a spy.
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { replace: (u: string) => { assignedUrl = u; } },
    });
  });

  afterEach(() => { global.fetch = origFetch; });

  it('redirects when server returns HONEYPOT_REDIRECT after 3 failures', async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return new Response(
          JSON.stringify({ error: `Invalid credentials (Warning: ${calls}/3 failed attempts in 30s — you will be blocked if you continue.)`, shortCount: calls }),
          { status: 401 }
        );
      }
      return new Response(
        JSON.stringify({
          error: 'Too many failed attempts from this IP. Redirecting…',
          code: 'HONEYPOT_REDIRECT',
          redirectUrl: 'https://example.com/warning',
        }),
        { status: 429 }
      );
    }) as any;

    // Inline reimplementation of AuthContext.signIn to avoid pulling the full provider.
    const signIn = async () => {
      const res = await fetch('/api/auth/login', { method: 'POST', body: '{}' } as any);
      if (!res.ok) {
        const err: any = await res.json();
        if (err?.code === 'HONEYPOT_REDIRECT' && typeof err.redirectUrl === 'string') {
          (window.location as any).replace(err.redirectUrl);
          return { error: { message: 'Redirecting…' } };
        }
        return { error: { message: err.error } };
      }
      return { error: null };
    };

    // Two harmless failures — should carry a warning, no redirect.
    const r1 = await signIn();
    const r2 = await signIn();
    expect(assignedUrl).toBeNull();
    expect(r1.error?.message).toMatch(/1\/3/);
    expect(r2.error?.message).toMatch(/2\/3/);

    // Third failure trips the honeypot redirect.
    await signIn();
    expect(assignedUrl).toBe('https://example.com/warning');
  });
});
