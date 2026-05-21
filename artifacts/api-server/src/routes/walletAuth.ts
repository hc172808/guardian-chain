import { Router, type Request, type Response } from "express";
import { ethers } from "ethers";
import { db } from "@workspace/db";
import { walletUsersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

// ── Nonce ─────────────────────────────────────────────────────────────────────
router.get("/auth/nonce", (req: Request, res: Response) => {
  const nonce = crypto.randomBytes(16).toString("hex");
  (req.session as any).siweNonce = nonce;
  req.session.save(() => {
    res.json({ nonce });
  });
});

// ── Verify ────────────────────────────────────────────────────────────────────
router.post("/auth/wallet/verify", async (req: Request, res: Response) => {
  try {
    const { message, signature } = req.body as { message?: string; signature?: string };
    if (!message || !signature) {
      res.status(400).json({ error: "message and signature are required" });
      return;
    }

    // Check nonce matches session (replay protection)
    const sessionNonce: string | undefined = (req.session as any).siweNonce;
    if (sessionNonce && !message.includes(sessionNonce)) {
      res.status(401).json({ error: "Nonce mismatch — please try signing in again" });
      return;
    }

    // Recover the signer address via ethers (avoids siwe parser issues)
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(message, signature);
    } catch {
      res.status(401).json({ error: "Invalid signature format" });
      return;
    }

    // Extract claimed address from SIWE message (always on line 2)
    const lines = message.split("\n");
    const claimedAddress = lines[1]?.trim() ?? "";
    if (!claimedAddress || recovered.toLowerCase() !== claimedAddress.toLowerCase()) {
      res.status(401).json({ error: "Signature does not match the connected address" });
      return;
    }

    const address = recovered.toLowerCase();

    // Upsert wallet user
    const [user] = await db
      .insert(walletUsersTable)
      .values({ wallet_address: address })
      .onConflictDoUpdate({
        target: walletUsersTable.wallet_address,
        set: { updated_at: new Date() },
      })
      .returning();

    (req.session as any).walletAddress = address;
    (req.session as any).walletUserId = user.id;
    (req.session as any).siweNonce = null;

    req.session.save(() => {
      res.json({ ok: true, user });
    });
  } catch (err) {
    res.status(400).json({ error: "Verification failed", detail: String(err) });
  }
});

// ── Wallet User ───────────────────────────────────────────────────────────────
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
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch wallet user" });
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post("/auth/wallet/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

export default router;
