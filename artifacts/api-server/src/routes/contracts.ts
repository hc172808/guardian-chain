import { Router, type Request, type Response } from "express";
import { safeGetAuth as getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { smartContractsTable, contractTemplatesTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

// GET /contracts — list user's contracts (auth required)
router.get("/contracts", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    const rows = await db.select().from(smartContractsTable)
      .where(eq(smartContractsTable.user_id, userId))
      .orderBy(desc(smartContractsTable.created_at))
      .limit(limit)
      .offset(offset);

    res.json({ contracts: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list contracts");
    res.status(500).json({ error: "Failed to list contracts" });
  }
});

// GET /contracts/:id — get single contract
router.get("/contracts/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select().from(smartContractsTable)
      .where(and(
        eq(smartContractsTable.id, req.params.id),
        eq(smartContractsTable.user_id, userId),
      ))
      .limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Contract not found" }); return; }
    res.json({ contract: rows[0] });
  } catch (err) {
    req.log.error({ err }, "Failed to get contract");
    res.status(500).json({ error: "Failed to get contract" });
  }
});

// POST /contracts — create / save a contract draft
router.post("/contracts", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const {
    name, description, source_code, bytecode, abi,
    constructor_args, template_id, status,
  } = req.body as Record<string, unknown>;
  if (!name || !source_code) {
    res.status(400).json({ error: "name and source_code are required" });
    return;
  }
  try {
    const [contract] = await db.insert(smartContractsTable).values({
      user_id: userId,
      name: name as string,
      description: description as string ?? null,
      source_code: source_code as string,
      bytecode: bytecode as string ?? null,
      abi: abi ?? null,
      constructor_args: constructor_args ?? null,
      template_id: template_id as string ?? null,
      status: (status as string) ?? "draft",
    }).returning();
    res.status(201).json({ contract });
  } catch (err) {
    req.log.error({ err }, "Failed to create contract");
    res.status(500).json({ error: "Failed to create contract" });
  }
});

// PATCH /contracts/:id — update contract
router.patch("/contracts/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const body = req.body as Partial<typeof smartContractsTable.$inferInsert>;
  delete (body as Record<string, unknown>).id;
  delete (body as Record<string, unknown>).user_id;
  delete (body as Record<string, unknown>).created_at;
  try {
    const [updated] = await db.update(smartContractsTable)
      .set({ ...body, updated_at: new Date() })
      .where(and(
        eq(smartContractsTable.id, req.params.id),
        eq(smartContractsTable.user_id, userId),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "Contract not found" }); return; }
    res.json({ contract: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update contract");
    res.status(500).json({ error: "Failed to update contract" });
  }
});

// POST /contracts/:id/deploy — mark contract as deployed
router.post("/contracts/:id/deploy", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { contract_address, deploy_tx_hash } = req.body as {
    contract_address?: string;
    deploy_tx_hash?: string;
  };
  if (!contract_address) {
    res.status(400).json({ error: "contract_address is required" });
    return;
  }
  try {
    const [updated] = await db.update(smartContractsTable)
      .set({
        contract_address,
        deploy_tx_hash: deploy_tx_hash ?? null,
        status: "deployed",
        deployed_at: new Date(),
        updated_at: new Date(),
      })
      .where(and(
        eq(smartContractsTable.id, req.params.id),
        eq(smartContractsTable.user_id, userId),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "Contract not found" }); return; }
    res.json({ contract: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to deploy contract");
    res.status(500).json({ error: "Failed to deploy contract" });
  }
});

// DELETE /contracts/:id — delete draft contract
router.delete("/contracts/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const deleted = await db.delete(smartContractsTable)
      .where(and(
        eq(smartContractsTable.id, req.params.id),
        eq(smartContractsTable.user_id, userId),
      ))
      .returning({ id: smartContractsTable.id });
    if (!deleted.length) { res.status(404).json({ error: "Contract not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete contract");
    res.status(500).json({ error: "Failed to delete contract" });
  }
});

// ── Templates ────────────────────────────────────────────────────────────────

// GET /contracts/templates — list templates (public)
router.get("/contracts/templates", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(contractTemplatesTable)
      .orderBy(desc(contractTemplatesTable.created_at));
    res.json({ templates: rows, count: rows.length });
  } catch (err) {
    _req.log.error({ err }, "Failed to list templates");
    res.status(500).json({ error: "Failed to list templates" });
  }
});

export default router;
