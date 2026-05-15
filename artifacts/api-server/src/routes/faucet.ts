import { Router, type Request, type Response } from "express";
import { safeGetAuth as getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { faucetClaimsTable } from "@workspace/db/schema";
import { eq, desc, and, gte } from "drizzle-orm";

const FAUCET_AMOUNT = 10;
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

const router = Router();

// GET /faucet/claims — list all claims (public, paginated)
router.get("/faucet/claims", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    const rows = await db.select().from(faucetClaimsTable)
      .orderBy(desc(faucetClaimsTable.claimed_at))
      .limit(limit)
      .offset(offset);

    res.json({ claims: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list faucet claims");
    res.status(500).json({ error: "Failed to list faucet claims" });
  }
});

// GET /faucet/claims/me — list claims for authenticated user
router.get("/faucet/claims/me", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select().from(faucetClaimsTable)
      .where(eq(faucetClaimsTable.user_id, userId))
      .orderBy(desc(faucetClaimsTable.claimed_at));
    res.json({ claims: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list user faucet claims");
    res.status(500).json({ error: "Failed to list user faucet claims" });
  }
});

// GET /faucet/status — check if user can claim
router.get("/faucet/status", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const cutoff = new Date(Date.now() - COOLDOWN_MS);
    const recent = await db.select().from(faucetClaimsTable)
      .where(and(
        eq(faucetClaimsTable.user_id, userId),
        gte(faucetClaimsTable.claimed_at, cutoff),
      ))
      .limit(1);

    const canClaim = recent.length === 0;
    const nextClaimAt = canClaim ? null : new Date(recent[0].claimed_at.getTime() + COOLDOWN_MS);

    res.json({ canClaim, amount: FAUCET_AMOUNT, cooldownHours: 24, nextClaimAt });
  } catch (err) {
    req.log.error({ err }, "Failed to check faucet status");
    res.status(500).json({ error: "Failed to check faucet status" });
  }
});

// POST /faucet/claim — claim tokens
router.post("/faucet/claim", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { wallet_address } = req.body as { wallet_address?: string };
  if (!wallet_address) {
    res.status(400).json({ error: "wallet_address is required" });
    return;
  }
  try {
    // Enforce 24h cooldown
    const cutoff = new Date(Date.now() - COOLDOWN_MS);
    const recent = await db.select().from(faucetClaimsTable)
      .where(and(
        eq(faucetClaimsTable.user_id, userId),
        gte(faucetClaimsTable.claimed_at, cutoff),
      ))
      .limit(1);

    if (recent.length > 0) {
      const nextClaimAt = new Date(recent[0].claimed_at.getTime() + COOLDOWN_MS);
      res.status(429).json({
        error: "Faucet cooldown active",
        nextClaimAt,
        cooldownHours: 24,
      });
      return;
    }

    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      ?? req.socket?.remoteAddress
      ?? null;

    const fakeTxHash = `0x${Math.random().toString(16).slice(2).padStart(64, "0")}`;

    const [claim] = await db.insert(faucetClaimsTable).values({
      user_id: userId,
      wallet_address,
      amount: FAUCET_AMOUNT,
      ip_address: ip,
      tx_hash: fakeTxHash,
    }).returning();

    res.status(201).json({ claim, amount: FAUCET_AMOUNT, tx_hash: fakeTxHash });
  } catch (err) {
    req.log.error({ err }, "Failed to process faucet claim");
    res.status(500).json({ error: "Failed to process faucet claim" });
  }
});

export default router;
