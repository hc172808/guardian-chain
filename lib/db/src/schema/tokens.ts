import { pgTable, text, boolean, doublePrecision, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tokensTable = pgTable("tokens", {
  id: text("id").primaryKey().default("gen_random_uuid()"),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description"),
  address: text("address"),
  logo_url: text("logo_url"),
  website_url: text("website_url"),
  decimals: integer("decimals").notNull().default(18),
  total_supply: doublePrecision("total_supply").notNull().default(0),
  circulating_supply: doublePrecision("circulating_supply"),
  price: doublePrecision("price").notNull().default(0),
  price_change_24h: doublePrecision("price_change_24h").notNull().default(0),
  market_cap: doublePrecision("market_cap").notNull().default(0),
  volume_24h: doublePrecision("volume_24h").notNull().default(0),
  creator_id: text("creator_id"),
  is_active: boolean("is_active").notNull().default(true),
  is_verified: boolean("is_verified").notNull().default(false),
  token_type: text("token_type").notNull().default("ERC20"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTokenSchema = createInsertSchema(tokensTable);
export type InsertToken = z.infer<typeof insertTokenSchema>;
export type Token = typeof tokensTable.$inferSelect;
