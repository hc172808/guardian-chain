import { pgTable, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tokenPriceTable = pgTable("token_price", {
  id: text("id").primaryKey().default("gen_random_uuid()"),
  price: doublePrecision("price").notNull().default(0),
  total_supply: doublePrecision("total_supply").notNull().default(0),
  circulating_supply: doublePrecision("circulating_supply").notNull().default(0),
  burned_total: doublePrecision("burned_total").notNull().default(0),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTokenPriceSchema = createInsertSchema(tokenPriceTable);
export type InsertTokenPrice = z.infer<typeof insertTokenPriceSchema>;
export type TokenPrice = typeof tokenPriceTable.$inferSelect;
