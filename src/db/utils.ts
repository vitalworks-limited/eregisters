/**
 * Utility functions for database operations
 */

/**
 * Checks if a collection update only contains internal sync metadata changes
 * (lastSynced, version, syncError)
 *
 * Note: syncStatus is NOT considered metadata-only because status transitions
 * (e.g., "draft" → "pending") are significant changes that require sync queueing.
 *
 * @param changes - Object containing the changed fields
 * @returns true if only internal sync metadata changed, false otherwise
 */
export function isSyncMetadataOnlyChange(changes: Record<string, any>): boolean {
    const changeKeys = Object.keys(changes);
    return (
        changeKeys.length > 0 &&
        changeKeys.every(
            (k) =>
                k === "lastSynced" ||
                k === "version" ||
                k === "syncError",
        )
    );
}
