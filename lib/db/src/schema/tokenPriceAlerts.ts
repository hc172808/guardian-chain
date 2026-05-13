import { pgTable, text, boolean, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tokenPriceAlertsTable = pgTable("token_price_alerts", {
  id: text("id").primaryKey().default("gen_random_uuid()"),
  user_id: text("user_id").notNull(),
  token_id: text("token_id").notNull(),
  target_price: doublePrecision("target_price").notNull(),
  direction: text("direction").notNull().default("above"),
  is_triggered: boolean("is_triggered").notNull().default(false),
  triggered_at: timestamp("triggered_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertTokenPriceAlertSchema = createInsertSchema(tokenPriceAlertsTable);
export type InsertTokenPriceAlert = z.infer<typeof insertTokenPriceAlertSchema>;
export type TokenPriceAlert = typeof tokenPriceAlertsTable.$inferSelect;
