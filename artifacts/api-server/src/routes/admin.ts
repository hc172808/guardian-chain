import { Router, type Request, type Response } from "express";
import { safeGetAuth as getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import {
  adminConfigTable,
  featureTogglesTable,
  auditLogsTable,
  walletUsersTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { seedDatabase } from "../seed";

const router = Router();

// ── Admin Config ─────────────────────────────────────────────────────────────

// GET /admin/config — list all config entries
router.get("/admin/config", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select().from(adminConfigTable)
      .orderBy(adminConfigTable.config_key);
    res.json({ config: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list admin config");
    res.status(500).json({ error: "Failed to list admin config" });
  }
});

// GET /admin/config/:key — get a single config value
router.get("/admin/config/:key", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select().from(adminConfigTable)
      .where(eq(adminConfigTable.config_key, req.params.key))
      .limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Config key not found" }); return; }
    res.json({ entry: rows[0] });
  } catch (err) {
    req.log.error({ err }, "Failed to get config");
    res.status(500).json({ error: "Failed to get config" });
  }
});

// PUT /admin/config/:key — upsert a config value
router.put("/admin/config/:key", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { value } = req.body as { value?: unknown };
  if (value === undefined) { res.status(400).json({ error: "value is required" }); return; }
  try {
    const existing = await db.select({ id: adminConfigTable.id })
      .from(adminConfigTable)
      .where(eq(adminConfigTable.config_key, req.params.key))
      .limit(1);

    let entry;
    if (existing.length > 0) {
      [entry] = await db.update(adminConfigTable)
        .set({ config_value: value, updated_at: new Date(), updated_by: userId })
        .where(eq(adminConfigTable.config_key, req.params.key))
        .returning();
    } else {
      [entry] = await db.insert(adminConfigTable).values({
        config_key: req.params.key,
        config_value: value,
        updated_by: userId,
      }).returning();
    }
    res.json({ entry });
  } catch (err) {
    req.log.error({ err }, "Failed to upsert config");
    res.status(500).json({ error: "Failed to upsert config" });
  }
});

// DELETE /admin/config/:key — remove a config entry
router.delete("/admin/config/:key", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const deleted = await db.delete(adminConfigTable)
      .where(eq(adminConfigTable.config_key, req.params.key))
      .returning({ id: adminConfigTable.id });
    if (!deleted.length) { res.status(404).json({ error: "Config key not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete config");
    res.status(500).json({ error: "Failed to delete config" });
  }
});

// ── Feature Toggles ──────────────────────────────────────────────────────────

// GET /admin/features — list all feature toggles (public)
router.get("/admin/features", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(featureTogglesTable)
      .orderBy(featureTogglesTable.feature_key);
    res.json({ features: rows, count: rows.length });
  } catch (err) {
    _req.log.error({ err }, "Failed to list features");
    res.status(500).json({ error: "Failed to list features" });
  }
});

// GET /admin/features/:key — get a single feature toggle (public)
router.get("/admin/features/:key", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(featureTogglesTable)
      .where(eq(featureTogglesTable.feature_key, req.params.key))
      .limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Feature not found" }); return; }
    res.json({ feature: rows[0] });
  } catch (err) {
    req.log.error({ err }, "Failed to get feature");
    res.status(500).json({ error: "Failed to get feature" });
  }
});

// POST /admin/features — create a feature toggle
router.post("/admin/features", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { feature_key, feature_name, description, is_enabled, admin_only } = req.body as Record<string, unknown>;
  if (!feature_key || !feature_name) {
    res.status(400).json({ error: "feature_key and feature_name are required" });
    return;
  }
  try {
    const [feature] = await db.insert(featureTogglesTable).values({
      feature_key: feature_key as string,
      feature_name: feature_name as string,
      description: description as string ?? null,
      is_enabled: (is_enabled as boolean) ?? false,
      admin_only: (admin_only as boolean) ?? false,
    }).returning();
    res.status(201).json({ feature });
  } catch (err) {
    req.log.error({ err }, "Failed to create feature toggle");
    res.status(500).json({ error: "Failed to create feature toggle" });
  }
});

// PATCH /admin/features/:key — update feature toggle
router.patch("/admin/features/:key", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { is_enabled, description, admin_only } = req.body as Record<string, unknown>;
  try {
    const [updated] = await db.update(featureTogglesTable)
      .set({
        ...(is_enabled !== undefined ? { is_enabled: is_enabled as boolean } : {}),
        ...(description !== undefined ? { description: description as string } : {}),
        ...(admin_only !== undefined ? { admin_only: admin_only as boolean } : {}),
        updated_at: new Date(),
      })
      .where(eq(featureTogglesTable.feature_key, req.params.key))
      .returning();
    if (!updated) { res.status(404).json({ error: "Feature not found" }); return; }
    res.json({ feature: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update feature toggle");
    res.status(500).json({ error: "Failed to update feature toggle" });
  }
});

// ── Audit Logs ───────────────────────────────────────────────────────────────

// GET /admin/audit-logs — list audit logs (auth required)
router.get("/admin/audit-logs", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const rows = await db.select().from(auditLogsTable)
      .orderBy(desc(auditLogsTable.created_at))
      .limit(limit)
      .offset(offset);

    res.json({ logs: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list audit logs");
    res.status(500).json({ error: "Failed to list audit logs" });
  }
});

// ── Wallet User Roles ────────────────────────────────────────────────────────

// GET /admin/wallet-users — list all wallet-authenticated users
router.get("/admin/wallet-users", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db
      .select()
      .from(walletUsersTable)
      .orderBy(desc(walletUsersTable.created_at));
    res.json({ users: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list wallet users");
    res.status(500).json({ error: "Failed to list wallet users" });
  }
});

// PATCH /admin/wallet-users/:id/role — update a user's role
router.patch("/admin/wallet-users/:id/role", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { role } = req.body as { role?: string };
  const allowed = ["user", "admin", "founder"];
  if (!role || !allowed.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${allowed.join(", ")}` });
    return;
  }
  try {
    const [updated] = await db
      .update(walletUsersTable)
      .set({ role, updated_at: new Date() })
      .where(eq(walletUsersTable.id, req.params.id))
      .returning();
    if (!updated) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update wallet user role");
    res.status(500).json({ error: "Failed to update wallet user role" });
  }
});

// ── Seed ─────────────────────────────────────────────────────────────────────

// POST /admin/seed — wipe and re-seed all demo/test data
router.post("/admin/seed", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await seedDatabase();
    res.json({ ok: true, message: "Database seeded successfully." });
  } catch (err) {
    req.log.error({ err }, "Seed failed");
    res.status(500).json({ error: "Seed failed", detail: String(err) });
  }
});

export default router;
