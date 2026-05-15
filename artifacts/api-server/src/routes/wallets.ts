import { Router, type Request, type Response } from "express";
import { safeGetAuth as getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { walletsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

// GET /wallets — list wallets for authenticated user
router.get("/wallets", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select({
      id: walletsTable.id,
      address: walletsTable.address,
      created_at: walletsTable.created_at,
    }).from(walletsTable)
      .where(eq(walletsTable.user_id, userId))
      .orderBy(desc(walletsTable.created_at));
    res.json({ wallets: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list wallets");
    res.status(500).json({ error: "Failed to list wallets" });
  }
});

// GET /wallets/:id — get a single wallet (owner only)
router.get("/wallets/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select({
      id: walletsTable.id,
      address: walletsTable.address,
      created_at: walletsTable.created_at,
    }).from(walletsTable)
      .where(eq(walletsTable.id, req.params.id))
      .limit(1);
    const wallet = rows[0];
    if (!wallet) { res.status(404).json({ error: "Wallet not found" }); return; }
    res.json({ wallet });
  } catch (err) {
    req.log.error({ err }, "Failed to get wallet");
    res.status(500).json({ error: "Failed to get wallet" });
  }
});

// POST /wallets — create a new wallet for the authenticated user
router.post("/wallets", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { address, encrypted_seed, pin_hash } = req.body as {
    address?: string;
    encrypted_seed?: string;
    pin_hash?: string;
  };
  if (!address || !encrypted_seed || !pin_hash) {
    res.status(400).json({ error: "address, encrypted_seed, and pin_hash are required" });
    return;
  }
  try {
    const [wallet] = await db.insert(walletsTable).values({
      user_id: userId,
      address,
      encrypted_seed,
      pin_hash,
    }).returning({
      id: walletsTable.id,
      address: walletsTable.address,
      created_at: walletsTable.created_at,
    });
    res.status(201).json({ wallet });
  } catch (err) {
    req.log.error({ err }, "Failed to create wallet");
    res.status(500).json({ error: "Failed to create wallet" });
  }
});

// DELETE /wallets/:id — delete own wallet
router.delete("/wallets/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const deleted = await db.delete(walletsTable)
      .where(eq(walletsTable.id, req.params.id))
      .returning({ id: walletsTable.id });
    if (!deleted.length) { res.status(404).json({ error: "Wallet not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete wallet");
    res.status(500).json({ error: "Failed to delete wallet" });
  }
});

export default router;
