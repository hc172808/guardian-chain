import { Router, type Request, type Response } from "express";
import { safeGetAuth as getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { nodeInstallationsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

// GET /nodes — list all node installations (auth required)
router.get("/nodes", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select().from(nodeInstallationsTable)
      .orderBy(desc(nodeInstallationsTable.created_at));
    res.json({ nodes: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list nodes");
    res.status(500).json({ error: "Failed to list nodes" });
  }
});

// GET /nodes/me — list own node installations
router.get("/nodes/me", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select().from(nodeInstallationsTable)
      .where(eq(nodeInstallationsTable.user_id, userId))
      .orderBy(desc(nodeInstallationsTable.created_at));
    res.json({ nodes: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list user nodes");
    res.status(500).json({ error: "Failed to list user nodes" });
  }
});

// GET /nodes/:id — get a single node
router.get("/nodes/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select().from(nodeInstallationsTable)
      .where(eq(nodeInstallationsTable.id, req.params.id))
      .limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Node not found" }); return; }
    res.json({ node: rows[0] });
  } catch (err) {
    req.log.error({ err }, "Failed to get node");
    res.status(500).json({ error: "Failed to get node" });
  }
});

// POST /nodes — register a new node
router.post("/nodes", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { node_type, wireguard_public_key } = req.body as {
    node_type?: string;
    wireguard_public_key?: string;
  };
  if (!node_type) { res.status(400).json({ error: "node_type is required" }); return; }
  try {
    const [node] = await db.insert(nodeInstallationsTable).values({
      user_id: userId,
      node_type,
      wireguard_public_key: wireguard_public_key ?? null,
      is_online: false,
      is_synced: false,
      is_approved: false,
    }).returning();
    res.status(201).json({ node });
  } catch (err) {
    req.log.error({ err }, "Failed to register node");
    res.status(500).json({ error: "Failed to register node" });
  }
});

// PATCH /nodes/:id — update node stats (owner)
router.patch("/nodes/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const body = req.body as Partial<typeof nodeInstallationsTable.$inferInsert>;
  delete (body as Record<string, unknown>).id;
  delete (body as Record<string, unknown>).user_id;
  delete (body as Record<string, unknown>).created_at;
  try {
    const [updated] = await db.update(nodeInstallationsTable)
      .set(body)
      .where(and(
        eq(nodeInstallationsTable.id, req.params.id),
        eq(nodeInstallationsTable.user_id, userId),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "Node not found" }); return; }
    res.json({ node: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update node");
    res.status(500).json({ error: "Failed to update node" });
  }
});

// POST /nodes/:id/heartbeat — update last_heartbeat and online status
router.post("/nodes/:id/heartbeat", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { last_block_height, peer_count, sync_progress } = req.body as {
    last_block_height?: number;
    peer_count?: number;
    sync_progress?: number;
  };
  try {
    const [updated] = await db.update(nodeInstallationsTable)
      .set({
        last_heartbeat: new Date(),
        is_online: true,
        ...(last_block_height !== undefined ? { last_block_height } : {}),
        ...(peer_count !== undefined ? { peer_count } : {}),
        ...(sync_progress !== undefined ? { sync_progress } : {}),
      })
      .where(and(
        eq(nodeInstallationsTable.id, req.params.id),
        eq(nodeInstallationsTable.user_id, userId),
      ))
      .returning({ id: nodeInstallationsTable.id, last_heartbeat: nodeInstallationsTable.last_heartbeat });
    if (!updated) { res.status(404).json({ error: "Node not found" }); return; }
    res.json({ ok: true, last_heartbeat: updated.last_heartbeat });
  } catch (err) {
    req.log.error({ err }, "Failed to send heartbeat");
    res.status(500).json({ error: "Failed to send heartbeat" });
  }
});

// POST /nodes/:id/approve — approve a node (admin action)
router.post("/nodes/:id/approve", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [updated] = await db.update(nodeInstallationsTable)
      .set({ is_approved: true, approved_at: new Date(), approved_by: userId })
      .where(eq(nodeInstallationsTable.id, req.params.id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Node not found" }); return; }
    res.json({ node: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to approve node");
    res.status(500).json({ error: "Failed to approve node" });
  }
});

// DELETE /nodes/:id — remove a node
router.delete("/nodes/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const deleted = await db.delete(nodeInstallationsTable)
      .where(and(
        eq(nodeInstallationsTable.id, req.params.id),
        eq(nodeInstallationsTable.user_id, userId),
      ))
      .returning({ id: nodeInstallationsTable.id });
    if (!deleted.length) { res.status(404).json({ error: "Node not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete node");
    res.status(500).json({ error: "Failed to delete node" });
  }
});

export default router;
