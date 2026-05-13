import { pgTable, uuid, text, json, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiSecurityEventsTable = pgTable("ai_security_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull().default("flag"),
  category: text("category").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  details: json("details").notNull().default({}),
  model: text("model"),
  severity: text("severity").notNull(),
  source: text("source").notNull().default("system"),
  subject_address: text("subject_address"),
  subject_user_id: text("subject_user_id"),
  summary: text("summary").notNull(),
});

export const insertAiSecurityEventSchema = createInsertSchema(aiSecurityEventsTable);
export type InsertAiSecurityEvent = z.infer<typeof insertAiSecurityEventSchema>;
export type AiSecurityEvent = typeof aiSecurityEventsTable.$inferSelect;
