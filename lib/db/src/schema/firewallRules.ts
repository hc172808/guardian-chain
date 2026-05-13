import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const firewallRulesTable = pgTable("firewall_rules", {
  id: text("id").primaryKey().default("gen_random_uuid()"),
  rule_type: text("rule_type").notNull().default("ip"),
  ip_address: text("ip_address"),
  port: text("port"),
  protocol: text("protocol").notNull().default("tcp"),
  direction: text("direction").notNull().default("inbound"),
  action: text("action").notNull().default("allow"),
  description: text("description"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFirewallRuleSchema = createInsertSchema(firewallRulesTable);
export type InsertFirewallRule = z.infer<typeof insertFirewallRuleSchema>;
export type FirewallRule = typeof firewallRulesTable.$inferSelect;
