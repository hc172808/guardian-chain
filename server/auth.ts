import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { ethers } from "ethers";
import rateLimit from "express-rate-limit";
import { totp } from "./totp";
import { pool } from "./db";
import { storage } from "./storage";

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests, please try again later." } });

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
      secure: !!process.env.REPLIT_DEPLOYMENT,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}

export async function setupAuth(app: Express): Promise<void> {
  app.set("trust proxy", 1);
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
      const { username, password, email } = req.body ?? {};
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

      const slug = String(username).trim().toLowerCase();
      const existing = await storage.getUserByUsername(slug);
      if (existing) return res.status(409).json({ error: "Username already taken" });

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await storage.createLocalUser({ username: slug, passwordHash, email: email ?? null });

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
        // In production, send email to `email` with link: /verify-email?token=<token>
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
  app.post("/api/auth/verify-email", async (req, res) => {
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

  app.post("/api/auth/resend-verification", requireAuth, async (req, res) => {
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
      console.log(`[email-verify] Resend token for ${user.email}: ${token}`);
      res.json({ ok: true, message: "Verification email sent (check server logs in dev)" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Login (username + password) ────────────────────────────────────────────
  app.post("/api/auth/login", authLimiter, (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return res.status(500).json({ error: "Login error" });
      if (!user) return res.status(401).json({ error: info?.message ?? "Invalid credentials" });
      req.login(user, (loginErr) => {
        if (loginErr) return res.status(500).json({ error: "Session error" });
        res.json({ ok: true });
      });
    })(req, res, next);
  });

  // ── Web3: get nonce for a wallet address ───────────────────────────────────
  app.get("/api/auth/nonce", async (req, res) => {
    try {
      const address = String(req.query.address ?? "").toLowerCase();
      if (!address || !address.startsWith("0x")) return res.status(400).json({ error: "address required" });
      const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await storage.setUserNonce(address, nonce);
      res.json({ nonce, message: `Sign in to ChainCore\nNonce: ${nonce}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Web3: verify signature and log in ─────────────────────────────────────
  app.post("/api/auth/web3", async (req, res) => {
    try {
      const { address, signature } = req.body ?? {};
      if (!address || !signature) return res.status(400).json({ error: "address and signature required" });

      const addr = String(address).toLowerCase();
      const nonceRow = await storage.getUserNonce(addr);
      if (!nonceRow) return res.status(400).json({ error: "No nonce found — request a new one" });

      const message = `Sign in to ChainCore\nNonce: ${nonceRow}`;
      const recovered = ethers.verifyMessage(message, signature).toLowerCase();
      if (recovered !== addr) return res.status(401).json({ error: "Signature verification failed" });

      // Clear nonce (one-time use)
      await storage.clearUserNonce(addr);

      // Get or create user for this wallet
      let user = await storage.getUserByWallet(addr);
      if (!user) {
        user = await storage.createWalletUser(addr);
      }

      await new Promise<void>((resolve, reject) =>
        req.login(user, (err) => (err ? reject(err) : resolve()))
      );
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Web3 auth error:", err.message);
      res.status(500).json({ error: "Web3 authentication failed" });
    }
  });

  // ── Change password (authenticated) ───────────────────────────────────────
  app.post("/api/auth/change-password", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    const user = req.user as any;
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "currentPassword and newPassword required" });
    if (String(newPassword).length < 6) return res.status(400).json({ error: "New password must be at least 6 characters" });
    try {
      const dbUser = await storage.getUser(user.id);
      if (!dbUser?.passwordHash) return res.status(400).json({ error: "Account has no password set" });
      const ok = await bcrypt.compare(currentPassword, dbUser.passwordHash);
      if (!ok) return res.status(401).json({ error: "Current password is incorrect" });
      const hash = await bcrypt.hash(newPassword, 12);
      await storage.updateUserPassword(user.id, hash);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Password reset: request token ─────────────────────────────────────────
  app.post("/api/auth/reset-password/request", async (req, res) => {
    try {
      const { username } = req.body ?? {};
      if (!username) return res.status(400).json({ error: "username required" });
      const user = await storage.getUserByUsername(String(username).trim().toLowerCase());
      // Always return ok (don't leak whether username exists)
      if (!user) return res.json({ ok: true, message: "If that account exists, a reset token has been generated." });
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.createPasswordResetToken(user.id, token, expiresAt);
      // In production: send email. For now, return token directly (founder/dev use).
      res.json({ ok: true, token, message: "Reset token generated. Use it within 1 hour.", expiresAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Password reset: confirm with token ────────────────────────────────────
  app.post("/api/auth/reset-password/confirm", async (req, res) => {
    try {
      const { token, newPassword } = req.body ?? {};
      if (!token || !newPassword) return res.status(400).json({ error: "token and newPassword required" });
      if (String(newPassword).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      const row = await storage.getPasswordResetToken(String(token));
      if (!row) return res.status(400).json({ error: "Invalid or expired token" });
      if (row.usedAt) return res.status(400).json({ error: "Token already used" });
      if (new Date(row.expiresAt) < new Date()) return res.status(400).json({ error: "Token expired" });
      const hash = await bcrypt.hash(newPassword, 12);
      await storage.updateUserPassword(row.userId, hash);
      await storage.markPasswordResetTokenUsed(String(token));
      res.json({ ok: true, message: "Password updated successfully" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── TOTP: setup (generate secret + QR URI) ────────────────────────────────
  app.post("/api/auth/totp/setup", async (req, res) => {
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
  app.post("/api/auth/totp/verify", async (req, res) => {
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

  // ── TOTP: disable ─────────────────────────────────────────────────────────
  app.delete("/api/auth/totp", async (req, res) => {
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
