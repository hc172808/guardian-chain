import { pgTable, uuid, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tokenOperationsTable = pgTable("token_operations", {
  id: uuid("id").primaryKey().defaultRandom(),
  operation_type: text("operation_type").notNull(),
  amount: doublePrecision("amount").notNull(),
  wallet_address: text("wallet_address").notNull(),
  usdt_amount: doublePrecision("usdt_amount"),
  tx_hash: text("tx_hash"),
  status: text("status").notNull().default("pending"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"),
});

export const insertTokenOperationSchema = createInsertSchema(tokenOperationsTable);
export type InsertTokenOperation = z.infer<typeof insertTokenOperationSchema>;
export type TokenOperation = typeof tokenOperationsTable.$inferSelect;
