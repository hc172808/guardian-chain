import { Router, type Request, type Response } from "express";
import { SiweMessage } from "siwe";
import { db } from "@workspace/db";
import { walletUsersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

// ── Nonce ─────────────────────────────────────────────────────────────────────
// GET /auth/nonce — generate a one-time nonce for SIWE signing
router.get("/auth/nonce", (req: Request, res: Response) => {
  const nonce = crypto.randomBytes(16).toString("hex");
  (req.session as any).siweNonce = nonce;
  res.json({ nonce });
});

// ── Verify ────────────────────────────────────────────────────────────────────
// POST /auth/wallet/verify — verify SIWE signature and create session
router.post("/auth/wallet/verify", async (req: Request, res: Response) => {
  try {
    const { message, signature } = req.body as { message?: string; signature?: string };
    if (!message || !signature) {
      res.status(400).json({ error: "message and signature are required" });
      return;
    }

    const siweMessage = new SiweMessage(message);
    const result = await siweMessage.verify({
      signature,
      nonce: (req.session as any).siweNonce,
    });

    if (!result.success) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    const address = siweMessage.address.toLowerCase();

    // Upsert wallet user
    const [user] = await db
      .insert(walletUsersTable)
      .values({ wallet_address: address })
      .onConflictDoUpdate({
        target: walletUsersTable.wallet_address,
        set: { updated_at: new Date() },
      })
      .returning();

    // Store in session
    (req.session as any).walletAddress = address;
    (req.session as any).walletUserId = user.id;
    (req.session as any).siweNonce = null;

    res.json({ ok: true, user });
  } catch (err) {
    res.status(400).json({ error: "Verification failed", detail: String(err) });
  }
});

// ── Wallet User ───────────────────────────────────────────────────────────────
// GET /auth/wallet/user — get current wallet-authenticated user
router.get("/auth/wallet/user", async (req: Request, res: Response) => {
  const address = (req.session as any)?.walletAddress;
  if (!address) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const [user] = await db
      .select()
      .from(walletUsersTable)
      .where(eq(walletUsersTable.wallet_address, address))
      .limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch wallet user" });
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
// POST /auth/wallet/logout — clear wallet session
router.post("/auth/wallet/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

export default router;
