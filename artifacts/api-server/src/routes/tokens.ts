import { Router, type Request, type Response } from "express";
import { safeGetAuth as getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { tokensTable, tokenWatchlistTable } from "@workspace/db/schema";
import { eq, desc, ilike, and } from "drizzle-orm";

const router = Router();

// GET /tokens — list all active tokens (public)
router.get("/tokens", async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string | undefined) ?? "";
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const conditions = search
      ? [ilike(tokensTable.name, `%${search}%`), ilike(tokensTable.symbol, `%${search}%`)]
      : [];

    const rows = await db.select().from(tokensTable)
      .where(conditions.length ? eq(tokensTable.is_active, true) : eq(tokensTable.is_active, true))
      .orderBy(desc(tokensTable.market_cap))
      .limit(limit)
      .offset(offset);

    res.json({ tokens: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list tokens");
    res.status(500).json({ error: "Failed to list tokens" });
  }
});

// GET /tokens/:id — get single token by id or address (public)
router.get("/tokens/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const rows = await db.select().from(tokensTable)
      .where(eq(tokensTable.id, id))
      .limit(1);
    const token = rows[0] ?? null;

    // try by address if not found by id
    if (!token) {
      const byAddr = await db.select().from(tokensTable)
        .where(eq(tokensTable.address, id))
        .limit(1);
      if (!byAddr[0]) { res.status(404).json({ error: "Token not found" }); return; }
      res.json({ token: byAddr[0] });
      return;
    }
    res.json({ token });
  } catch (err) {
    req.log.error({ err }, "Failed to get token");
    res.status(500).json({ error: "Failed to get token" });
  }
});

// POST /tokens — create a token (auth required)
router.post("/tokens", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const body = req.body as Record<string, unknown>;
  const { name, symbol, total_supply, decimals, description, logo_url, website_url, token_type } = body;
  if (!name || !symbol) {
    res.status(400).json({ error: "name and symbol are required" });
    return;
  }
  try {
    const [token] = await db.insert(tokensTable).values({
      name: name as string,
      symbol: symbol as string,
      total_supply: (total_supply as number) ?? 0,
      decimals: (decimals as number) ?? 18,
      description: description as string | undefined,
      logo_url: logo_url as string | undefined,
      website_url: website_url as string | undefined,
      token_type: (token_type as string) ?? "ERC20",
      creator_id: userId,
    }).returning();
    res.status(201).json({ token });
  } catch (err) {
    req.log.error({ err }, "Failed to create token");
    res.status(500).json({ error: "Failed to create token" });
  }
});

// PATCH /tokens/:id — update token (creator or admin)
router.patch("/tokens/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const body = req.body as Partial<typeof tokensTable.$inferInsert>;
  // Remove immutable fields
  delete (body as Record<string, unknown>).id;
  delete (body as Record<string, unknown>).creator_id;
  delete (body as Record<string, unknown>).created_at;
  try {
    const [updated] = await db.update(tokensTable)
      .set({ ...body, updated_at: new Date() })
      .where(eq(tokensTable.id, req.params.id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Token not found" }); return; }
    res.json({ token: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update token");
    res.status(500).json({ error: "Failed to update token" });
  }
});

// DELETE /tokens/:id — soft delete by setting is_active=false
router.delete("/tokens/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [updated] = await db.update(tokensTable)
      .set({ is_active: false, updated_at: new Date() })
      .where(and(eq(tokensTable.id, req.params.id), eq(tokensTable.creator_id, userId)))
      .returning({ id: tokensTable.id });
    if (!updated) { res.status(404).json({ error: "Token not found or not owner" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete token");
    res.status(500).json({ error: "Failed to delete token" });
  }
});

// GET /tokens/watchlist/me — get authenticated user's watchlist
router.get("/tokens/watchlist/me", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select().from(tokenWatchlistTable)
      .where(eq(tokenWatchlistTable.user_id, userId))
      .orderBy(desc(tokenWatchlistTable.created_at));
    res.json({ watchlist: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to get watchlist");
    res.status(500).json({ error: "Failed to get watchlist" });
  }
});

// POST /tokens/watchlist — add token to watchlist
router.post("/tokens/watchlist", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { token_id } = req.body as { token_id?: string };
  if (!token_id) { res.status(400).json({ error: "token_id is required" }); return; }
  try {
    const [entry] = await db.insert(tokenWatchlistTable)
      .values({ user_id: userId, token_id })
      .onConflictDoNothing()
      .returning();
    res.status(201).json({ entry: entry ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to add to watchlist");
    res.status(500).json({ error: "Failed to add to watchlist" });
  }
});

// DELETE /tokens/watchlist/:token_id — remove from watchlist
router.delete("/tokens/watchlist/:token_id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await db.delete(tokenWatchlistTable)
      .where(and(
        eq(tokenWatchlistTable.user_id, userId),
        eq(tokenWatchlistTable.token_id, req.params.token_id),
      ));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to remove from watchlist");
    res.status(500).json({ error: "Failed to remove from watchlist" });
  }
});

export default router;
