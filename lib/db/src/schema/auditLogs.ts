import { pgTable, uuid, text, json, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditLogsTable = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  category: text("category").notNull().default("general"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  details: json("details"),
  ip_address: text("ip_address"),
  target_id: text("target_id"),
  target_type: text("target_type"),
  user_email: text("user_email"),
  user_id: text("user_id").notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogsTable);
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
