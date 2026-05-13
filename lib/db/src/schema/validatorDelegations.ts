import { pgTable, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const validatorDelegationsTable = pgTable("validator_delegations", {
  id: text("id").primaryKey().default("gen_random_uuid()"),
  user_id: text("user_id").notNull(),
  validator_id: text("validator_id").notNull(),
  amount: doublePrecision("amount").notNull().default(0),
  status: text("status").notNull().default("active"),
  delegated_at: timestamp("delegated_at").defaultNow().notNull(),
  undelegated_at: timestamp("undelegated_at"),
});

export const insertValidatorDelegationSchema = createInsertSchema(validatorDelegationsTable);
export type InsertValidatorDelegation = z.infer<typeof insertValidatorDelegationSchema>;
export type ValidatorDelegation = typeof validatorDelegationsTable.$inferSelect;
