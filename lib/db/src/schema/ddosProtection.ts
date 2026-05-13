import { pgTable, uuid, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ddosProtectionTable = pgTable("ddos_protection", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  rule_type: text("rule_type").notNull().default("rate_limit"),
  threshold: integer("threshold").notNull().default(100),
  window_seconds: integer("window_seconds").notNull().default(60),
  action: text("action").notNull().default("block"),
  is_enabled: boolean("is_enabled").notNull().default(true),
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDdosProtectionSchema = createInsertSchema(ddosProtectionTable);
export type InsertDdosProtection = z.infer<typeof insertDdosProtectionSchema>;
export type DdosProtection = typeof ddosProtectionTable.$inferSelect;
