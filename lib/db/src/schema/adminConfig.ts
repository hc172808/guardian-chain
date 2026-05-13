import { pgTable, uuid, text, json, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminConfigTable = pgTable("admin_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  config_key: text("config_key").notNull(),
  config_value: json("config_value").notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  updated_by: text("updated_by"),
});

export const insertAdminConfigSchema = createInsertSchema(adminConfigTable);
export type InsertAdminConfig = z.infer<typeof insertAdminConfigSchema>;
export type AdminConfig = typeof adminConfigTable.$inferSelect;
