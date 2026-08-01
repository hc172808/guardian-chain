/**
 * Email service — uses nodemailer if SMTP_HOST is set, otherwise logs to console.
 * Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM to enable real delivery.
 */
import nodemailer from 'nodemailer';

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
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

export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string }) {
  const transport = createTransport();
  if (!transport) {
    console.log(`[email] (no SMTP — console only)\n  To: ${opts.to}\n  Subject: ${opts.subject}\n  Body: ${opts.text ?? opts.subject}`);
    return { ok: true, dev: true };
  }
  await transport.sendMail({ from: FROM, ...opts });
  return { ok: true, dev: false };
}

export async function sendPasswordResetEmail(to: string, token: string) {
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

export async function sendEmailVerification(to: string, token: string) {
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

export async function sendPriceAlertEmail(to: string, symbol: string, price: number, target: number, direction: 'above' | 'below') {
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

export async function sendGovernanceNotificationEmail(to: string, title: string, proposalId: string) {
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

export async function sendBridgeCompletionEmail(to: string, opts: {
  fromChain: string; toChain: string; fromToken: string; amount: string; destTxHash?: string;
}) {
  return sendEmail({
    to,
    subject: `✅ Bridge Transfer Complete — ${opts.amount} ${opts.fromToken}`,
    text: `Your bridge transfer of ${opts.amount} ${opts.fromToken} from ${opts.fromChain} → ${opts.toChain} has completed. ${opts.destTxHash ? `Destination tx: ${opts.destTxHash}` : ''} View at ${APP_URL}/defi`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;">
        <h1 style="color:#00e5b4;font-size:20px;">🌉 Bridge Transfer Complete</h1>
        <p><strong>${opts.amount} ${opts.fromToken}</strong> moved from <strong>${opts.fromChain}</strong> → <strong>${opts.toChain}</strong></p>
        ${opts.destTxHash ? `<p style="font-family:monospace;font-size:12px;color:#8b949e;word-break:break-all;">Destination tx: ${opts.destTxHash}</p>` : ''}
        <a href="${APP_URL}/defi" style="background:#00e5b4;color:#0d1117;font-weight:700;padding:10px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:12px;">View DeFi</a>
      </div>
    `,
  });
}

export async function sendStakingRewardEmail(to: string, opts: { amount: string; symbol: string; apr: number }) {
  return sendEmail({
    to,
    subject: `🏆 Staking Reward: ${opts.amount} ${opts.symbol}`,
    text: `You earned ${opts.amount} ${opts.symbol} in staking rewards (${opts.apr}% APR). View at ${APP_URL}/defi`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;">
        <h1 style="color:#00e5b4;font-size:20px;">🏆 Staking Reward Received</h1>
        <p>You earned <strong style="color:#00e5b4;font-size:24px;">${opts.amount} ${opts.symbol}</strong></p>
        <p style="color:#8b949e;">${opts.apr}% APR · auto-compounded</p>
        <a href="${APP_URL}/defi" style="background:#00e5b4;color:#0d1117;font-weight:700;padding:10px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:12px;">View Staking</a>
      </div>
    `,
  });
}

export async function sendBuyRequestStatusEmail(to: string, opts: {
  status: string; reference: string; tokenAmount: string; tokenSymbol: string;
  paymentMethod: string; adminNote?: string;
}) {
  const approved = opts.status === 'approved' || opts.status === 'completed';
  const color = approved ? '#00e5b4' : '#f85149';
  const emoji = approved ? '✅' : '❌';
  const heading = approved ? 'Buy Request Approved' : 'Buy Request Rejected';
  const body = approved
    ? `Your request to buy <strong>${opts.tokenAmount} ${opts.tokenSymbol}</strong> via ${opts.paymentMethod} has been <strong style="color:${color}">approved</strong>. Tokens will be credited to your wallet shortly.`
    : `Your request to buy <strong>${opts.tokenAmount} ${opts.tokenSymbol}</strong> via ${opts.paymentMethod} has been <strong style="color:${color}">rejected</strong>.${opts.adminNote ? ` Reason: ${opts.adminNote}` : ''}`;
  return sendEmail({
    to,
    subject: `${emoji} Buy Request ${opts.status.charAt(0).toUpperCase() + opts.status.slice(1)} — ${opts.reference}`,
    text: `${heading}: ${opts.tokenAmount} ${opts.tokenSymbol} via ${opts.paymentMethod}. Reference: ${opts.reference}. View your wallet at ${APP_URL}/wallet`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="color:#00e5b4;margin:0;font-size:22px;">ChainCore</h1>
          <p style="color:#8b949e;margin:4px 0 0;font-size:13px;">GYDSchain Network</p>
        </div>
        <h2 style="font-size:18px;color:${color};margin-bottom:12px;">${emoji} ${heading}</h2>
        <p style="color:#c9d1d9;">${body}</p>
        <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:4px 0;font-size:13px;color:#8b949e;">Reference: <span style="color:#c9d1d9;font-family:monospace;">${opts.reference}</span></p>
          <p style="margin:4px 0;font-size:13px;color:#8b949e;">Token: <strong style="color:#c9d1d9;">${opts.tokenAmount} ${opts.tokenSymbol}</strong></p>
          <p style="margin:4px 0;font-size:13px;color:#8b949e;">Payment via: <span style="color:#c9d1d9;">${opts.paymentMethod}</span></p>
          <p style="margin:4px 0;font-size:13px;color:#8b949e;">Status: <strong style="color:${color};">${opts.status.toUpperCase()}</strong></p>
        </div>
        <div style="text-align:center;">
          <a href="${APP_URL}/wallet" style="background:#00e5b4;color:#0d1117;font-weight:700;padding:11px 28px;border-radius:8px;text-decoration:none;display:inline-block;">View Wallet</a>
        </div>
        <hr style="border-color:#30363d;margin:24px 0;">
        <p style="color:#8b949e;font-size:11px;text-align:center;">ChainCore — <a href="${APP_URL}" style="color:#00e5b4;">${APP_URL}</a></p>
      </div>
    `,
  });
}

export async function sendCashoutStatusEmail(to: string, opts: {
  status: string; reference: string; amount: string; asset: string;
  paymentMethod: string; destination: string; adminNote?: string;
}) {
  const approved = opts.status === 'approved' || opts.status === 'completed';
  const color = approved ? '#00e5b4' : '#f85149';
  const emoji = approved ? '✅' : '❌';
  const heading = approved ? 'Cash Out Approved' : 'Cash Out Rejected';
  const body = approved
    ? `Your cash out of <strong>${opts.amount} ${opts.asset}</strong> via ${opts.paymentMethod} has been <strong style="color:${color}">approved</strong>. Funds will be sent to your destination within 1–3 business days.`
    : `Your cash out of <strong>${opts.amount} ${opts.asset}</strong> via ${opts.paymentMethod} has been <strong style="color:${color}">rejected</strong>.${opts.adminNote ? ` Reason: ${opts.adminNote}` : ''}`;
  return sendEmail({
    to,
    subject: `${emoji} Cash Out ${opts.status.charAt(0).toUpperCase() + opts.status.slice(1)} — ${opts.reference}`,
    text: `${heading}: ${opts.amount} ${opts.asset} via ${opts.paymentMethod}. Reference: ${opts.reference}. View your wallet at ${APP_URL}/wallet`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:32px;border-radius:12px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="color:#00e5b4;margin:0;font-size:22px;">ChainCore</h1>
          <p style="color:#8b949e;margin:4px 0 0;font-size:13px;">GYDSchain Network</p>
        </div>
        <h2 style="font-size:18px;color:${color};margin-bottom:12px;">${emoji} ${heading}</h2>
        <p style="color:#c9d1d9;">${body}</p>
        <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:4px 0;font-size:13px;color:#8b949e;">Reference: <span style="color:#c9d1d9;font-family:monospace;">${opts.reference}</span></p>
          <p style="margin:4px 0;font-size:13px;color:#8b949e;">Amount: <strong style="color:#c9d1d9;">${opts.amount} ${opts.asset}</strong></p>
          <p style="margin:4px 0;font-size:13px;color:#8b949e;">Payment via: <span style="color:#c9d1d9;">${opts.paymentMethod}</span></p>
          <p style="margin:4px 0;font-size:13px;color:#8b949e;">Destination: <span style="color:#c9d1d9;font-family:monospace;">${opts.destination}</span></p>
          <p style="margin:4px 0;font-size:13px;color:#8b949e;">Status: <strong style="color:${color};">${opts.status.toUpperCase()}</strong></p>
        </div>
        <div style="text-align:center;">
          <a href="${APP_URL}/wallet" style="background:#00e5b4;color:#0d1117;font-weight:700;padding:11px 28px;border-radius:8px;text-decoration:none;display:inline-block;">View Wallet</a>
        </div>
        <hr style="border-color:#30363d;margin:24px 0;">
        <p style="color:#8b949e;font-size:11px;text-align:center;">ChainCore — <a href="${APP_URL}" style="color:#00e5b4;">${APP_URL}</a></p>
      </div>
    `,
  });
}
