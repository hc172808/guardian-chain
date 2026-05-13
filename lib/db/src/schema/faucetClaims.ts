import { pgTable, uuid, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const faucetClaimsTable = pgTable("faucet_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull(),
  wallet_address: text("wallet_address").notNull(),
  amount: doublePrecision("amount").notNull().default(10),
  claimed_at: timestamp("claimed_at").defaultNow().notNull(),
  ip_address: text("ip_address"),
  tx_hash: text("tx_hash"),
});

export const insertFaucetClaimSchema = createInsertSchema(faucetClaimsTable);
export type InsertFaucetClaim = z.infer<typeof insertFaucetClaimSchema>;
export type FaucetClaim = typeof faucetClaimsTable.$inferSelect;
