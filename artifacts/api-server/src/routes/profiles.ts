import { Router, type Request, type Response } from "express";
import { safeGetAuth as getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { profilesTable, userRolesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

// GET /profiles/me — get current user's profile
router.get("/profiles/me", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select().from(profilesTable)
      .where(eq(profilesTable.user_id, userId))
      .limit(1);
    const profile = rows[0] ?? null;

    const roleRows = await db.select().from(userRolesTable)
      .where(eq(userRolesTable.user_id, userId));
    const roles = roleRows.map((r) => r.role);

    res.json({ profile, roles });
  } catch (err) {
    req.log.error({ err }, "Failed to get profile");
    res.status(500).json({ error: "Failed to get profile" });
  }
});

// POST /profiles/me — upsert current user's profile
router.post("/profiles/me", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { email, role } = req.body as { email?: string; role?: string };
  try {
    const existing = await db.select({ id: profilesTable.id })
      .from(profilesTable)
      .where(eq(profilesTable.user_id, userId))
      .limit(1);

    let profile;
    if (existing.length > 0) {
      [profile] = await db.update(profilesTable)
        .set({ email: email ?? null, updated_at: new Date() })
        .where(eq(profilesTable.user_id, userId))
        .returning();
    } else {
      [profile] = await db.insert(profilesTable).values({
        user_id: userId,
        email: email ?? null,
        role: role ?? "user",
      }).returning();
    }
    res.json({ profile });
  } catch (err) {
    req.log.error({ err }, "Failed to upsert profile");
    res.status(500).json({ error: "Failed to upsert profile" });
  }
});

// GET /profiles/:userId — get any user's public profile
router.get("/profiles/:userId", async (req: Request, res: Response) => {
  try {
    const rows = await db.select({
      id: profilesTable.id,
      user_id: profilesTable.user_id,
      role: profilesTable.role,
      created_at: profilesTable.created_at,
    }).from(profilesTable)
      .where(eq(profilesTable.user_id, req.params.userId))
      .limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Profile not found" }); return; }
    res.json({ profile: rows[0] });
  } catch (err) {
    req.log.error({ err }, "Failed to get profile");
    res.status(500).json({ error: "Failed to get profile" });
  }
});

// GET /roles — list all user roles (admin only by convention)
router.get("/roles", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select().from(userRolesTable)
      .orderBy(desc(userRolesTable.created_at));
    res.json({ roles: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list roles");
    res.status(500).json({ error: "Failed to list roles" });
  }
});

// POST /roles — assign a role to a user
router.post("/roles", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { target_user_id, role } = req.body as { target_user_id?: string; role?: string };
  if (!target_user_id || !role) {
    res.status(400).json({ error: "target_user_id and role are required" });
    return;
  }
  try {
    const [entry] = await db.insert(userRolesTable)
      .values({ user_id: target_user_id, role })
      .onConflictDoNothing()
      .returning();
    res.status(201).json({ role: entry ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to assign role");
    res.status(500).json({ error: "Failed to assign role" });
  }
});

// DELETE /roles/:id — remove a role assignment
router.delete("/roles/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const deleted = await db.delete(userRolesTable)
      .where(eq(userRolesTable.id, req.params.id))
      .returning({ id: userRolesTable.id });
    if (!deleted.length) { res.status(404).json({ error: "Role assignment not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete role");
    res.status(500).json({ error: "Failed to delete role" });
  }
});

export default router;
