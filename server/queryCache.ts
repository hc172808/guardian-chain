/**
 * PostgreSQL Query Cache (a.k.a. "repeater")
 *
 * Serves cached copies of frequently-read DB query results without
 * hitting PostgreSQL on every request. Two modes:
 *   1. cachedQuery  — wraps pool.query calls with TTL caching
 *   2. withCache    — Express middleware that caches full JSON responses
 *
 * Stats and cache management are exposed via /api/admin/cache-stats
 * and POST /api/admin/cache-clear.
 */

import type { Request, Response, NextFunction } from 'express';

interface QueryEntry {
  rows: any[];
  ts: number;
  hits: number;
}

interface ResponseEntry {
  body: string;
  ts: number;
  hits: number;
}

const queryStore  = new Map<string, QueryEntry>();
const responseStore = new Map<string, ResponseEntry>();

let totalQueryHits   = 0;
let totalQueryMisses = 0;
let totalResHits     = 0;
let totalResMisses   = 0;

function queryKey(sql: string, params: any[]): string {
  return sql.replace(/\s+/g, ' ').trim() + '\x00' + JSON.stringify(params ?? []);
}

/** Wrap pool.query with an in-memory TTL cache. */
export async function cachedQuery<T = any>(
  pool: { query: (sql: string, params?: any[]) => Promise<{ rows: T[] }> },
  sql: string,
  params: any[] = [],
  ttlMs = 10_000,
): Promise<{ rows: T[] }> {
  const key = queryKey(sql, params);
  const now = Date.now();
  const hit = queryStore.get(key);
  if (hit && now - hit.ts < ttlMs) {
    hit.hits++;
    totalQueryHits++;
    return { rows: hit.rows as T[] };
  }
  totalQueryMisses++;
  const result = await pool.query(sql, params.length ? params : undefined);
  queryStore.set(key, { rows: result.rows, ts: Date.now(), hits: 0 });
  return result;
}

/**
 * Express middleware factory — caches the JSON response body for the
 * given TTL. Keyed on the full URL (path + query string). Skips
 * non-GET methods automatically so mutations always bypass the cache.
 */
export function withCache(ttlMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();
    const key = req.originalUrl;
    const now = Date.now();
    const hit = responseStore.get(key);
    if (hit && now - hit.ts < ttlMs) {
      hit.hits++;
      totalResHits++;
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(hit.body);
    }
    totalResMisses++;
    const origJson = res.json.bind(res);
    res.json = function (body: any) {
      const serialised = JSON.stringify(body);
      responseStore.set(key, { body: serialised, ts: Date.now(), hits: 0 });
      res.setHeader('X-Cache', 'MISS');
      return origJson(body);
    };
    next();
  };
}

/** Force-evict cache entries whose key contains `pattern`. */
export function invalidate(pattern: string | RegExp): number {
  let n = 0;
  const test = (k: string) =>
    typeof pattern === 'string' ? k.includes(pattern) : pattern.test(k);
  for (const [k] of queryStore)   { if (test(k)) { queryStore.delete(k);   n++; } }
  for (const [k] of responseStore){ if (test(k)) { responseStore.delete(k); n++; } }
  return n;
}

/** Wipe all entries in both stores. */
export function clearCache(): { queryEntries: number; responseEntries: number } {
  const q = queryStore.size;
  const r = responseStore.size;
  queryStore.clear();
  responseStore.clear();
  return { queryEntries: q, responseEntries: r };
}

/** Stats snapshot for the admin panel. */
export function getCacheStats() {
  const now = Date.now();

  const liveQ = [...queryStore.values()].filter(e => now - e.ts < 60_000);
  const liveR = [...responseStore.values()].filter(e => now - e.ts < 60_000);

  const topQueryKeys = [...queryStore.entries()]
    .filter(([, v]) => now - v.ts < 60_000)
    .sort(([, a], [, b]) => b.hits - a.hits)
    .slice(0, 8)
    .map(([k, v]) => ({
      key: k.slice(0, 80).replace(/\x00.*$/, '…'),
      hits: v.hits,
      ageSeconds: Math.round((now - v.ts) / 1000),
    }));

  const topResponseKeys = [...responseStore.entries()]
    .filter(([, v]) => now - v.ts < 60_000)
    .sort(([, a], [, b]) => b.hits - a.hits)
    .slice(0, 8)
    .map(([k, v]) => ({
      key: k,
      hits: v.hits,
      ageSeconds: Math.round((now - v.ts) / 1000),
      sizeBytes: v.body.length,
    }));

  const qTotal  = totalQueryHits + totalQueryMisses;
  const rTotal  = totalResHits   + totalResMisses;

  return {
    query: {
      liveEntries: liveQ.length,
      totalEntries: queryStore.size,
      hits: totalQueryHits,
      misses: totalQueryMisses,
      hitRate: qTotal ? ((totalQueryHits / qTotal) * 100).toFixed(1) + '%' : '0%',
      topKeys: topQueryKeys,
    },
    response: {
      liveEntries: liveR.length,
      totalEntries: responseStore.size,
      hits: totalResHits,
      misses: totalResMisses,
      hitRate: rTotal ? ((totalResHits / rTotal) * 100).toFixed(1) + '%' : '0%',
      topKeys: topResponseKeys,
    },
  };
}

// Prune expired entries every 30 seconds
setInterval(() => {
  const now = Date.now();
  const MAX_AGE = 120_000;
  for (const [k, v] of queryStore)   { if (now - v.ts > MAX_AGE) queryStore.delete(k); }
  for (const [k, v] of responseStore){ if (now - v.ts > MAX_AGE) responseStore.delete(k); }
}, 30_000).unref();
