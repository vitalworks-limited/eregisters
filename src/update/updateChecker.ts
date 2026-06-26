import { BUILD_HASH, VersionInfo } from "../version";

/**
 * In-app update detection (Phase 17).
 *
 * Why: when we ship the sync performance fix, browser sessions opened
 * before deployment must stop running the old (heavy) sync code and
 * pick up the new bundle without users manually clearing caches.
 *
 * The flow is:
 *   1. Every `pollIntervalMs` (default 5 min) fetch `version.json`
 *      with `cache: "no-store"` and a busting timestamp.
 *   2. If the remote `buildHash` differs from the bundled `BUILD_HASH`,
 *      flip `updateAvailable` to true. Listeners pause heavy sync and
 *      initiate the safe refresh flow.
 *   3. `isUpdateAvailable()` is the synchronous gate every heavy sync
 *      worker must call before doing work.
 */

export interface UpdateCheckerOptions {
    /** URL to poll. Default `version.json` (relative to the app root). */
    url?: string;
    /** Default 5 minutes; clamped to [60_000, 15 * 60_000] by the runtime. */
    pollIntervalMs?: number;
    /** Skip the very first fetch at t=0 (default: false). */
    skipImmediate?: boolean;
    /** Override the current build hash (testing). */
    currentBuildHash?: string;
    /** Override fetch (testing). */
    fetchImpl?: typeof fetch;
    /** Optional logger. */
    logger?: (message: string, extra?: unknown) => void;
}

export type UpdateListener = (info: VersionInfo) => void;

interface InternalState {
    available: boolean;
    remote?: VersionInfo;
    listeners: Set<UpdateListener>;
    timer?: ReturnType<typeof setTimeout>;
    polling: boolean;
}

const state: InternalState = {
    available: false,
    listeners: new Set(),
    polling: false,
};

const MIN_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 15 * 60_000;

function clampInterval(ms: number | undefined): number {
    const value = ms ?? 5 * 60_000;
    return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, value));
}

/**
 * Build the cache-busting URL. Uses `cache: "no-store"` headers too,
 * but appending a timestamp defeats intermediate proxies.
 */
function withBuster(url: string): string {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}t=${Date.now()}`;
}

/**
 * Performs one version check.
 *
 * Returns the remote version info if it differs from the bundled
 * BUILD_HASH (i.e. an update is available). Returns undefined when no
 * update is available, the file cannot be reached, or the response is
 * malformed.
 */
export async function checkForAppUpdate(
    options: UpdateCheckerOptions = {},
): Promise<VersionInfo | undefined> {
    const url = options.url ?? "version.json";
    const fetcher = options.fetchImpl ?? fetch;
    const current = options.currentBuildHash ?? BUILD_HASH;

    try {
        const response = await fetcher(withBuster(url), {
            cache: "no-store",
            headers: {
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
            },
        });
        if (!response.ok) return undefined;
        const remote = (await response.json()) as VersionInfo;
        if (!remote?.buildHash) return undefined;
        if (remote.buildHash === current) return undefined;
        return remote;
    } catch (err) {
        options.logger?.("update check failed", err);
        return undefined;
    }
}

/**
 * Returns true once `checkForAppUpdate` has reported a newer build.
 *
 * Heavy sync workers must call this before starting work and bail out
 * when it returns true (see src/update/syncGuard.ts).
 */
export function isUpdateAvailable(): boolean {
    return state.available;
}

export function getDetectedRemoteVersion(): VersionInfo | undefined {
    return state.remote;
}

export function onUpdateAvailable(listener: UpdateListener): () => void {
    state.listeners.add(listener);
    if (state.available && state.remote) {
        try {
            listener(state.remote);
        } catch {
            // listeners must never break the polling loop
        }
    }
    return () => {
        state.listeners.delete(listener);
    };
}

function markAvailable(remote: VersionInfo, logger?: UpdateCheckerOptions["logger"]) {
    state.available = true;
    state.remote = remote;
    logger?.("[update] new version detected", remote);
    for (const listener of state.listeners) {
        try {
            listener(remote);
        } catch {
            // ignore listener errors
        }
    }
}

/**
 * Starts the recurring poll. Returns a stop function. Safe to call
 * multiple times — only one poller runs at a time per page.
 */
export function startUpdatePolling(
    options: UpdateCheckerOptions = {},
): () => void {
    if (state.polling) {
        return () => stopUpdatePolling();
    }
    state.polling = true;
    const interval = clampInterval(options.pollIntervalMs);

    const tick = async () => {
        if (!state.polling) return;
        const remote = await checkForAppUpdate(options);
        if (remote) {
            markAvailable(remote, options.logger);
            // Stop polling once an update has been detected — the safe
            // refresh flow takes over.
            stopUpdatePolling();
            return;
        }
        state.timer = setTimeout(tick, interval);
    };

    if (options.skipImmediate) {
        state.timer = setTimeout(tick, interval);
    } else {
        // Defer just enough to avoid blocking the first render.
        state.timer = setTimeout(tick, 0);
    }

    return () => stopUpdatePolling();
}

export function stopUpdatePolling(): void {
    state.polling = false;
    if (state.timer) {
        clearTimeout(state.timer);
        state.timer = undefined;
    }
}

/** Test helper: clear the singleton state. */
export function _resetUpdateChecker(): void {
    state.available = false;
    state.remote = undefined;
    state.listeners.clear();
    stopUpdatePolling();
}
