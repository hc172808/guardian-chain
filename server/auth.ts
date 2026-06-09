import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
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

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });

  // Replit OIDC login — lazy discovery to avoid startup crash
  app.get("/api/auth/login", async (req, res) => {
    try {
      const { default: client } = await import("openid-client");
      const replitUrl = `https://${process.env.REPLIT_DEV_DOMAIN ?? "localhost:5000"}`;
      const callbackUrl = `${replitUrl}/api/auth/callback`;
      const REPL_ID = process.env.REPL_ID!;
      const config = await client.discovery(new URL("https://replit.com/oidc"), REPL_ID);
      const params = new URLSearchParams({ redirect_uri: callbackUrl, scope: "openid email profile" });
      const redirectTo = client.buildAuthorizationUrl(config, params as any);
      // Store state in session for CSRF protection
      (req.session as any).oidcRedirect = callbackUrl;
      res.redirect(redirectTo.href);
    } catch (err: any) {
      console.error("OIDC login error:", err.message);
      res.redirect("/auth?error=login_failed");
    }
  });

  app.get("/api/auth/callback", async (req, res) => {
    try {
      const { default: client } = await import("openid-client");
      const replitUrl = `https://${process.env.REPLIT_DEV_DOMAIN ?? "localhost:5000"}`;
      const callbackUrl = `${replitUrl}/api/auth/callback`;
      const REPL_ID = process.env.REPL_ID!;
      const config = await client.discovery(new URL("https://replit.com/oidc"), REPL_ID);
      const currentUrl = new URL(req.url, replitUrl);
      const tokens = await client.authorizationCodeGrant(config, currentUrl, { expectedState: client.skipStateCheck });
      const claims = tokens.claims();
      if (!claims?.sub) return res.redirect("/auth?error=no_user");
      const userData = {
        id: String(claims.sub),
        email: claims.email as string | undefined,
        firstName: (claims.first_name ?? claims.given_name) as string | undefined,
        lastName: (claims.last_name ?? claims.family_name) as string | undefined,
        profileImageUrl: claims.profile_image_url as string | undefined,
      };
      const user = await storage.upsertUser(userData);
      await new Promise<void>((resolve, reject) =>
        req.login(user, (err) => (err ? reject(err) : resolve()))
      );
      res.redirect("/");
    } catch (err: any) {
      console.error("OIDC callback error:", err.message);
      res.redirect("/auth?error=callback_failed");
    }
  });

  app.get("/api/auth/logout", (req, res) => {
    req.logout(() => res.redirect("/"));
  });

  app.get("/api/auth/user", (req, res) => {
    if (!req.isAuthenticated()) return res.json(null);
    res.json(req.user);
  });
}
