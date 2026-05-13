import { pgTable, uuid, text, boolean, doublePrecision, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hash: text("hash").notNull(),
  block_height: integer("block_height").notNull().default(0),
  from_address: text("from_address").notNull(),
  to_address: text("to_address"),
  value: doublePrecision("value").notNull().default(0),
  fee: doublePrecision("fee").notNull().default(0),
  status: text("status").notNull().default("pending"),
  tx_type: text("tx_type").notNull().default("transfer"),
  memo: text("memo"),
  is_confirmed: boolean("is_confirmed").notNull().default(false),
  confirmations: integer("confirmations").notNull().default(0),
  user_id: text("user_id"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  confirmed_at: timestamp("confirmed_at"),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable);
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
