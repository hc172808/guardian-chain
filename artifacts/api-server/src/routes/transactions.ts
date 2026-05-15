import { Router, type Request, type Response } from "express";
import { safeGetAuth as getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { transactionsTable } from "@workspace/db/schema";
import { eq, desc, and, or } from "drizzle-orm";

const router = Router();

// GET /transactions — list all transactions (public)
router.get("/transactions", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const status = req.query.status as string | undefined;
    const tx_type = req.query.tx_type as string | undefined;

    const where = and(
      status ? eq(transactionsTable.status, status) : undefined,
      tx_type ? eq(transactionsTable.tx_type, tx_type) : undefined,
    );

    const rows = await db.select().from(transactionsTable)
      .where(where)
      .orderBy(desc(transactionsTable.created_at))
      .limit(limit)
      .offset(offset);

    res.json({ transactions: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list transactions");
    res.status(500).json({ error: "Failed to list transactions" });
  }
});

// GET /transactions/me — list transactions for authenticated user
router.get("/transactions/me", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    const rows = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.user_id, userId))
      .orderBy(desc(transactionsTable.created_at))
      .limit(limit)
      .offset(offset);

    res.json({ transactions: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list user transactions");
    res.status(500).json({ error: "Failed to list user transactions" });
  }
});

// GET /transactions/address/:address — transactions for a wallet address
router.get("/transactions/address/:address", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const address = req.params.address;

    const rows = await db.select().from(transactionsTable)
      .where(or(
        eq(transactionsTable.from_address, address),
        eq(transactionsTable.to_address, address),
      ))
      .orderBy(desc(transactionsTable.created_at))
      .limit(limit);

    res.json({ transactions: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list address transactions");
    res.status(500).json({ error: "Failed to list address transactions" });
  }
});

// GET /transactions/:hash — get transaction by hash (public)
router.get("/transactions/:hash", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.hash, req.params.hash))
      .limit(1);
    const tx = rows[0] ?? null;
    if (!tx) {
      // Also try by UUID id
      const byId = await db.select().from(transactionsTable)
        .where(eq(transactionsTable.id, req.params.hash))
        .limit(1);
      if (!byId[0]) { res.status(404).json({ error: "Transaction not found" }); return; }
      res.json({ transaction: byId[0] });
      return;
    }
    res.json({ transaction: tx });
  } catch (err) {
    req.log.error({ err }, "Failed to get transaction");
    res.status(500).json({ error: "Failed to get transaction" });
  }
});

// POST /transactions — record a new transaction (auth required)
router.post("/transactions", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const {
    hash, from_address, to_address, value, fee,
    status, tx_type, memo, block_height,
  } = req.body as Record<string, unknown>;

  if (!hash || !from_address) {
    res.status(400).json({ error: "hash and from_address are required" });
    return;
  }
  try {
    const [tx] = await db.insert(transactionsTable).values({
      hash: hash as string,
      from_address: from_address as string,
      to_address: to_address as string ?? null,
      value: (value as number) ?? 0,
      fee: (fee as number) ?? 0,
      status: (status as string) ?? "pending",
      tx_type: (tx_type as string) ?? "transfer",
      memo: memo as string ?? null,
      block_height: (block_height as number) ?? 0,
      user_id: userId,
    }).returning();
    res.status(201).json({ transaction: tx });
  } catch (err) {
    req.log.error({ err }, "Failed to create transaction");
    res.status(500).json({ error: "Failed to create transaction" });
  }
});

// PATCH /transactions/:id/confirm — mark transaction as confirmed
router.patch("/transactions/:id/confirm", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { block_height, confirmations } = req.body as { block_height?: number; confirmations?: number };
  try {
    const [updated] = await db.update(transactionsTable)
      .set({
        is_confirmed: true,
        status: "success",
        confirmed_at: new Date(),
        block_height: block_height ?? 0,
        confirmations: confirmations ?? 1,
      })
      .where(and(
        eq(transactionsTable.id, req.params.id),
        eq(transactionsTable.user_id, userId),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "Transaction not found" }); return; }
    res.json({ transaction: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to confirm transaction");
    res.status(500).json({ error: "Failed to confirm transaction" });
  }
});

export default router;
