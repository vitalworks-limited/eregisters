import { isUpdateAvailable } from "./updateChecker";

/**
 * Heavy-sync guard (Phase 17.5).
 *
 * Every entry point that triggers tracker traffic — background pull,
 * background push, delete batch, manual sync, retry queue — should
 * call this first and bail out when an update is pending.
 *
 * The function is sync so it can be inlined cheaply at the top of an
 * actor / xstate guard.
 */

export interface SyncGuardOptions {
    /** Optional callback when the guard blocks (e.g. notify the user). */
    onBlocked?: () => void;
}

/**
 * Returns true if a heavy sync action should be skipped because a new
 * version of the app is waiting to be installed.
 */
export function isSyncBlockedByUpdate(
    options: SyncGuardOptions = {},
): boolean {
    if (isUpdateAvailable()) {
        options.onBlocked?.();
        return true;
    }
    return false;
}

/**
 * Convenience: wrap an async function so it short-circuits if a new
 * version is detected.
 */
export function withUpdateGuard<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options: SyncGuardOptions = {},
): (...args: TArgs) => Promise<TResult | undefined> {
    return async (...args: TArgs) => {
        if (isSyncBlockedByUpdate(options)) return undefined;
        return fn(...args);
    };
}
