import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const walletUsersTable = pgTable("wallet_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  wallet_address: text("wallet_address").notNull().unique(),
  ens_name: text("ens_name"),
  role: text("role").notNull().default("user"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type WalletUser = typeof walletUsersTable.$inferSelect;
export type InsertWalletUser = typeof walletUsersTable.$inferInsert;
