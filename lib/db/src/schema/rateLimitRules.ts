import { pgTable, uuid, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rateLimitRulesTable = pgTable("rate_limit_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  endpoint: text("endpoint").notNull(),
  requests_per_window: integer("requests_per_window").notNull().default(100),
  window_seconds: integer("window_seconds").notNull().default(60),
  burst_limit: integer("burst_limit").notNull().default(20),
  action: text("action").notNull().default("throttle"),
  description: text("description"),
  is_enabled: boolean("is_enabled").notNull().default(true),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  created_by: text("created_by"),
});

export const insertRateLimitRuleSchema = createInsertSchema(rateLimitRulesTable);
export type InsertRateLimitRule = z.infer<typeof insertRateLimitRuleSchema>;
export type RateLimitRule = typeof rateLimitRulesTable.$inferSelect;
