import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const authoritiesTable = pgTable("authorities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  required_role: text("required_role").notNull().default("admin"),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  updated_by: text("updated_by"),
});

export const insertAuthoritySchema = createInsertSchema(authoritiesTable);
export type InsertAuthority = z.infer<typeof insertAuthoritySchema>;
export type Authority = typeof authoritiesTable.$inferSelect;
