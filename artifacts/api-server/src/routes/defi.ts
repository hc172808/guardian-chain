import { Router, type Request, type Response } from "express";
import { safeGetAuth as getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { liquidityPoolsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

// GET /defi/pools — list all active liquidity pools (public)
router.get("/defi/pools", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const activeOnly = req.query.active !== "false";

    const rows = await db.select().from(liquidityPoolsTable)
      .where(activeOnly ? eq(liquidityPoolsTable.is_active, true) : undefined)
      .orderBy(desc(liquidityPoolsTable.tvl))
      .limit(limit)
      .offset(offset);

    const totalTvl = rows.reduce((sum, p) => sum + (p.tvl ?? 0), 0);
    const totalVolume = rows.reduce((sum, p) => sum + (p.volume_24h ?? 0), 0);

    res.json({ pools: rows, count: rows.length, totalTvl, totalVolume });
  } catch (err) {
    req.log.error({ err }, "Failed to list pools");
    res.status(500).json({ error: "Failed to list pools" });
  }
});

// GET /defi/pools/:id — get a single pool (public)
router.get("/defi/pools/:id", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(liquidityPoolsTable)
      .where(eq(liquidityPoolsTable.id, req.params.id))
      .limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Pool not found" }); return; }
    res.json({ pool: rows[0] });
  } catch (err) {
    req.log.error({ err }, "Failed to get pool");
    res.status(500).json({ error: "Failed to get pool" });
  }
});

// POST /defi/pools — create a liquidity pool (auth required)
router.post("/defi/pools", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const {
    token_a_symbol, token_b_symbol, token_a_address, token_b_address,
    tvl, volume_24h, fees_24h, apr, fee_tier,
  } = req.body as Record<string, unknown>;
  if (!token_a_symbol || !token_b_symbol) {
    res.status(400).json({ error: "token_a_symbol and token_b_symbol are required" });
    return;
  }
  try {
    const [pool] = await db.insert(liquidityPoolsTable).values({
      token_a_symbol: token_a_symbol as string,
      token_b_symbol: token_b_symbol as string,
      token_a_address: token_a_address as string ?? null,
      token_b_address: token_b_address as string ?? null,
      tvl: (tvl as number) ?? 0,
      volume_24h: (volume_24h as number) ?? 0,
      fees_24h: (fees_24h as number) ?? 0,
      apr: (apr as number) ?? 0,
      fee_tier: (fee_tier as number) ?? 0.003,
      creator_id: userId,
    }).returning();
    res.status(201).json({ pool });
  } catch (err) {
    req.log.error({ err }, "Failed to create pool");
    res.status(500).json({ error: "Failed to create pool" });
  }
});

// PATCH /defi/pools/:id — update pool stats (creator only)
router.patch("/defi/pools/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const body = req.body as Partial<typeof liquidityPoolsTable.$inferInsert>;
  delete (body as Record<string, unknown>).id;
  delete (body as Record<string, unknown>).creator_id;
  delete (body as Record<string, unknown>).created_at;
  try {
    const [updated] = await db.update(liquidityPoolsTable)
      .set({ ...body, updated_at: new Date() })
      .where(and(
        eq(liquidityPoolsTable.id, req.params.id),
        eq(liquidityPoolsTable.creator_id, userId),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "Pool not found or not owner" }); return; }
    res.json({ pool: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update pool");
    res.status(500).json({ error: "Failed to update pool" });
  }
});

// DELETE /defi/pools/:id — deactivate pool
router.delete("/defi/pools/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [updated] = await db.update(liquidityPoolsTable)
      .set({ is_active: false, updated_at: new Date() })
      .where(and(
        eq(liquidityPoolsTable.id, req.params.id),
        eq(liquidityPoolsTable.creator_id, userId),
      ))
      .returning({ id: liquidityPoolsTable.id });
    if (!updated) { res.status(404).json({ error: "Pool not found or not owner" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete pool");
    res.status(500).json({ error: "Failed to delete pool" });
  }
});

// POST /defi/swap — simulate a swap (no DB, returns quoted amounts)
router.post("/defi/swap", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { from_token, to_token, amount_in } = req.body as {
    from_token?: string;
    to_token?: string;
    amount_in?: number;
  };
  if (!from_token || !to_token || !amount_in) {
    res.status(400).json({ error: "from_token, to_token, and amount_in are required" });
    return;
  }
  const slippage = 0.005;
  const fee = 0.003;
  const rate = 1.0 + Math.sin(Date.now() / 1000000) * 0.05;
  const amount_out = amount_in * rate * (1 - fee) * (1 - slippage);
  const price_impact = (amount_in / 100000) * 0.1;

  res.json({
    from_token,
    to_token,
    amount_in,
    amount_out: +amount_out.toFixed(8),
    rate: +rate.toFixed(6),
    fee: +(amount_in * fee).toFixed(8),
    slippage,
    price_impact: +price_impact.toFixed(4),
    tx_hash: null,
    status: "quoted",
  });
});

export default router;
