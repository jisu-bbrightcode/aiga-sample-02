import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import { loadEnv } from "../env.js";
import * as schema from "./schema/index.js";

/**
 * Drizzle client bound to the Neon (PostgreSQL) pool.
 *
 * Neon speaks the standard PostgreSQL wire protocol, so `pg` works directly
 * against the pooled `DATABASE_URL`. The pool and db handle are lazily created
 * so that pure domain modules (membership/rbac) can be imported and tested
 * without a live database connection.
 */
export type Database = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let db: Database | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const env = loadEnv();
  pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  return pool;
}

export function getDb(): Database {
  if (db) return db;
  db = drizzle(getPool(), { schema });
  return db;
}

/** Close the pool (used on graceful shutdown and in tests). */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}

export { schema };
