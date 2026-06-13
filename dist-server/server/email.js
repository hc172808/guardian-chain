"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
exports.sendEmailVerification = sendEmailVerification;
exports.sendPriceAlertEmail = sendPriceAlertEmail;
exports.sendGovernanceNotificationEmail = sendGovernanceNotificationEmail;
/**
 * Email service — uses nodemailer if SMTP_HOST is set, otherwise logs to console.
 * Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM to enable real delivery.
 */
const nodemailer_1 = __importDefault(require("nodemailer"));
function createTransport() {
    const host = process.env.SMTP_HOST;
    if (!host)
        return null;
    return nodemailer_1.default.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT ?? '587', 10),
        secure: process.env.SMTP_PORT === '465',
        auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
            : undefined,
    });
}
const FROM = process.env.SMTP_FROM ?? 'noreply@netlifegy.com';
const APP_URL = process.env.APP_URL ?? 'https://app.netlifegy.com';
async function sendEmail(opts) {
    const transport = createTransport();
    if (!transport) {
        console.log(`[email] (no SMTP — console only)\n  To: ${opts.to}\n  Subject: ${opts.subject}\n  Body: ${opts.text ?? opts.subject}`);
        return { ok: true, dev: true };
    }
    await transport.sendMail({ from: FROM, ...opts });
    return { ok: true, dev: false };
}
async function sendPasswordResetEmail(to, token) {
    const link = `${APP_URL}/reset-password?token=${token}`;
    return sendEmail({
        to,
        subject: 'Reset your ChainCore password',
        text: `Click to reset your password: ${link}\n\nThis link expires in 1 hour.`,
        html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#00e5b4;margin:0;font-size:24px;">ChainCore</h1>
          <p style="color:#8b949e;margin:4px 0 0;">GYDSchain Network</p>
        </div>
        <h2 style="font-size:18px;margin-bottom:8px;">Reset your password</h2>
        <p style="color:#8b949e;">Click the button below to reset your ChainCore password. This link expires in <strong>1 hour</strong>.</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${link}" style="background:#00e5b4;color:#0d1117;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;">Reset Password</a>
        </div>
        <p style="color:#8b949e;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border-color:#30363d;margin:20px 0;">
        <p style="color:#8b949e;font-size:11px;text-align:center;">ChainCore — <a href="${APP_URL}" style="color:#00e5b4;">${APP_URL}</a></p>
      </div>
    `,
    });
}
async function sendEmailVerification(to, token) {
    const link = `${APP_URL}/verify-email?token=${token}`;
    return sendEmail({
        to,
        subject: 'Verify your ChainCore email',
        text: `Verify your email: ${link}`,
        html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#00e5b4;margin:0;font-size:24px;">ChainCore</h1>
        </div>
        <h2 style="font-size:18px;margin-bottom:8px;">Verify your email</h2>
        <p style="color:#8b949e;">Click the button below to verify your email address.</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${link}" style="background:#00e5b4;color:#0d1117;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;">Verify Email</a>
        </div>
        <hr style="border-color:#30363d;margin:20px 0;">
        <p style="color:#8b949e;font-size:11px;text-align:center;">ChainCore — <a href="${APP_URL}" style="color:#00e5b4;">${APP_URL}</a></p>
      </div>
    `,
    });
}
async function sendPriceAlertEmail(to, symbol, price, target, direction) {
    return sendEmail({
        to,
        subject: `Price Alert: ${symbol} is ${direction} $${target}`,
        text: `${symbol} price alert triggered. Current price: $${price}. Your target was ${direction} $${target}.`,
        html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;">
        <h1 style="color:#00e5b4;font-size:20px;">🔔 Price Alert Triggered</h1>
        <p><strong>${symbol}</strong> is now <strong>${direction} $${target}</strong></p>
        <p style="font-size:28px;font-weight:bold;color:#00e5b4;">$${price.toFixed(6)}</p>
        <a href="${APP_URL}/tokens" style="background:#00e5b4;color:#0d1117;font-weight:700;padding:10px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:12px;">View Token</a>
      </div>
    `,
    });
}
async function sendGovernanceNotificationEmail(to, title, proposalId) {
    return sendEmail({
        to,
        subject: `New Governance Proposal: ${title}`,
        text: `A new governance proposal has been submitted: ${title}. Vote at ${APP_URL}/governance`,
        html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;">
        <h1 style="color:#00e5b4;font-size:20px;">🗳️ New Governance Proposal</h1>
        <p style="font-size:16px;font-weight:bold;">${title}</p>
        <p style="color:#8b949e;">A new proposal is live and ready for your vote.</p>
        <a href="${APP_URL}/governance" style="background:#00e5b4;color:#0d1117;font-weight:700;padding:10px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:12px;">Vote Now</a>
      </div>
    `,
    });
}
