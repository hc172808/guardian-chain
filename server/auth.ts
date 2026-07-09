import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { ethers } from "ethers";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { totp } from "./totp";
import { pool } from "./db";
import { storage } from "./storage";
import { sendPasswordResetEmail, sendEmailVerification } from "./email";
import { sendWhatsAppMessage } from "./whatsapp";
const pgPool = pool;

// ── WhatsApp OTP store (in-memory, short-lived) ───────────────────────────────
interface WaOtpEntry { otp: string; userId: string; expiresAt: number; }
const waOtpStore = new Map<string, WaOtpEntry>(); // key = username (lowercased)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of waOtpStore) if (v.expiresAt < now) waOtpStore.delete(k);
}, 60_000);

// Auth endpoints: 20 attempts per 15 min per IP
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests, please try again later." } });
// TOTP / backup-code verify: tighter (10 per 15 min) — brute-force protection
const totpLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many 2FA attempts. Please wait 15 minutes." } });
// Password-reset confirm: even tighter (5 per 30 min) — token enumeration protection
const resetConfirmLimiter = rateLimit({ windowMs: 30 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: "Too many reset attempts. Please wait 30 minutes." } });

function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
  next();
}

export function getSession(): RequestHandler {
  const PgSession = connectPg(session);
  return session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET ?? "chaincore-secret-" + (process.env.REPL_ID ?? "local"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // On Replit the preview is served in an iframe over HTTPS, so cookies
      // must be Secure + SameSite=None or the browser won't send them back.
      secure: !!(process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT),
      sameSite: (process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT) ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}

export async function setupAuth(app: Express): Promise<void> {
  // trust proxy is already set in index.ts before middleware — do not set again here
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // ── Local (username + password) strategy ───────────────────────────────────
  passport.use(new LocalStrategy(
    { usernameField: "username", passwordField: "password" },
    async (username, password, done) => {
      try {
        const user = await storage.getUserByUsernameOrEmail(username.trim().toLowerCase());
        if (!user) return done(null, false, { message: "Invalid username or password" });
        if (!user.passwordHash) return done(null, false, { message: "Invalid username or password" });
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return done(null, false, { message: "Invalid username or password" });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });

  // ── Register ───────────────────────────────────────────────────────────────
  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const { username, password, email, phone } = req.body ?? {};
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

      const slug = String(username).trim().toLowerCase();
      const existing = await storage.getUserByUsername(slug);
      if (existing) return res.status(409).json({ error: "Username already taken" });

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await storage.createLocalUser({ username: slug, passwordHash, email: email ?? null });

      // Save optional phone number
      if (phone) {
        await (storage as any).pgPool?.query(
          `UPDATE users SET phone=$1 WHERE id=$2`,
          [String(phone).trim(), user.id]
        ).catch(() => {});
        // Also store in profile metadata for WhatsApp use
        await (storage as any).pgPool?.query(
          `UPDATE profiles SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{phone}', $1::jsonb) WHERE user_id=$2`,
          [JSON.stringify(String(phone).trim()), user.id]
        ).catch(() => {});
      }

      // Generate email verification token (stored; actual email delivery requires SMTP configuration)
      if (email) {
        const token = require('crypto').randomBytes(32).toString('hex');
        await (storage as any).pgPool?.query(
          `CREATE TABLE IF NOT EXISTS email_verification_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL,
            token TEXT UNIQUE NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
            used_at TIMESTAMPTZ
          )`
        ).catch(() => {});
        await (storage as any).pgPool?.query(
          `INSERT INTO email_verification_tokens (user_id, token) VALUES ($1, $2)`,
          [user.id, token]
        ).catch(() => {});
        sendEmailVerification(email, token).catch(() => {});
        console.log(`[email-verify] Token for ${email}: ${token}`);
      }

      await new Promise<void>((resolve, reject) =>
        req.login(user, (err) => (err ? reject(err) : resolve()))
      );
      res.json({ ok: true, email_verification: email ? 'pending' : 'not_required' });
    } catch (err: any) {
      console.error("Register error:", err.message);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // ── Email Verification ─────────────────────────────────────────────────────
  app.post("/api/auth/verify-email", authLimiter, async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: "token required" });
      const pgPool = (storage as any).pgPool;
      if (!pgPool) return res.status(503).json({ error: "not available" });
      const row = (await pgPool.query(
        `SELECT * FROM email_verification_tokens WHERE token=$1 AND used_at IS NULL AND expires_at > NOW() LIMIT 1`,
        [token]
      ).catch(() => ({ rows: [] }))).rows[0];
      if (!row) return res.status(400).json({ error: "Invalid or expired token" });
      await pgPool.query(`UPDATE email_verification_tokens SET used_at=NOW() WHERE id=$1`, [row.id]);
      await pgPool.query(`UPDATE profiles SET email_verified=TRUE WHERE id=$1`, [row.user_id]).catch(() => {});
      res.json({ ok: true, message: "Email verified successfully" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/auth/resend-verification", authLimiter, requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const pgPool = (storage as any).pgPool;
      if (!user.email) return res.status(400).json({ error: "No email on account" });
      const token = require('crypto').randomBytes(32).toString('hex');
      await pgPool?.query(
        `INSERT INTO email_verification_tokens (user_id, token) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [user.id, token]
      ).catch(() => {});
      sendEmailVerification(user.email, token).catch(() => {});
      console.log(`[email-verify] Resend token for ${user.email}: ${token}`);
      res.json({ ok: true, message: "Verification email sent" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Login (username + password) ────────────────────────────────────────────
  app.post("/api/auth/login", authLimiter, async (req, res, next) => {
    const { getClientIp, isIpBannedCached, recordLoginFailure, clearLoginFailures, isPrivilegedUsername } = await import("./security");
    const ip = getClientIp(req);
    const submittedUsername = String(req.body?.username ?? "").toLowerCase();

    // Privileged operators (admin/founder) are exempt from IP bans on the login
    // endpoint so they always retain the wallet-signature fallback path.
    const privileged = submittedUsername ? await isPrivilegedUsername(submittedUsername).catch(() => false) : false;

    // Fast pre-check (uses 30s cache primed by ipBanGate on the same request)
    if (!privileged && isIpBannedCached(ip)) {
      return res.status(403).json({ error: "Your IP address has been banned from this service.", code: "IP_BANNED", ip });
    }

    passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) return res.status(500).json({ error: "Login error" });
      if (!user) {
        const { autoBanned, shortCount, redirectUrl, privileged: privilegedFail } = await recordLoginFailure(
          ip, submittedUsername
        ).catch(() => ({ autoBanned: false, shortCount: 0, redirectUrl: null as string | null, privileged: false }));

        // Privileged operator: never ban, always offer wallet fallback.
        if (privilegedFail) {
          return res.status(401).json({
            error: "Invalid credentials. Use your registered wallet to sign in instead — admin/founder accounts cannot be locked out.",
            code: "USE_WALLET_FALLBACK",
            useWalletFallback: true,
          });
        }

        if (autoBanned) {
          return res.status(403).json({ error: "Too many failed login attempts — your IP has been banned for 24 hours.", code: "IP_AUTO_BANNED", ip });
        }
        if (redirectUrl) {
          return res.status(429).json({
            error: "Too many failed attempts from this IP. Redirecting…",
            code: "HONEYPOT_REDIRECT",
            redirectUrl,
            ip,
          });
        }
        const warn = shortCount >= 1
          ? ` (Warning: ${shortCount}/3 failed attempts in 30s — you will be blocked if you continue.)`
          : "";
        return res.status(401).json({ error: (info?.message ?? "Invalid credentials") + warn, shortCount });
      }

      req.login(user, async (loginErr) => {
        if (loginErr) return res.status(500).json({ error: "Session error" });
        (req.session as any).ua = req.headers['user-agent']?.slice(0, 200) ?? 'Unknown';
        (req.session as any).ip = ip;
        (req.session as any).loginAt = new Date().toISOString();
        // Persist last-login IP on the user row
        try {
          await (storage as any).pgPool?.query(
            `UPDATE users SET last_login_ip=$1, last_login_at=NOW() WHERE id=$2`,
            [ip, user.id]
          );
        } catch {}
        clearLoginFailures(ip).catch(() => {});
        // Audit log
        try {
          await storage.insertAuditLog({
            userId: user.id, userEmail: user.email ?? null,
            action: "login", category: "auth",
            targetType: "user", targetId: user.id,
            details: { username: user.username, ua: req.headers['user-agent'] } as any,
            ipAddress: ip,
          } as any);
        } catch {}
        res.json({ ok: true });
        try {
          const { broadcastActivity } = await import('./activityFeed');
          broadcastActivity({ type: 'login', title: 'User Login', detail: `${user.username ?? user.email ?? 'unknown'} signed in`, user: user.username ?? user.email, ip });
        } catch {}
      });
    })(req, res, next);
  });

  // ── Web3: get nonce for a wallet address ───────────────────────────────────
  app.get("/api/auth/nonce", authLimiter, async (req, res) => {
    try {
      const { issueNonce } = await import("./nonceGuard");
      const address = String(req.query.address ?? "").toLowerCase();
      if (!address || !address.startsWith("0x")) return res.status(400).json({ error: "address required" });
      const nonce = crypto.randomBytes(24).toString("hex") + Date.now().toString(36);
      await storage.setUserNonce(address, nonce);
      issueNonce(address, nonce);
      res.json({ nonce, message: `Sign in to ChainCore\nNonce: ${nonce}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Web3: verify signature and log in ─────────────────────────────────────
  app.post("/api/auth/web3", authLimiter, async (req, res) => {
    try {
      const { verifyWalletChallenge } = await import("./walletChallenge");
      const { address, signature } = req.body ?? {};
      const result = await verifyWalletChallenge(address, signature, storage);
      if (!result.ok) return res.status(result.status).json({ error: result.error, code: result.code });
      const addr = result.address;

      // Get or create user for this wallet
      let user = await storage.getUserByWallet(addr);
      if (!user) {
        user = await storage.createWalletUser(addr);
      }

      // Admin/founder wallet self-recovery: signature-verified privileged
      // operators automatically clear their IP ban + failed-attempt history so
      // they can never lock themselves out of their own network.
      try {
        const { isPrivilegedWallet, removeIpBan, clearLoginFailures, getClientIp } = await import("./security");
        if (await isPrivilegedWallet(addr)) {
          const ip = getClientIp(req);
          await removeIpBan(ip).catch(() => {});
          await clearLoginFailures(ip).catch(() => {});
          console.log(`[auth] Privileged wallet ${addr} signed in — cleared bans/failures for ${ip}`);
        }
      } catch {}

      // Immediately ensure admin+founder roles for the founder wallet on every login.
      // This fixes the "shows as regular user" bug on fresh deploys where the
      // user_roles row may not have been seeded yet for this wallet account.
      const founderWallet = (
        process.env.FOUNDER_WALLET_ADDRESS ?? process.env.FOUNDER_WALLET ?? "0x6422d12bfaddee5142bfad21b3006a74d09017b1"
      ).toLowerCase();
      if (addr === founderWallet) {
        const pool = (storage as any).pgPool as import('pg').Pool;
        for (const role of ["user", "admin", "founder"]) {
          await pool.query(
            `INSERT INTO user_roles (id, user_id, role)
             VALUES (gen_random_uuid(), $1, $2)
             ON CONFLICT DO NOTHING`,
            [user.id, role]
          ).catch(() => {});
        }
        console.log(`[auth] Founder wallet login — roles ensured for ${user.id}`);
      }

      await new Promise<void>((resolve, reject) =>
        req.login(user, (err) => (err ? reject(err) : resolve()))
      );
      (req.session as any).ua = req.headers['user-agent']?.slice(0, 200) ?? 'Unknown';
      (req.session as any).ip = req.ip ?? req.socket?.remoteAddress ?? 'Unknown';
      (req.session as any).loginAt = new Date().toISOString();
      res.json({ ok: true });
      try {
        const { broadcastActivity } = await import('./activityFeed');
        const shortAddr = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
        broadcastActivity({ type: 'login', title: 'Web3 Login', detail: `${shortAddr} connected`, user: shortAddr, ip: req.ip ?? undefined });
      } catch {}
    } catch (err: any) {
      console.error("Web3 auth error:", err.message);
      res.status(500).json({ error: "Web3 authentication failed" });
    }
  });

  // ── Change password (authenticated) ───────────────────────────────────────
  app.post("/api/auth/change-password", authLimiter, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const user = req.user as any;
    const { currentPassword, newPassword } = req.body ?? {};
    if (!newPassword) return res.status(400).json({ error: "newPassword required" });
    if (String(newPassword).length < 6) return res.status(400).json({ error: "New password must be at least 6 characters" });
    try {
      const dbUser = await storage.getUser(user.id);
      // Wallet-only users have no existing password — skip the current-password check
      if (dbUser?.passwordHash) {
        if (!currentPassword) return res.status(400).json({ error: "currentPassword required" });
        const ok = await bcrypt.compare(currentPassword, dbUser.passwordHash);
        if (!ok) return res.status(401).json({ error: "Current password is incorrect" });
      }
      const hash = await bcrypt.hash(newPassword, 12);
      await storage.updateUserPassword(user.id, hash);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Password reset: request token ─────────────────────────────────────────
  // Requires the email address registered to the account — username alone is NOT accepted.
  // Token is NEVER returned in the API response; it is sent only to the registered inbox.
  // If SMTP is not configured, the token is printed to server stdout only (owner access).
  app.post("/api/auth/reset-password/request", authLimiter, async (req, res) => {
    try {
      const { email } = req.body ?? {};
      if (!email) return res.status(400).json({ error: "email required" });
      const emailNorm = String(email).trim().toLowerCase();

      // Look up user by email
      const rows = await pgPool.query(`SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1`, [emailNorm]);
      const user = rows.rows[0];

      // Always return the same response — never reveal whether the email is registered
      const safeReply = { ok: true, message: "If that email is registered, a reset link has been sent to your inbox." };

      if (!user) return res.json(safeReply);
      if (!user.email) return res.json(safeReply);

      // If SMTP is not configured: generate a token, log it server-side, and tell the
      // user to paste it manually. Admin can retrieve it from the workflow console.
      if (!process.env.SMTP_HOST) {
        const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await storage.createPasswordResetToken(user.id, token, expiresAt);
        console.warn(`\n[PASSWORD RESET TOKEN] username=${user.username} expires=${expiresAt.toISOString()}\ntoken=${token}\n`);
        return res.json({ ok: true, noSmtp: true, message: "Email is not configured on this server. Your reset token has been printed to the server console. Paste it in the field below." });
      }

      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.createPasswordResetToken(user.id, token, expiresAt);
      await sendPasswordResetEmail(user.email, token).catch((e: any) => {
        console.error("[PASSWORD RESET] Failed to send email:", e.message);
      });

      res.json(safeReply);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Password reset: confirm with token ────────────────────────────────────
  // If the account has 2FA enabled, a valid TOTP code OR backup code is also required.
  app.post("/api/auth/reset-password/confirm", resetConfirmLimiter, async (req, res) => {
    try {
      const { token, newPassword, totpCode } = req.body ?? {};
      if (!token || !newPassword) return res.status(400).json({ error: "token and newPassword required" });
      if (String(newPassword).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

      const row = await storage.getPasswordResetToken(String(token));
      if (!row) return res.status(400).json({ error: "Invalid or expired reset link" });
      if (row.usedAt) return res.status(400).json({ error: "This reset link has already been used" });
      if (new Date(row.expiresAt) < new Date()) return res.status(400).json({ error: "Reset link expired — please request a new one" });

      // Fetch the user to check 2FA status
      const userRow = await pgPool.query(`SELECT totp_secret, totp_enabled, totp_backup_codes FROM users WHERE id = $1`, [row.userId]);
      const u = userRow.rows[0];
      if (u?.totp_enabled && u?.totp_secret) {
        if (!totpCode) return res.status(403).json({ error: "This account has 2FA enabled. Provide your authenticator code to continue.", requires2fa: true });
        // Try TOTP code first
        const valid = totp.verify(u.totp_secret, String(totpCode));
        if (!valid) {
          // Try backup codes
          let codes: string[] = [];
          try { codes = JSON.parse(u.totp_backup_codes || "[]"); } catch {}
          const codeHash = crypto.createHash("sha256").update(String(totpCode).toUpperCase().trim()).digest("hex");
          const idx = codes.indexOf(codeHash);
          if (idx === -1) return res.status(403).json({ error: "Invalid authenticator code or backup code" });
          codes.splice(idx, 1);
          await pgPool.query(`UPDATE users SET totp_backup_codes = $1 WHERE id = $2`, [JSON.stringify(codes), row.userId]);
        }
      }

      const hash = await bcrypt.hash(newPassword, 12);
      await storage.updateUserPassword(row.userId, hash);
      await storage.markPasswordResetTokenUsed(String(token));
      res.json({ ok: true, message: "Password updated successfully" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Password reset: via wallet signature ──────────────────────────────────
  // Flow: 1) GET /api/auth/nonce?address=0x...  2) user signs nonce  3) POST here → get reset token
  app.post("/api/auth/reset-password/wallet", authLimiter, async (req, res) => {
    try {
      const { verifyWalletChallenge } = await import("./walletChallenge");
      const { address, signature } = req.body ?? {};
      const result = await verifyWalletChallenge(address, signature, storage);
      if (!result.ok) return res.status(result.status).json({ error: result.error, code: result.code });
      const addr = result.address;

      // Find account linked to this wallet
      const user = await storage.getUserByWallet(addr);
      if (!user) return res.status(404).json({ error: "No account is linked to this wallet address. Connect the wallet to an account first, or use username reset." });
      // Wallet-only accounts (no passwordHash) are allowed through — they use this flow to SET a password for the first time.

      // Generate reset token (same flow as username reset)
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.createPasswordResetToken(user.id, token, expiresAt);

      res.json({ ok: true, token, username: user.username, expiresAt, message: "Wallet verified — use the token to set your new password." });
    } catch (err: any) {
      console.error("Wallet password reset error:", err.message);
      res.status(500).json({ error: "Wallet verification failed" });
    }
  });

  // ── Password reset: send OTP via WhatsApp ─────────────────────────────────
  // Takes { username }. Looks up user's whatsapp_number from profile metadata.
  // Sends a 6-digit OTP. Valid for 10 minutes.
  app.post("/api/auth/reset-password/whatsapp", authLimiter, async (req, res) => {
    try {
      const { username } = req.body ?? {};
      if (!username) return res.status(400).json({ error: "username required" });
      const slug = String(username).trim().toLowerCase();

      const user = await storage.getUserByUsername(slug);
      if (!user) return res.status(404).json({ error: "Username not found." });

      // Get WhatsApp number from profile metadata
      const rows = await pgPool.query(`SELECT metadata FROM profiles WHERE user_id = $1`, [user.id]);
      const meta = rows.rows[0]?.metadata ?? {};
      const phone = meta.whatsapp_number ?? meta.phone ?? "";
      if (!phone) return res.status(400).json({ error: "No WhatsApp number is linked to this account. Add your number in Profile → Settings first, or use the Wallet reset method." });

      // Generate 6-digit OTP
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      waOtpStore.set(slug, { otp, userId: user.id, expiresAt: Date.now() + 10 * 60 * 1000 });

      const text = [
        `🔐 *GYDSchain Password Reset*`,
        ``,
        `Your one-time code is:`,
        `*${otp}*`,
        ``,
        `This code expires in 10 minutes. Do not share it with anyone.`,
        `If you did not request this, ignore this message.`,
      ].join("\n");

      const result = await sendWhatsAppMessage(phone, text);
      if (!result.ok) {
        console.warn("[WA reset] send failed:", result.error);
        // Still return safe reply — WhatsApp may not be configured yet
      }
      res.json(safeReply);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Password reset: verify WhatsApp OTP → return reset token ──────────────
  app.post("/api/auth/reset-password/whatsapp/verify", authLimiter, async (req, res) => {
    try {
      const { username, otp } = req.body ?? {};
      if (!username || !otp) return res.status(400).json({ error: "username and otp required" });
      const slug = String(username).trim().toLowerCase();
      const entry = waOtpStore.get(slug);

      if (!entry) return res.status(400).json({ error: "No active OTP for this username — request a new code." });
      if (Date.now() > entry.expiresAt) {
        waOtpStore.delete(slug);
        return res.status(400).json({ error: "OTP expired — request a new code." });
      }
      if (String(otp).trim() !== entry.otp) return res.status(401).json({ error: "Incorrect code — try again." });

      // Correct — consume OTP and issue a reset token
      waOtpStore.delete(slug);
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await storage.createPasswordResetToken(entry.userId, token, expiresAt);

      res.json({ ok: true, token, expiresAt, message: "OTP verified — use the token to set your new password." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── TOTP: setup (generate secret + QR URI) ────────────────────────────────
  app.post("/api/auth/totp/setup", authLimiter, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const user = req.user as any;
    try {
      const secret = totp.generateSecret();
      await storage.setTotpSecret(user.id, secret);
      const label = user.username ?? user.email ?? user.id;
      const otpauth = totp.keyuri(label, "GYDSchain", secret);
      res.json({ ok: true, secret, otpauth });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── TOTP: verify and enable ────────────────────────────────────────────────
  app.post("/api/auth/totp/verify", totpLimiter, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const user = req.user as any;
    const { code } = req.body ?? {};
    if (!code) return res.status(400).json({ error: "code required" });
    try {
      const totpData = await storage.getUserTotp(user.id);
      if (!totpData?.totpSecret) return res.status(400).json({ error: "TOTP not set up yet" });
      const valid = totp.verify({ token: String(code), secret: totpData.totpSecret });
      if (!valid) return res.status(401).json({ error: "Invalid code" });
      await storage.enableTotp(user.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── TOTP: generate backup codes ───────────────────────────────────────────
  app.post("/api/auth/totp/backup-codes/generate", authLimiter, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const user = req.user as any;
    try {
      const totpData = await storage.getUserTotp(user.id);
      if (!totpData?.totpEnabled) return res.status(400).json({ error: "2FA must be enabled first" });

      // Generate 8 backup codes: XXXX-XXXX format
      const codes: string[] = [];
      for (let i = 0; i < 8; i++) {
        const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
        const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
        codes.push(`${part1}-${part2}`);
      }

      // Hash codes for storage (SHA-256)
      const hashed = codes.map(c => crypto.createHash("sha256").update(c).digest("hex"));
      await pgPool.query(
        `UPDATE users SET totp_backup_codes=$1, updated_at=NOW() WHERE id=$2`,
        [JSON.stringify(hashed), user.id]
      );

      res.json({ ok: true, codes });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── TOTP: use backup code (consumes it) ───────────────────────────────────
  app.post("/api/auth/totp/backup-codes/use", totpLimiter, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const user = req.user as any;
    const { code } = req.body ?? {};
    if (!code) return res.status(400).json({ error: "code required" });
    try {
      const row = await pgPool.query(
        `SELECT totp_backup_codes FROM users WHERE id=$1`,
        [user.id]
      );
      const storedRaw = row.rows[0]?.totp_backup_codes;
      if (!storedRaw) return res.status(400).json({ error: "No backup codes configured" });
      const stored: string[] = typeof storedRaw === "string" ? JSON.parse(storedRaw) : storedRaw;

      const hashed = crypto.createHash("sha256").update(String(code).toUpperCase().trim()).digest("hex");
      const idx = stored.indexOf(hashed);
      if (idx === -1) return res.status(401).json({ error: "Invalid backup code" });

      // Consume the code (remove from list)
      stored.splice(idx, 1);
      await pgPool.query(
        `UPDATE users SET totp_backup_codes=$1, updated_at=NOW() WHERE id=$2`,
        [JSON.stringify(stored), user.id]
      );

      res.json({ ok: true, codesRemaining: stored.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── TOTP: list backup codes count (not the codes themselves) ──────────────
  app.get("/api/auth/totp/backup-codes", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const user = req.user as any;
    try {
      const row = await pgPool.query(
        `SELECT totp_backup_codes FROM users WHERE id=$1`,
        [user.id]
      );
      const storedRaw = row.rows[0]?.totp_backup_codes;
      const stored: string[] = storedRaw ? (typeof storedRaw === "string" ? JSON.parse(storedRaw) : storedRaw) : [];
      res.json({ ok: true, count: stored.length, hasBackupCodes: stored.length > 0 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── TOTP: disable ─────────────────────────────────────────────────────────
  app.delete("/api/auth/totp", totpLimiter, async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const user = req.user as any;
    const { code } = req.body ?? {};
    try {
      const totpData = await storage.getUserTotp(user.id);
      if (totpData?.totpEnabled && totpData?.totpSecret) {
        if (!code) return res.status(400).json({ error: "code required to disable 2FA" });
        const valid = totp.verify({ token: String(code), secret: totpData.totpSecret });
        if (!valid) return res.status(401).json({ error: "Invalid code" });
      }
      await storage.disableTotp(user.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Active sessions: list ──────────────────────────────────────────────────
  app.get("/api/auth/sessions", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const userId = (req.user as any).id;
    try {
      const result = await pgPool.query(
        `SELECT sid, sess, expire FROM session WHERE sess->'passport'->>'user' = $1 AND expire > NOW() ORDER BY expire DESC`,
        [userId]
      );
      const sessions = result.rows.map((r: any) => ({
        sid: r.sid,
        expires: r.expire,
        current: r.sid === req.sessionID,
        ua: r.sess?.ua ?? null,
        ip: r.sess?.ip ?? null,
        loginAt: r.sess?.loginAt ?? null,
      }));
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Active sessions: revoke one ────────────────────────────────────────────
  app.delete("/api/auth/sessions/:sid", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const userId = (req.user as any).id;
    const { sid } = req.params;
    if (sid === req.sessionID) return res.status(400).json({ error: "Cannot revoke your current session — use Sign Out instead" });
    try {
      const check = await pgPool.query(
        `SELECT sid FROM session WHERE sid=$1 AND sess->'passport'->>'user'=$2`,
        [sid, userId]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: "Session not found" });
      await pgPool.query(`DELETE FROM session WHERE sid=$1`, [sid]);
      res.json({ ok: true, message: "Session revoked" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Logout ─────────────────────────────────────────────────────────────────
  app.get("/api/auth/logout", (req, res) => {
    req.logout(() => res.redirect("/auth"));
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => res.json({ ok: true }));
  });

  // ── Current user ───────────────────────────────────────────────────────────
  app.get("/api/auth/user", (req, res) => {
    if (!req.isAuthenticated()) return res.json(null);
    res.json(req.user);
  });
}
