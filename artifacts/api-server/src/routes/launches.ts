import { Router, type Request, type Response } from "express";
import { safeGetAuth as getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { tokenLaunchesTable, tokenOperationsTable, tokenPriceTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

// GET /launches — list all token launches (public)
router.get("/launches", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const status = req.query.status as string | undefined;

    const rows = await db.select().from(tokenLaunchesTable)
      .where(status ? eq(tokenLaunchesTable.status, status) : undefined)
      .orderBy(desc(tokenLaunchesTable.created_at))
      .limit(limit)
      .offset(offset);

    res.json({ launches: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list launches");
    res.status(500).json({ error: "Failed to list launches" });
  }
});

// GET /launches/:id — get a single launch (public)
router.get("/launches/:id", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(tokenLaunchesTable)
      .where(eq(tokenLaunchesTable.id, req.params.id))
      .limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Launch not found" }); return; }
    res.json({ launch: rows[0] });
  } catch (err) {
    req.log.error({ err }, "Failed to get launch");
    res.status(500).json({ error: "Failed to get launch" });
  }
});

// POST /launches — create a token launch (auth required)
router.post("/launches", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const {
    name, symbol, description, logo_url, target_raise,
    initial_price, max_price, bonding_curve_type,
    bonding_curve_steepness, is_premier, starts_at, ends_at,
  } = req.body as Record<string, unknown>;
  if (!name || !symbol) {
    res.status(400).json({ error: "name and symbol are required" });
    return;
  }
  try {
    const [launch] = await db.insert(tokenLaunchesTable).values({
      name: name as string,
      symbol: symbol as string,
      description: description as string ?? null,
      logo_url: logo_url as string ?? null,
      creator_id: userId,
      target_raise: (target_raise as number) ?? 0,
      initial_price: (initial_price as number) ?? 0,
      max_price: max_price as number ?? null,
      bonding_curve_type: (bonding_curve_type as string) ?? "linear",
      bonding_curve_steepness: (bonding_curve_steepness as number) ?? 1,
      is_premier: (is_premier as boolean) ?? false,
      starts_at: starts_at ? new Date(starts_at as string) : null,
      ends_at: ends_at ? new Date(ends_at as string) : null,
      status: "pending",
    }).returning();
    res.status(201).json({ launch });
  } catch (err) {
    req.log.error({ err }, "Failed to create launch");
    res.status(500).json({ error: "Failed to create launch" });
  }
});

// PATCH /launches/:id — update launch (creator only)
router.patch("/launches/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const body = req.body as Partial<typeof tokenLaunchesTable.$inferInsert>;
  delete (body as Record<string, unknown>).id;
  delete (body as Record<string, unknown>).creator_id;
  delete (body as Record<string, unknown>).created_at;
  try {
    const [updated] = await db.update(tokenLaunchesTable)
      .set({ ...body, updated_at: new Date() })
      .where(and(
        eq(tokenLaunchesTable.id, req.params.id),
        eq(tokenLaunchesTable.creator_id, userId),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "Launch not found or not owner" }); return; }
    res.json({ launch: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update launch");
    res.status(500).json({ error: "Failed to update launch" });
  }
});

// ── Token Operations (buy/sell/burn/mint) ────────────────────────────────────

// GET /token-operations — list operations (public)
router.get("/token-operations", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const operation_type = req.query.operation_type as string | undefined;

    const rows = await db.select().from(tokenOperationsTable)
      .where(operation_type ? eq(tokenOperationsTable.operation_type, operation_type) : undefined)
      .orderBy(desc(tokenOperationsTable.created_at))
      .limit(limit)
      .offset(offset);

    res.json({ operations: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list token operations");
    res.status(500).json({ error: "Failed to list token operations" });
  }
});

// POST /token-operations — record a token operation (auth required)
router.post("/token-operations", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { operation_type, amount, wallet_address, usdt_amount, tx_hash } = req.body as Record<string, unknown>;
  if (!operation_type || !amount || !wallet_address) {
    res.status(400).json({ error: "operation_type, amount, and wallet_address are required" });
    return;
  }
  const validTypes = ["buy", "sell", "mint", "burn", "transfer"];
  if (!validTypes.includes(operation_type as string)) {
    res.status(400).json({ error: `operation_type must be one of: ${validTypes.join(", ")}` });
    return;
  }
  try {
    const [op] = await db.insert(tokenOperationsTable).values({
      operation_type: operation_type as string,
      amount: amount as number,
      wallet_address: wallet_address as string,
      usdt_amount: usdt_amount as number ?? null,
      tx_hash: tx_hash as string ?? null,
      status: "pending",
      created_by: userId,
    }).returning();
    res.status(201).json({ operation: op });
  } catch (err) {
    req.log.error({ err }, "Failed to create token operation");
    res.status(500).json({ error: "Failed to create token operation" });
  }
});

// PATCH /token-operations/:id/status — update operation status
router.patch("/token-operations/:id/status", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { status, tx_hash } = req.body as { status?: string; tx_hash?: string };
  if (!status) { res.status(400).json({ error: "status is required" }); return; }
  try {
    const [updated] = await db.update(tokenOperationsTable)
      .set({
        status,
        ...(tx_hash ? { tx_hash } : {}),
      })
      .where(eq(tokenOperationsTable.id, req.params.id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Operation not found" }); return; }
    res.json({ operation: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update operation status");
    res.status(500).json({ error: "Failed to update operation status" });
  }
});

// ── Token Price ──────────────────────────────────────────────────────────────

// GET /token-price — get current GYDS price
router.get("/token-price", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(tokenPriceTable)
      .orderBy(desc(tokenPriceTable.updated_at))
      .limit(1);
    const price = rows[0] ?? null;
    res.json({ price });
  } catch (err) {
    req.log.error({ err }, "Failed to get token price");
    res.status(500).json({ error: "Failed to get token price" });
  }
});

// PUT /token-price — upsert GYDS price (admin action)
router.put("/token-price", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { price, total_supply, circulating_supply, burned_total } = req.body as Record<string, unknown>;
  if (price === undefined) { res.status(400).json({ error: "price is required" }); return; }
  try {
    const existing = await db.select({ id: tokenPriceTable.id })
      .from(tokenPriceTable)
      .limit(1);

    let entry;
    if (existing.length > 0) {
      [entry] = await db.update(tokenPriceTable)
        .set({
          price: price as number,
          total_supply: total_supply as number ?? 0,
          circulating_supply: circulating_supply as number ?? 0,
          burned_total: burned_total as number ?? 0,
          updated_at: new Date(),
        })
        .where(eq(tokenPriceTable.id, existing[0].id))
        .returning();
    } else {
      [entry] = await db.insert(tokenPriceTable).values({
        price: price as number,
        total_supply: total_supply as number ?? 0,
        circulating_supply: circulating_supply as number ?? 0,
        burned_total: burned_total as number ?? 0,
      }).returning();
    }
    res.json({ price: entry });
  } catch (err) {
    req.log.error({ err }, "Failed to upsert token price");
    res.status(500).json({ error: "Failed to upsert token price" });
  }
});

export default router;
