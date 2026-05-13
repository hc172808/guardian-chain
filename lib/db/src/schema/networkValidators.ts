import { pgTable, uuid, text, boolean, doublePrecision, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const networkValidatorsTable = pgTable("network_validators", {
  id: uuid("id").primaryKey().defaultRandom(),
  address: text("address").notNull(),
  name: text("name"),
  stake: doublePrecision("stake").notNull().default(0),
  commission: doublePrecision("commission").notNull().default(0),
  uptime: doublePrecision("uptime").notNull().default(100),
  blocks_proposed: integer("blocks_proposed").notNull().default(0),
  last_vote_height: integer("last_vote_height").notNull().default(0),
  is_active: boolean("is_active").notNull().default(true),
  is_jailed: boolean("is_jailed").notNull().default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  created_by: text("created_by"),
});

export const insertNetworkValidatorSchema = createInsertSchema(networkValidatorsTable);
export type InsertNetworkValidator = z.infer<typeof insertNetworkValidatorSchema>;
export type NetworkValidator = typeof networkValidatorsTable.$inferSelect;
