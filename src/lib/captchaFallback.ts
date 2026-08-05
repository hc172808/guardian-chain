export type FallbackChallenge = {
  challengeId: string;
  question: string;
  answer: string;
};

const FALLBACK_VERSION = 'fallback:v1';

function deriveOperands(nonce: string): [number, number] {
  let hash = 2166136261;
  for (const char of nonce) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return [(unsigned % 9) + 2, ((unsigned >>> 8) % 9) + 2];
}

export function createFallbackChallenge(now = Date.now()): FallbackChallenge {
  const random = new Uint32Array(4);
  crypto.getRandomValues(random);
  const nonce = Array.from(random, value => value.toString(16).padStart(8, '0')).join('');
  const [a, b] = deriveOperands(nonce);
  return {
    challengeId: `${FALLBACK_VERSION}:${now}:${nonce}`,
    question: `${a} + ${b}`,
    answer: String(a + b),
  };
}

export async function reportCaptchaEvent(
  event: 'html_response' | 'retry' | 'fallback_activated' | 'recovered' | 'blocked_login',
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await fetch('/api/auth/captcha/events', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, details }),
      keepalive: true,
    });
  } catch {
    // Monitoring must never prevent a user from reaching the login form.
  }
}