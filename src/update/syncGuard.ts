import { getCachedAdminConfig } from "../sync/adminConfigCache";
import { isSyncAllowedByAdmin } from "../sync/adminConfig";
import { isUpdateAvailable } from "./updateChecker";

/**
 * Heavy-sync guard (Phase 17.5).
 *
 * Every entry point that triggers tracker traffic — background pull,
 * background push, delete batch, manual sync, retry queue — should
 * call this first and bail out when an update is pending OR when the
 * admin has blocked sync (kill switch / outside allowed window / inside
 * a blocked window).
 *
 * The function is sync so it can be inlined cheaply at the top of an
 * actor / xstate guard.
 */

export interface SyncGuardOptions {
    /** Optional callback when the guard blocks (e.g. notify the user). */
    onBlocked?: (reason: string) => void;
}

/**
 * Returns true if a heavy sync action should be skipped because a new
 * version of the app is waiting to be installed, or the admin has
 * blocked sync.
 */
export function isSyncBlockedByUpdate(
    options: SyncGuardOptions = {},
): boolean {
    if (isUpdateAvailable()) {
        options.onBlocked?.("Update pending");
        return true;
    }
    const { syncConfig, killSwitch } = getCachedAdminConfig();
    const verdict = isSyncAllowedByAdmin(new Date(), syncConfig, killSwitch);
    if (!verdict.allowed) {
        options.onBlocked?.(verdict.reason ?? "Blocked by admin");
        return true;
    }
    return false;
}

/**
 * Returns a human-readable reason for the current sync block, or
 * undefined if sync is currently allowed. Used by the user-facing
 * sync popover to show why a manual sync isn't running.
 */
export function getSyncBlockReason(): string | undefined {
    if (isUpdateAvailable()) return "Update pending — refresh required";
    const { syncConfig, killSwitch } = getCachedAdminConfig();
    const verdict = isSyncAllowedByAdmin(new Date(), syncConfig, killSwitch);
    if (!verdict.allowed) return verdict.reason;
    return undefined;
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
