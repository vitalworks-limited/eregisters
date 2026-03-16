import { db } from "./index";

export interface InitialSyncState {
    lastMetadataPull: string | undefined;
    lastDataPull: string | undefined;
}

/**
 * Load initial sync state from IndexedDB
 * Used to restore sync timestamps when app initializes
 */
export async function loadInitialSyncState(): Promise<InitialSyncState> {
    try {
        // Load metadata sync timestamp from metadataVersions table
        const metadataVersion = await db.metadataVersions.get(
            "metadata-version",
        );

        // Load data sync timestamp from syncState table (if exists)
        const syncState = await db.syncState?.get("current");

        return {
            lastMetadataPull: metadataVersion?.lastSync,
            lastDataPull: syncState?.lastPullAt,
        };
    } catch (error) {
        console.error("Failed to load initial sync state:", error);
        // Return undefined values on error to trigger full sync
        return {
            lastMetadataPull: undefined,
            lastDataPull: undefined,
        };
    }
}
