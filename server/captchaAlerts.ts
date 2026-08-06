/**
 * server/captchaAlerts.ts
 *
 * Slack + email alerting for captcha / security-check degradation.
 *
 * Env:
 *   CAPTCHA_ALERT_SLACK_WEBHOOK  — Slack incoming-webhook URL (falls back to SLACK_WEBHOOK_URL)
 *   CAPTCHA_ALERT_EMAIL          — comma-separated recipients (falls back to ADMIN_ALERT_EMAIL)
 *   CAPTCHA_ALERT_THRESHOLD      — failures inside the window before alerting (default 5)
 *   CAPTCHA_ALERT_WINDOW_MS      — rolling window (default 5 min)
 *   CAPTCHA_ALERT_COOLDOWN_MS    — min gap between alerts of the same kind (default 15 min)
 *
 * Every channel is optional — with nothing configured this module only logs,
 * so it can never break login.
 */

export type AlertKind = 'html_response' | 'retry' | 'blocked_login' | 'captcha_failed' | 'fallback_activated';

import { getCaptchaSettings, attackState, isFallbackAllowed } from './captchaSettings';

// Thresholds/windows/cooldowns are runtime-configurable from the admin UI.
const WINDOW_MS = () => getCaptchaSettings().alertWindowMs;
const THRESHOLD = () => getCaptchaSettings().alertThreshold;
const COOLDOWN_MS = () => getCaptchaSettings().alertCooldownMs;

const hits = new Map<AlertKind, number[]>();
const lastAlertAt = new Map<AlertKind, number>();

export const alertLog: Array<{ kind: AlertKind; at: string; count: number; channels: string[]; message: string }> = [];

function slackWebhook(): string | null {
  return process.env.CAPTCHA_ALERT_SLACK_WEBHOOK ?? process.env.SLACK_WEBHOOK_URL ?? null;
}

function alertEmails(): string[] {
  const raw = process.env.CAPTCHA_ALERT_EMAIL ?? process.env.ADMIN_ALERT_EMAIL ?? '';
  return raw.split(',').map(e => e.trim()).filter(Boolean);
}

export function alertConfig() {
  return {
    slackConfigured: !!slackWebhook(),
    emailRecipients: alertEmails().length,
    threshold: THRESHOLD(),
    windowMs: WINDOW_MS(),
    cooldownMs: COOLDOWN_MS(),
    fallbackAllowed: isFallbackAllowed(),
    attack: attackState(),
  };
}

async function sendSlack(message: string): Promise<boolean> {
  const url = slackWebhook();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) console.warn(`[captcha-alerts] slack failed [${res.status}]: ${await res.text()}`);
    return res.ok;
  } catch (e: any) {
    console.warn('[captcha-alerts] slack error:', e?.message);
    return false;
  }
}

async function sendEmails(subject: string, message: string): Promise<boolean> {
  const recipients = alertEmails();
  if (recipients.length === 0) return false;
  try {
    const { sendEmail } = await import('./email');
    await Promise.all(
      recipients.map(to =>
        sendEmail({ to, subject, text: message, html: `<pre style="font-family:monospace">${message}</pre>` }).catch(
          (e: any) => console.warn('[captcha-alerts] email error:', e?.message),
        ),
      ),
    );
    return true;
  } catch (e: any) {
    console.warn('[captcha-alerts] email dispatch error:', e?.message);
    return false;
  }
}

/**
 * Records one failure occurrence and fires Slack/email alerts when the rolling
 * window crosses the configured threshold (respecting a per-kind cooldown).
 */
export async function recordAlertSignal(
  kind: AlertKind,
  context: Record<string, unknown> = {},
): Promise<void> {
  const now = Date.now();
  const recent = (hits.get(kind) ?? []).filter(t => now - t < WINDOW_MS());
  recent.push(now);
  hits.set(kind, recent);

  if (recent.length < THRESHOLD()) return;
  const last = lastAlertAt.get(kind) ?? 0;
  if (now - last < COOLDOWN_MS()) return;
  lastAlertAt.set(kind, now);

  const message =
    `🚨 GYDS security-check alert: ${recent.length} "${kind}" events in the last ` +
    `${Math.round(WINDOW_MS() / 60_000)} min.\n` +
    `Context: ${JSON.stringify(context)}\n` +
    `Check Admin → Health → Captcha Monitoring for request-ID drill-down.`;

  const channels: string[] = [];
  if (await sendSlack(message)) channels.push('slack');
  if (await sendEmails(`[GYDS] captcha ${kind} spike`, message)) channels.push('email');
  if (channels.length === 0) channels.push('log-only');

  console.warn(`[captcha-alerts] ${kind} spike (${recent.length}) → ${channels.join(', ')}`);
  alertLog.unshift({ kind, at: new Date(now).toISOString(), count: recent.length, channels, message });
  alertLog.splice(50);
}
