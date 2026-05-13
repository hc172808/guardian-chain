import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const featureTogglesTable = pgTable("feature_toggles", {
  id: uuid("id").primaryKey().defaultRandom(),
  feature_key: text("feature_key").notNull(),
  feature_name: text("feature_name").notNull(),
  description: text("description"),
  is_enabled: boolean("is_enabled").notNull().default(false),
  admin_only: boolean("admin_only").notNull().default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFeatureToggleSchema = createInsertSchema(featureTogglesTable);
export type InsertFeatureToggle = z.infer<typeof insertFeatureToggleSchema>;
export type FeatureToggle = typeof featureTogglesTable.$inferSelect;
