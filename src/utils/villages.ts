import { Village } from "../schemas";

/**
 * Lazy loader for the large `data/villages.min.json` static file
 * (~11 MB in production).
 *
 * Why: production showed every app load fetching this file. We:
 *   1. Never load it as part of app startup.
 *   2. Cache it in module memory so multiple village-pickers share one fetch.
 *   3. Coalesce concurrent loads behind a single in-flight promise.
 */

let cache: Village[] | undefined;
let inflight: Promise<Village[]> | undefined;

/**
 * Returns the village list, loading once and caching the result.
 *
 * Callers should only invoke this when a UI surface (e.g. village
 * picker) actually needs the data.
 */
export async function loadVillagesWhenNeeded(): Promise<Village[]> {
    if (cache) return cache;
    if (inflight) return inflight;

    inflight = fetch("./data/villages.min.json")
        .then((res) => {
            if (!res.ok) {
                throw new Error(
                    `Failed to load villages.min.json (${res.status})`,
                );
            }
            return res.json() as Promise<Village[]>;
        })
        .then((data) => {
            cache = data;
            return data;
        })
        .finally(() => {
            inflight = undefined;
        });

    return inflight;
}

/** Test helper: drop the cached villages list. */
export function _clearVillageCache() {
    cache = undefined;
    inflight = undefined;
}
