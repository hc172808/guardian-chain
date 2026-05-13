import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const walletsTable = pgTable("wallets", {
  id: text("id").primaryKey().default("gen_random_uuid()"),
  user_id: text("user_id").notNull(),
  address: text("address").notNull(),
  encrypted_seed: text("encrypted_seed").notNull(),
  pin_hash: text("pin_hash").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertWalletSchema = createInsertSchema(walletsTable);
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof walletsTable.$inferSelect;
