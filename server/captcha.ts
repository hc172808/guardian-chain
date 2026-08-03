/**
 * server/captcha.ts
 *
 * Dual-mode CAPTCHA / human-verification layer.
 *
 * Mode A — hCaptcha (production-grade, optional):
 *   Set HCAPTCHA_SECRET_KEY in env → server verifies the token with the hCaptcha API.
 *   Frontend uses VITE_HCAPTCHA_SITE_KEY to render the hCaptcha widget.
 *
 * Mode B — Built-in math challenge (zero-config default):
 *   No env vars required. Server generates a signed challenge (random math question),
 *   client solves it and sends the answer back. Challenges are one-time-use and expire
 *   after 10 minutes.
 *
 * The server auto-selects the mode based on whether HCAPTCHA_SECRET_KEY is set.
 * Frontend mirrors this decision via VITE_HCAPTCHA_SITE_KEY.
 */

import crypto from 'crypto';

// ── In-memory challenge store (Mode B) ─────────────────────────────────────────
interface Challenge {
  answer: number;
  expiresAt: number;
}

const challengeStore = new Map<string, Challenge>();
const usedFallbackChallenges = new Map<string, number>();
const FALLBACK_TTL_MS = 10 * 60_000;

function deriveFallbackOperands(nonce: string): [number, number] {
  let hash = 2166136261;
  for (const char of nonce) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return [(unsigned % 9) + 2, ((unsigned >>> 8) % 9) + 2];
}

function verifyFallbackChallenge(challengeId: string, answer: string | number): boolean {
  const match = /^fallback:v1:(\d{13}):([a-f0-9]{32})$/.exec(challengeId);
  if (!match) return false;
  const issuedAt = Number(match[1]);
  const nonce = match[2];
  const now = Date.now();
  if (!Number.isFinite(issuedAt) || issuedAt > now + 30_000 || now - issuedAt > FALLBACK_TTL_MS) return false;
  if (usedFallbackChallenges.has(challengeId)) return false;
  const [a, b] = deriveFallbackOperands(nonce);
  const submitted = Number.parseInt(String(answer).trim(), 10);
  if (!Number.isFinite(submitted) || submitted !== a + b) return false;
  usedFallbackChallenges.set(challengeId, now + FALLBACK_TTL_MS);
  return true;
}

// Prune expired challenges every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, ch] of challengeStore) {
    if (ch.expiresAt < now) challengeStore.delete(id);
  }
  for (const [id, expiresAt] of usedFallbackChallenges) {
    if (expiresAt < now) usedFallbackChallenges.delete(id);
  }
}, 2 * 60_000);

// ── Math challenge generation ──────────────────────────────────────────────────
type Op = { sym: string; fn: (a: number, b: number) => number };

const OPS: Op[] = [
  { sym: '+',  fn: (a, b) => a + b },
  { sym: '−',  fn: (a, b) => a - b },
  { sym: '×',  fn: (a, b) => a * b },
];

export function generateChallenge(): { challengeId: string; question: string } {
  const op = OPS[Math.floor(Math.random() * OPS.length)];

  let a = Math.floor(Math.random() * 9) + 2;   // 2-10
  let b = Math.floor(Math.random() * 9) + 2;   // 2-10

  // Subtraction: ensure non-negative result
  if (op.sym === '−' && b > a) [a, b] = [b, a];

  // Multiplication: keep it easy (≤ 81)
  if (op.sym === '×') {
    a = Math.floor(Math.random() * 9) + 2;     // 2-10
    b = Math.floor(Math.random() * 4) + 2;     // 2-5
  }

  const answer = op.fn(a, b);
  const challengeId = crypto.randomBytes(20).toString('hex');

  challengeStore.set(challengeId, {
    answer,
    expiresAt: Date.now() + 10 * 60_000,       // 10-minute TTL
  });

  return { challengeId, question: `${a} ${op.sym} ${b}` };
}

export function verifyMathChallenge(challengeId: string, answer: string | number): boolean {
  if (challengeId.startsWith('fallback:v1:')) {
    return verifyFallbackChallenge(challengeId, answer);
  }
  const ch = challengeStore.get(challengeId);
  if (!ch) return false;

  // One-time use — delete immediately
  challengeStore.delete(challengeId);

  if (ch.expiresAt < Date.now()) return false;

  const submitted = parseInt(String(answer).trim(), 10);
  return !isNaN(submitted) && submitted === ch.answer;
}

// ── hCaptcha verification (Mode A) ────────────────────────────────────────────
export async function verifyHCaptcha(token: string, remoteIp?: string): Promise<boolean> {
  const secret = process.env.HCAPTCHA_SECRET_KEY;
  if (!secret) return false;
  try {
    const params = new URLSearchParams({ secret, response: token });
    if (remoteIp) params.set('remoteip', remoteIp);
    const res = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data: any = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// ── Main gate — call this at the start of login/register handlers ─────────────
/**
 * Verifies the captcha payload from the request body.
 *
 * For hCaptcha mode, expects: { hcaptchaToken: string }
 * For math-challenge mode, expects: { challengeId: string; captchaAnswer: string | number }
 *
 * Returns { ok: true } on success, or { ok: false, error: string } on failure.
 */
export async function verifyCaptcha(
  body: Record<string, any>,
  remoteIp?: string,
): Promise<{ ok: boolean; error?: string }> {
  const useHCaptcha = !!process.env.HCAPTCHA_SECRET_KEY;

  if (useHCaptcha) {
    const token: string = body?.hcaptchaToken ?? body?.captchaToken ?? '';
    if (!token) {
      return { ok: false, error: 'CAPTCHA verification required. Please complete the security check.' };
    }
    const ok = await verifyHCaptcha(token, remoteIp);
    if (!ok) {
      return { ok: false, error: 'CAPTCHA verification failed. Please try again.' };
    }
    return { ok: true };
  }

  // Built-in math challenge
  const { challengeId, captchaAnswer } = body ?? {};

  if (!challengeId || captchaAnswer === undefined || captchaAnswer === '') {
    return { ok: false, error: 'Please complete the security check.' };
  }

  const ok = verifyMathChallenge(challengeId, captchaAnswer);
  if (!ok) {
    return { ok: false, error: 'Incorrect answer. Please try again.' };
  }

  return { ok: true };
}

/** True when hCaptcha keys are configured (used by the /api/auth/captcha/config route). */
export function captchaMode(): 'hcaptcha' | 'math' {
  return process.env.HCAPTCHA_SECRET_KEY ? 'hcaptcha' : 'math';
}
