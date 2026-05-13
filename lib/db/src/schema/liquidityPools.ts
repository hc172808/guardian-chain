import { pgTable, uuid, text, boolean, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const liquidityPoolsTable = pgTable("liquidity_pools", {
  id: uuid("id").primaryKey().defaultRandom(),
  token_a_symbol: text("token_a_symbol").notNull(),
  token_b_symbol: text("token_b_symbol").notNull(),
  token_a_address: text("token_a_address"),
  token_b_address: text("token_b_address"),
  tvl: doublePrecision("tvl").notNull().default(0),
  volume_24h: doublePrecision("volume_24h").notNull().default(0),
  fees_24h: doublePrecision("fees_24h").notNull().default(0),
  apr: doublePrecision("apr").notNull().default(0),
  fee_tier: doublePrecision("fee_tier").notNull().default(0.003),
  is_active: boolean("is_active").notNull().default(true),
  creator_id: text("creator_id").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLiquidityPoolSchema = createInsertSchema(liquidityPoolsTable);
export type InsertLiquidityPool = z.infer<typeof insertLiquidityPoolSchema>;
export type LiquidityPool = typeof liquidityPoolsTable.$inferSelect;
