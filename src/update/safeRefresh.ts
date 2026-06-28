import { VersionInfo } from "../version";

/**
 * Safe refresh flow (Phase 17.4).
 *
 * Why: when a new build is detected we need to reload the page so the
 * new bundle takes effect. We must:
 *   - not lose unsaved form data,
 *   - not delete IndexedDB clinical/offline data,
 *   - only clear *app-shell* caches.
 */

export const SAFE_REFRESH_MESSAGE =
    "A new eRegisters version has been installed. The app will refresh to apply important updates. Your saved local data will not be lost.";

export const UNSAVED_DATA_MESSAGE =
    "A new eRegisters version is available. Please save or discard the current form to apply the update safely.";

export const FORCED_REFRESH_MESSAGE =
    "Administrator initiated an urgent app update. The app will reload now — any in-progress draft was saved automatically.";

export interface SafeRefreshOptions {
    /** Returns true if the user has unsaved form data in memory. */
    hasUnsavedData?: () => boolean | Promise<boolean>;
    /** Attempt to save drafts. Should resolve to true on success. */
    saveDraftIfPossible?: () => boolean | Promise<boolean>;
    /** User notifier (success / info). Default: console.info. */
    notify?: (message: string) => void;
    /** User notifier (warn / blocking). Default: console.warn. */
    notifyBlocking?: (message: string) => void;
    /** Reload implementation (testing). Default: window.location.reload. */
    reload?: () => void;
    /** Service worker / cache cleanup hook. Default: cleanAppShellCaches. */
    cleanCaches?: () => Promise<void> | void;
    /** Optional logger. */
    logger?: (message: string, extra?: unknown) => void;
    /**
     * Severity hint from the admin broadcast.
     * - `info` (default): defer when unsaved drafts cannot be saved.
     * - `forced`: still attempt to save drafts, but reload regardless.
     */
    severity?: "info" | "forced";
}

export interface SafeRefreshResult {
    /** True when reload was scheduled. */
    reloaded: boolean;
    /** True when reload was deferred because of unsaved data. */
    deferredForUnsavedData: boolean;
}

/**
 * Default no-op cache cleaner if the host doesn't pass one. The PWA
 * shell may register a SW listener separately.
 */
async function noopCacheCleanup() {
    /* no-op */
}

/**
 * Walks the Cache Storage and deletes only app-shell / static asset
 * caches. Anything matching the patterns below is treated as offline
 * clinical data and preserved.
 */
export async function cleanAppShellCaches(): Promise<void> {
    if (typeof caches === "undefined") return;
    const PROTECTED_PATTERNS = [
        /clinical/i,
        /offline-data/i,
        /tracker-data/i,
        /indexed/i,
        // DHIS2 PWA "recording-mode" caches store offline app sections;
        // never wipe them — they hold offline-captured data the user
        // has not yet pushed.
        /^section-/i,
        /^recording-/i,
    ];
    try {
        const keys = await caches.keys();
        await Promise.all(
            keys.map(async (key) => {
                if (PROTECTED_PATTERNS.some((p) => p.test(key))) return;
                await caches.delete(key);
            }),
        );
    } catch {
        // never block refresh on cache cleanup
    }
}

/**
 * If a service worker is registered with a waiting worker (newer
 * version downloaded), ask it to skipWaiting so the next reload
 * activates the new bundle. No-op if no SW is registered.
 *
 * IMPORTANT: this never touches IndexedDB clinical data; only the
 * SW's own controlled caches change.
 */
export async function activatePendingServiceWorker(): Promise<void> {
    if (
        typeof navigator === "undefined" ||
        !("serviceWorker" in navigator)
    ) {
        return;
    }
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
    } catch {
        // never block refresh on SW errors
    }
}

/**
 * Reload the page safely. Defers if unsaved form data is detected and
 * cannot be auto-saved.
 *
 * IMPORTANT: this function never touches IndexedDB clinical data.
 */
export async function startSafeRefreshFlow(
    remote: VersionInfo,
    options: SafeRefreshOptions = {},
): Promise<SafeRefreshResult> {
    const notify = options.notify ?? ((m) => console.info(m));
    const notifyBlocking = options.notifyBlocking ?? ((m) => console.warn(m));
    const reload =
        options.reload ??
        (() => {
            if (typeof window !== "undefined") window.location.reload();
        });
    const cleanCaches = options.cleanCaches ?? cleanAppShellCaches;
    const logger = options.logger;

    logger?.(`[safe-refresh] starting for ${remote.version} ${remote.buildHash}`);

    let unsaved = false;
    try {
        unsaved = Boolean(await options.hasUnsavedData?.());
    } catch (err) {
        logger?.("[safe-refresh] hasUnsavedData threw; assuming no", err);
        unsaved = false;
    }

    if (unsaved) {
        let drafted = false;
        try {
            drafted = Boolean(await options.saveDraftIfPossible?.());
        } catch (err) {
            logger?.("[safe-refresh] draft save threw", err);
            drafted = false;
        }
        if (!drafted) {
            if (options.severity === "forced") {
                // Admin escalated the broadcast — surface the warning
                // but still proceed with the reload below.
                logger?.("[safe-refresh] forced reload despite unsaved data");
                notifyBlocking(FORCED_REFRESH_MESSAGE);
            } else {
                notifyBlocking(UNSAVED_DATA_MESSAGE);
                return { reloaded: false, deferredForUnsavedData: true };
            }
        }
    }

    notify(
        options.severity === "forced"
            ? FORCED_REFRESH_MESSAGE
            : SAFE_REFRESH_MESSAGE,
    );
    try {
        await Promise.resolve(cleanCaches());
    } catch (err) {
        logger?.("[safe-refresh] cache cleanup error", err);
    }
    try {
        await activatePendingServiceWorker();
    } catch (err) {
        logger?.("[safe-refresh] SW skipWaiting error", err);
    }
    try {
        // Defer a tick so the notify message renders before reload.
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        reload();
    } catch (err) {
        logger?.("[safe-refresh] reload failed", err);
    }
    return { reloaded: true, deferredForUnsavedData: false };
}
