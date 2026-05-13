import { pgTable, text, json, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contractTemplatesTable = pgTable("contract_templates", {
  id: text("id").primaryKey().default("gen_random_uuid()"),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("custom"),
  template_code: text("template_code").notNull(),
  abi: json("abi"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"),
});

export const insertContractTemplateSchema = createInsertSchema(contractTemplatesTable);
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;
export type ContractTemplate = typeof contractTemplatesTable.$inferSelect;
