/**
 * Simple in-memory TTL cache for API responses.
 * Each route gets its own cache instance via `createCache()`.
 * Cache is keyed by a string (typically `from|to`).
 */

type CacheEntry<T> = { ts: number; data: T };

export function createCache<T>(ttlMs = 10 * 60 * 1000) {
  const store = new Map<string, CacheEntry<T>>();

  return {
    get(key: string): T | null {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() - entry.ts > ttlMs) {
        store.delete(key);
        return null;
      }
      return entry.data;
    },
    set(key: string, data: T) {
      store.set(key, { ts: Date.now(), data });
      // Evict old entries (keep max 20)
      if (store.size > 20) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
    },
  };
}
