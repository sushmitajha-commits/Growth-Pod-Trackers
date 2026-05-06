/**
 * In-memory TTL cache for API responses, with optional disk persistence
 * for closed-month ranges (so historical data survives restarts).
 *
 * - In-memory: every cached entry; honors `ttlMs`.
 * - Disk: only ranges where `to` is strictly before the current month start.
 *   Historical data doesn't change, so we treat disk hits as fresh.
 *
 * Cache is keyed by `${from}|${to}` (YYYY-MM-DD).
 */

import fs from "node:fs";
import path from "node:path";

type CacheEntry<T> = { ts: number; data: T };

const CACHE_DIR = path.join(process.cwd(), ".cache");

function isHistoricalRange(key: string): boolean {
  const parts = key.split("|");
  if (parts.length !== 2) return false;
  const [from, to] = parts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  return to < monthStart;
}

function diskPath(namespace: string, key: string) {
  const safe = key.replace(/[^a-zA-Z0-9-]/g, "_");
  return path.join(CACHE_DIR, `${namespace}-${safe}.json`);
}

type CacheOpts = { namespace: string; ttlMs?: number };

export function createCache<T>(opts: CacheOpts | number = 10 * 60 * 1000) {
  const config = typeof opts === "number"
    ? { namespace: "", ttlMs: opts }
    : { namespace: opts.namespace, ttlMs: opts.ttlMs ?? 10 * 60 * 1000 };
  const store = new Map<string, CacheEntry<T>>();
  const persist = !!config.namespace;

  if (persist) {
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
  }

  return {
    get(key: string): T | null {
      const entry = store.get(key);
      if (entry) {
        if (Date.now() - entry.ts <= config.ttlMs) return entry.data;
        store.delete(key);
      }
      if (persist && isHistoricalRange(key)) {
        try {
          const fp = diskPath(config.namespace, key);
          if (fs.existsSync(fp)) {
            const raw = fs.readFileSync(fp, "utf8");
            const parsed = JSON.parse(raw) as T;
            store.set(key, { ts: Date.now(), data: parsed });
            return parsed;
          }
        } catch {}
      }
      return null;
    },
    set(key: string, data: T) {
      store.set(key, { ts: Date.now(), data });
      if (store.size > 50) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      if (persist && isHistoricalRange(key)) {
        try {
          fs.writeFileSync(diskPath(config.namespace, key), JSON.stringify(data));
        } catch {}
      }
    },
  };
}
