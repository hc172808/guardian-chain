import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRolesTable = pgTable("user_roles", {
  id: text("id").primaryKey().default("gen_random_uuid()"),
  user_id: text("user_id").notNull(),
  role: text("role").notNull().default("user"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserRoleSchema = createInsertSchema(userRolesTable);
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRolesTable.$inferSelect;
