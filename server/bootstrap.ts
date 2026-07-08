/**
 * bootstrap.ts — Idempotent DB repair routine
 *
 * Runs at server startup to reconcile schema drift that can occur after a
 * project import, a database restore, or a drizzle-kit push that was run
 * before certain tables existed.
 *
 * Every operation here uses IF NOT EXISTS / conditional DO blocks so it is
 * safe to run on every boot against an already-healthy database.
 */

import { Pool } from "pg";

export async function bootstrapDatabase(pgPool: Pool): Promise<void> {
  const repairs: string[] = [];

  // ── 1. Repair missing id sequences ────────────────────────────────────────
  // drizzle-kit push can create INTEGER PRIMARY KEY columns without attaching
  // a sequence, causing INSERT failures with "null value in column id".
  for (const table of ["payment_methods", "trade_history"]) {
    try {
      const { rows } = await pgPool.query<{ has_default: boolean }>(`
        SELECT column_default IS NOT NULL AS has_default
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'id'
      `, [table]);

      if (rows.length > 0 && !rows[0].has_default) {
        const seq = `${table}_id_seq`;
        await pgPool.query(`CREATE SEQUENCE IF NOT EXISTS ${seq}`);
        await pgPool.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT nextval('${seq}')`);
        await pgPool.query(`
          SELECT setval('${seq}',
            COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1,
            false)
        `);
        repairs.push(`repaired id sequence on ${table}`);
      }
    } catch (e: any) {
      console.warn(`[bootstrap] sequence repair skipped for ${table}: ${e.message}`);
    }
  }

  // ── 2. Repair missing UNIQUE constraints ──────────────────────────────────
  const uniqueFixes: Array<{ table: string; column: string; constraint: string }> = [
    { table: "governance_treasury", column: "coin",    constraint: "governance_treasury_coin_key" },
    { table: "oracle_feeds",        column: "feed_id", constraint: "oracle_feeds_feed_id_key" },
  ];

  for (const { table, column, constraint } of uniqueFixes) {
    try {
      await pgPool.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = '${table}'
          ) AND NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = '${constraint}'
          ) THEN
            ALTER TABLE ${table} ADD CONSTRAINT ${constraint} UNIQUE (${column});
          END IF;
        END
        $$
      `);
      // Only note it if we needed to add it (no way to tell without a second query; silent is fine)
    } catch (e: any) {
      console.warn(`[bootstrap] unique constraint fix skipped for ${table}.${column}: ${e.message}`);
    }
  }

  // ── 3. Ensure tables that runtime code reads but no init creates ──────────
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS test_node_state (
        id          TEXT PRIMARY KEY,
        should_run  BOOLEAN DEFAULT false,
        node_type   TEXT,
        network     TEXT,
        config_json TEXT DEFAULT '{}',
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (e: any) {
    console.warn(`[bootstrap] test_node_state creation failed: ${e.message}`);
  }

  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS oracle_feeds (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        feed_id      TEXT NOT NULL UNIQUE,
        description  TEXT,
        value        NUMERIC DEFAULT 0,
        decimals     INTEGER DEFAULT 8,
        provider     TEXT DEFAULT 'internal',
        active       BOOLEAN DEFAULT true,
        last_updated TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS oracle_submissions (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        feed_id      TEXT NOT NULL,
        submitter    TEXT NOT NULL,
        value        NUMERIC NOT NULL,
        block_height BIGINT,
        submitted_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS oracle_sub_feed_idx
        ON oracle_submissions(feed_id, submitted_at DESC)
    `);
  } catch (e: any) {
    console.warn(`[bootstrap] oracle tables creation failed: ${e.message}`);
  }

  if (repairs.length > 0) {
    console.log(`[bootstrap] Schema repairs applied: ${repairs.join(", ")}`);
  }
}
