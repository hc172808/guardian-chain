import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentationTable = pgTable("documentation", {
  id: text("id").primaryKey().default("gen_random_uuid()"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("general"),
  slug: text("slug").notNull(),
  order_index: integer("order_index").notNull().default(0),
  is_published: boolean("is_published").notNull().default(true),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDocumentationSchema = createInsertSchema(documentationTable);
export type InsertDocumentation = z.infer<typeof insertDocumentationSchema>;
export type Documentation = typeof documentationTable.$inferSelect;
