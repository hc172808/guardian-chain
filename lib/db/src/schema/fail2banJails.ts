import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fail2banJailsTable = pgTable("fail2ban_jails", {
  id: text("id").primaryKey().default("gen_random_uuid()"),
  jail_name: text("jail_name").notNull(),
  description: text("description"),
  filter_name: text("filter_name"),
  log_path: text("log_path"),
  max_retries: integer("max_retries").notNull().default(3),
  find_time: integer("find_time").notNull().default(600),
  ban_time: integer("ban_time").notNull().default(3600),
  action: text("action"),
  is_enabled: boolean("is_enabled").notNull().default(true),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  created_by: text("created_by"),
});

export const insertFail2banJailSchema = createInsertSchema(fail2banJailsTable);
export type InsertFail2banJail = z.infer<typeof insertFail2banJailSchema>;
export type Fail2banJail = typeof fail2banJailsTable.$inferSelect;
