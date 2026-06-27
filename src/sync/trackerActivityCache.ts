/**
 * Module-level cache for "recent tracker activity" used by the admin
 * Logs and Data capture pages.
 *
 * Why: those pages run repeated queries against `/api/tracker/*` to
 * surface per-user and per-hour analytics. Without a cache, navigating
 * between admin tabs (or even a single React strict-mode remount) would
 * fan out into multiple identical requests, which is the opposite of
 * what the user asked for ("Logs must not affect performance").
 *
 * Cache lifetime is 5 minutes, keyed by a string the caller provides
 * (typically `${facility}:${rangeKey}`). The caller still owns the
 * fetch function; this module just memoises the in-flight promise so
 * the same scope hits the network once.
 */

interface CacheEntry<T> {
    at: number;
    value: T;
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function getCached<T>(key: string): T | undefined {
    const hit = cache.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > TTL_MS) {
        cache.delete(key);
        return undefined;
    }
    return hit.value as T;
}

export function setCached<T>(key: string, value: T): void {
    cache.set(key, { at: Date.now(), value });
}

export async function withCache<T>(
    key: string,
    fetcher: () => Promise<T>,
): Promise<T> {
    const cached = getCached<T>(key);
    if (cached !== undefined) return cached;
    const inflightHit = inflight.get(key) as Promise<T> | undefined;
    if (inflightHit) return inflightHit;
    const p = fetcher()
        .then((v) => {
            setCached(key, v);
            return v;
        })
        .finally(() => {
            inflight.delete(key);
        });
    inflight.set(key, p);
    return p;
}

export function invalidateCache(key?: string): void {
    if (key) {
        cache.delete(key);
        inflight.delete(key);
        return;
    }
    cache.clear();
    inflight.clear();
}
