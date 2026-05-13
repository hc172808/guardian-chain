import { pgTable, uuid, text, boolean, doublePrecision, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nodeInstallationsTable = pgTable("node_installations", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull(),
  node_type: text("node_type").notNull(),
  is_online: boolean("is_online"),
  is_synced: boolean("is_synced"),
  is_approved: boolean("is_approved"),
  last_heartbeat: timestamp("last_heartbeat"),
  last_sync_at: timestamp("last_sync_at"),
  last_block_height: integer("last_block_height"),
  blocks_synced: integer("blocks_synced"),
  sync_progress: doublePrecision("sync_progress"),
  peer_count: integer("peer_count"),
  uptime_seconds: integer("uptime_seconds"),
  hash_rate: doublePrecision("hash_rate"),
  valid_shares: integer("valid_shares"),
  error_count: integer("error_count"),
  connection_quality: doublePrecision("connection_quality"),
  total_rewards: doublePrecision("total_rewards"),
  wireguard_public_key: text("wireguard_public_key"),
  wireguard_private_key: text("wireguard_private_key"),
  approved_at: timestamp("approved_at"),
  approved_by: text("approved_by"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertNodeInstallationSchema = createInsertSchema(nodeInstallationsTable);
export type InsertNodeInstallation = z.infer<typeof insertNodeInstallationSchema>;
export type NodeInstallation = typeof nodeInstallationsTable.$inferSelect;
