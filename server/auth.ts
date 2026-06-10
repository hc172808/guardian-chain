import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { ethers } from "ethers";
import { pool } from "./db";
import { storage } from "./storage";

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
        const user = await storage.getUserByUsername(username.trim().toLowerCase());
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
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, email } = req.body ?? {};
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

      const slug = String(username).trim().toLowerCase();
      const existing = await storage.getUserByUsername(slug);
      if (existing) return res.status(409).json({ error: "Username already taken" });

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await storage.createLocalUser({ username: slug, passwordHash, email: email ?? null });

      await new Promise<void>((resolve, reject) =>
        req.login(user, (err) => (err ? reject(err) : resolve()))
      );
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Register error:", err.message);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // ── Login (username + password) ────────────────────────────────────────────
  app.post("/api/auth/login", (req, res, next) => {
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
