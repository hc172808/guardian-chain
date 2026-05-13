import { pgTable, uuid, text, json, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const smartContractsTable = pgTable("smart_contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  source_code: text("source_code").notNull(),
  bytecode: text("bytecode"),
  abi: json("abi"),
  constructor_args: json("constructor_args"),
  contract_address: text("contract_address"),
  deploy_tx_hash: text("deploy_tx_hash"),
  status: text("status").notNull().default("draft"),
  is_verified: boolean("is_verified").notNull().default(false),
  template_id: text("template_id"),
  deployed_at: timestamp("deployed_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSmartContractSchema = createInsertSchema(smartContractsTable);
export type InsertSmartContract = z.infer<typeof insertSmartContractSchema>;
export type SmartContract = typeof smartContractsTable.$inferSelect;
