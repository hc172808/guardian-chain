import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ipAccessListTable = pgTable("ip_access_list", {
  id: uuid("id").primaryKey().defaultRandom(),
  ip_address: text("ip_address").notNull(),
  list_type: text("list_type").notNull().default("whitelist"),
  reason: text("reason"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"),
  expires_at: timestamp("expires_at"),
});

export const insertIpAccessListSchema = createInsertSchema(ipAccessListTable);
export type InsertIpAccessList = z.infer<typeof insertIpAccessListSchema>;
export type IpAccessList = typeof ipAccessListTable.$inferSelect;
