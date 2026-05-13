import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tokenWatchlistTable = pgTable("token_watchlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull(),
  token_id: text("token_id").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertTokenWatchlistSchema = createInsertSchema(tokenWatchlistTable);
export type InsertTokenWatchlist = z.infer<typeof insertTokenWatchlistSchema>;
export type TokenWatchlist = typeof tokenWatchlistTable.$inferSelect;
