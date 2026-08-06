/**
 * server/captchaSettings.ts
 *
 * Runtime-configurable settings for the captcha / security-check layer.
 *
 * Everything here can be changed from Admin → Health → Security-check settings
 * WITHOUT redeploying. Values are seeded from env vars (backwards compatible),
 * persisted to a JSON file so they survive restarts, and read live by
 * `captcha.ts` and `captchaAlerts.ts`.
 *
 * It also owns the server-side "attack mode" feature flag: when failure
 * signals spike, the offline (client-generated) fallback challenge is
 * automatically disabled so attackers cannot lean on it, while server-side
 * verification keeps working normally whenever the server is reachable.
 */

import fs from 'fs';
import path from 'path';

export interface CaptchaSettings {
  /** Failures inside the rolling window before an alert fires. */
  alertThreshold: number;
  /** Rolling window used for alert thresholds (ms). */
  alertWindowMs: number;
  /** Minimum gap between two alerts of the same kind (ms). */
  alertCooldownMs: number;
  /** Offline-fallback challenge lifetime / replay expiry (ms). Default 2 minutes. */
  fallbackTtlMs: number;
  /** How much longer than the TTL used challenge IDs are remembered (multiplier). */
  fallbackReplayRetentionMultiplier: number;
  /** Master switch for the offline fallback challenge. */
  fallbackEnabled: boolean;
  /** Automatically disable the offline fallback while under attack. */
  autoDisableFallbackUnderAttack: boolean;
  /** Failure signals inside the attack window that trigger attack mode. */
  attackThreshold: number;
  /** Rolling window for attack detection (ms). */
  attackWindowMs: number;
  /** How long attack mode stays active after the last signal (ms). */
  attackCooldownMs: number;
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const DEFAULTS: CaptchaSettings = {
  alertThreshold: num(process.env.CAPTCHA_ALERT_THRESHOLD, 5),
  alertWindowMs: num(process.env.CAPTCHA_ALERT_WINDOW_MS, 5 * 60_000),
  alertCooldownMs: num(process.env.CAPTCHA_ALERT_COOLDOWN_MS, 15 * 60_000),
  fallbackTtlMs: num(process.env.CAPTCHA_FALLBACK_TTL_MS, 2 * 60_000),
  fallbackReplayRetentionMultiplier: num(process.env.CAPTCHA_FALLBACK_RETENTION_X, 5),
  fallbackEnabled: process.env.CAPTCHA_FALLBACK_ENABLED !== 'false',
  autoDisableFallbackUnderAttack: process.env.CAPTCHA_AUTO_DISABLE_FALLBACK !== 'false',
  attackThreshold: num(process.env.CAPTCHA_ATTACK_THRESHOLD, 25),
  attackWindowMs: num(process.env.CAPTCHA_ATTACK_WINDOW_MS, 2 * 60_000),
  attackCooldownMs: num(process.env.CAPTCHA_ATTACK_COOLDOWN_MS, 10 * 60_000),
};

const SETTINGS_FILE = process.env.CAPTCHA_SETTINGS_FILE
  ?? path.join(process.cwd(), '.gyds-captcha-settings.json');

let settings: CaptchaSettings = { ...DEFAULTS };

// ── Persistence ────────────────────────────────────────────────────────────────
(function load() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    settings = sanitize({ ...settings, ...raw });
    console.log('[captcha-settings] loaded overrides from', SETTINGS_FILE);
  } catch (e: any) {
    console.warn('[captcha-settings] load failed:', e?.message);
  }
})();

function persist() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e: any) {
    console.warn('[captcha-settings] persist failed:', e?.message);
  }
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitize(input: Partial<CaptchaSettings>): CaptchaSettings {
  const base = settings;
  return {
    alertThreshold: clamp(input.alertThreshold, base.alertThreshold, 1, 10_000),
    alertWindowMs: clamp(input.alertWindowMs, base.alertWindowMs, 10_000, 24 * 60 * 60_000),
    alertCooldownMs: clamp(input.alertCooldownMs, base.alertCooldownMs, 0, 24 * 60 * 60_000),
    fallbackTtlMs: clamp(input.fallbackTtlMs, base.fallbackTtlMs, 15_000, 60 * 60_000),
    fallbackReplayRetentionMultiplier: clamp(
      input.fallbackReplayRetentionMultiplier, base.fallbackReplayRetentionMultiplier, 1, 50,
    ),
    fallbackEnabled: typeof input.fallbackEnabled === 'boolean' ? input.fallbackEnabled : base.fallbackEnabled,
    autoDisableFallbackUnderAttack:
      typeof input.autoDisableFallbackUnderAttack === 'boolean'
        ? input.autoDisableFallbackUnderAttack
        : base.autoDisableFallbackUnderAttack,
    attackThreshold: clamp(input.attackThreshold, base.attackThreshold, 1, 100_000),
    attackWindowMs: clamp(input.attackWindowMs, base.attackWindowMs, 10_000, 24 * 60 * 60_000),
    attackCooldownMs: clamp(input.attackCooldownMs, base.attackCooldownMs, 10_000, 24 * 60 * 60_000),
  };
}

export function getCaptchaSettings(): CaptchaSettings {
  return { ...settings };
}

export function getCaptchaSettingsDefaults(): CaptchaSettings {
  return { ...DEFAULTS };
}

export function updateCaptchaSettings(patch: Partial<CaptchaSettings>): CaptchaSettings {
  settings = sanitize(patch);
  persist();
  console.log('[captcha-settings] updated', settings);
  return getCaptchaSettings();
}

export function resetCaptchaSettings(): CaptchaSettings {
  settings = { ...DEFAULTS };
  persist();
  return getCaptchaSettings();
}

// ── Attack-condition feature flag ──────────────────────────────────────────────
let attackSignals: number[] = [];
let attackModeUntil = 0;
let manualLockUntil = 0;

export type AttackState = {
  active: boolean;
  signalsInWindow: number;
  threshold: number;
  until: string | null;
  reason: 'auto' | 'manual' | null;
};

/** Feed one failure/abuse signal into the attack detector. */
export function recordAttackSignal(): AttackState {
  const now = Date.now();
  attackSignals = attackSignals.filter(t => now - t < settings.attackWindowMs);
  attackSignals.push(now);
  if (attackSignals.length >= settings.attackThreshold) {
    attackModeUntil = now + settings.attackCooldownMs;
  }
  return attackState();
}

/** Admin override: force attack mode on for `ms` (or clear it with 0). */
export function setManualAttackMode(ms: number): AttackState {
  manualLockUntil = ms > 0 ? Date.now() + ms : 0;
  if (ms === 0) { attackModeUntil = 0; attackSignals = []; }
  return attackState();
}

export function attackState(): AttackState {
  const now = Date.now();
  const signals = attackSignals.filter(t => now - t < settings.attackWindowMs).length;
  if (manualLockUntil > now) {
    return { active: true, signalsInWindow: signals, threshold: settings.attackThreshold, until: new Date(manualLockUntil).toISOString(), reason: 'manual' };
  }
  const active = attackModeUntil > now;
  return {
    active,
    signalsInWindow: signals,
    threshold: settings.attackThreshold,
    until: active ? new Date(attackModeUntil).toISOString() : null,
    reason: active ? 'auto' : null,
  };
}

/**
 * True when clients may fall back to a locally generated challenge.
 * Server-side verification is always enforced whenever the server answers —
 * this only governs the degraded, offline-only path.
 */
export function isFallbackAllowed(): boolean {
  if (!settings.fallbackEnabled) return false;
  if (settings.autoDisableFallbackUnderAttack && attackState().active) return false;
  return true;
}
