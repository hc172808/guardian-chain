import { Router, type Request, type Response } from "express";
import { safeGetAuth as getAuth } from "../lib/auth";
import { db } from "@workspace/db";
import { documentationTable } from "@workspace/db/schema";
import { eq, asc, and } from "drizzle-orm";

const router = Router();

// GET /docs — list all published docs (public)
router.get("/docs", async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;

    const where = and(
      eq(documentationTable.is_published, true),
      category ? eq(documentationTable.category, category) : undefined,
    );

    const rows = await db.select().from(documentationTable)
      .where(where)
      .orderBy(documentationTable.category, asc(documentationTable.order_index));

    // Group by category for convenience
    const grouped = rows.reduce((acc: Record<string, typeof rows>, doc) => {
      (acc[doc.category] ??= []).push(doc);
      return acc;
    }, {});

    res.json({ docs: rows, grouped, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to list docs");
    res.status(500).json({ error: "Failed to list docs" });
  }
});

// GET /docs/:slug — get doc by slug (public)
router.get("/docs/:slug", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(documentationTable)
      .where(and(
        eq(documentationTable.slug, req.params.slug),
        eq(documentationTable.is_published, true),
      ))
      .limit(1);
    if (!rows[0]) { res.status(404).json({ error: "Doc not found" }); return; }
    res.json({ doc: rows[0] });
  } catch (err) {
    req.log.error({ err }, "Failed to get doc");
    res.status(500).json({ error: "Failed to get doc" });
  }
});

// POST /docs — create a doc (auth required)
router.post("/docs", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { title, content, category, slug, order_index, is_published } = req.body as Record<string, unknown>;
  if (!title || !content || !slug) {
    res.status(400).json({ error: "title, content, and slug are required" });
    return;
  }
  try {
    const [doc] = await db.insert(documentationTable).values({
      title: title as string,
      content: content as string,
      category: (category as string) ?? "general",
      slug: slug as string,
      order_index: (order_index as number) ?? 0,
      is_published: (is_published as boolean) ?? true,
    }).returning();
    res.status(201).json({ doc });
  } catch (err) {
    req.log.error({ err }, "Failed to create doc");
    res.status(500).json({ error: "Failed to create doc" });
  }
});

// PATCH /docs/:id — update a doc (auth required)
router.patch("/docs/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  const body = req.body as Partial<typeof documentationTable.$inferInsert>;
  delete (body as Record<string, unknown>).id;
  delete (body as Record<string, unknown>).created_at;
  try {
    const [updated] = await db.update(documentationTable)
      .set({ ...body, updated_at: new Date() })
      .where(eq(documentationTable.id, req.params.id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Doc not found" }); return; }
    res.json({ doc: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update doc");
    res.status(500).json({ error: "Failed to update doc" });
  }
});

// DELETE /docs/:id — delete a doc (auth required)
router.delete("/docs/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const deleted = await db.delete(documentationTable)
      .where(eq(documentationTable.id, req.params.id))
      .returning({ id: documentationTable.id });
    if (!deleted.length) { res.status(404).json({ error: "Doc not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete doc");
    res.status(500).json({ error: "Failed to delete doc" });
  }
});

export default router;
