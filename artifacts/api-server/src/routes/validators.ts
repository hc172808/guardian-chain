import { Router, type Request, type Response } from "express";
import { safeGetAuth as getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { networkValidatorsTable, validatorDelegationsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

// GET /validators — list all validators (public)
router.get("/validators", async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active !== "false";
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const rows = await db.select().from(networkValidatorsTable)
      .where(activeOnly ? eq(networkValidatorsTable.is_active, true) : undefined)
      .orderBy(desc(networkValidatorsTable.stake))
      .limit(limit)
      .offset(offset);

    res.json({ validators: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list validators");
    res.status(500).json({ error: "Failed to list validators" });
  }
});

// GET /validators/:id — get a single validator (public)
router.get("/validators/:id", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(networkValidatorsTable)
      .where(eq(networkValidatorsTable.id, req.params.id))
      .limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Validator not found" }); return; }
    res.json({ validator: rows[0] });
  } catch (err) {
    req.log.error({ err }, "Failed to get validator");
    res.status(500).json({ error: "Failed to get validator" });
  }
});

// POST /validators — register a new validator (auth required)
router.post("/validators", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { address, name, stake, commission } = req.body as {
    address?: string;
    name?: string;
    stake?: number;
    commission?: number;
  };
  if (!address) { res.status(400).json({ error: "address is required" }); return; }
  try {
    const [validator] = await db.insert(networkValidatorsTable).values({
      address,
      name: name ?? null,
      stake: stake ?? 0,
      commission: commission ?? 0,
      created_by: userId,
    }).returning();
    res.status(201).json({ validator });
  } catch (err) {
    req.log.error({ err }, "Failed to create validator");
    res.status(500).json({ error: "Failed to create validator" });
  }
});

// PATCH /validators/:id — update validator info
router.patch("/validators/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const body = req.body as Partial<typeof networkValidatorsTable.$inferInsert>;
  delete (body as Record<string, unknown>).id;
  delete (body as Record<string, unknown>).created_by;
  delete (body as Record<string, unknown>).created_at;
  try {
    const [updated] = await db.update(networkValidatorsTable)
      .set({ ...body, updated_at: new Date() })
      .where(eq(networkValidatorsTable.id, req.params.id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Validator not found" }); return; }
    res.json({ validator: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update validator");
    res.status(500).json({ error: "Failed to update validator" });
  }
});

// ── Delegations ──────────────────────────────────────────────────────────────

// GET /validators/delegations/me — list delegations for current user
router.get("/validators/delegations/me", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select().from(validatorDelegationsTable)
      .where(eq(validatorDelegationsTable.user_id, userId))
      .orderBy(desc(validatorDelegationsTable.delegated_at));
    res.json({ delegations: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list delegations");
    res.status(500).json({ error: "Failed to list delegations" });
  }
});

// GET /validators/:id/delegations — list delegations for a specific validator
router.get("/validators/:id/delegations", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(validatorDelegationsTable)
      .where(eq(validatorDelegationsTable.validator_id, req.params.id))
      .orderBy(desc(validatorDelegationsTable.delegated_at));
    res.json({ delegations: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list validator delegations");
    res.status(500).json({ error: "Failed to list validator delegations" });
  }
});

// POST /validators/:id/delegate — delegate stake to a validator
router.post("/validators/:id/delegate", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { amount } = req.body as { amount?: number };
  if (!amount || amount <= 0) { res.status(400).json({ error: "amount must be a positive number" }); return; }
  try {
    const [delegation] = await db.insert(validatorDelegationsTable).values({
      user_id: userId,
      validator_id: req.params.id,
      amount,
      status: "active",
    }).returning();
    res.status(201).json({ delegation });
  } catch (err) {
    req.log.error({ err }, "Failed to delegate");
    res.status(500).json({ error: "Failed to delegate" });
  }
});

// POST /validators/delegations/:id/undelegate — undelegate
router.post("/validators/delegations/:id/undelegate", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [updated] = await db.update(validatorDelegationsTable)
      .set({ status: "undelegated", undelegated_at: new Date() })
      .where(and(
        eq(validatorDelegationsTable.id, req.params.id),
        eq(validatorDelegationsTable.user_id, userId),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "Delegation not found" }); return; }
    res.json({ delegation: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to undelegate");
    res.status(500).json({ error: "Failed to undelegate" });
  }
});

export default router;
