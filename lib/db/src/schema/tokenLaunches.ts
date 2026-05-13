import { pgTable, text, boolean, doublePrecision, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tokenLaunchesTable = pgTable("token_launches", {
  id: text("id").primaryKey().default("gen_random_uuid()"),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description"),
  logo_url: text("logo_url"),
  creator_id: text("creator_id").notNull(),
  token_id: text("token_id"),
  status: text("status").notNull().default("pending"),
  target_raise: doublePrecision("target_raise").notNull().default(0),
  raised_amount: doublePrecision("raised_amount").notNull().default(0),
  initial_price: doublePrecision("initial_price").notNull().default(0),
  max_price: doublePrecision("max_price"),
  bonding_curve_type: text("bonding_curve_type").notNull().default("linear"),
  bonding_curve_steepness: doublePrecision("bonding_curve_steepness").notNull().default(1),
  participants: integer("participants").notNull().default(0),
  is_premier: boolean("is_premier").notNull().default(false),
  starts_at: timestamp("starts_at"),
  ends_at: timestamp("ends_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTokenLaunchSchema = createInsertSchema(tokenLaunchesTable);
export type InsertTokenLaunch = z.infer<typeof insertTokenLaunchSchema>;
export type TokenLaunch = typeof tokenLaunchesTable.$inferSelect;
