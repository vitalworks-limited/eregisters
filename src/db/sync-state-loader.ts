import { db } from "./index";

export interface InitialSyncState {
    lastMetadataPull: string | undefined;
    lastDataPull: string | undefined;
    lastDataPush: string | undefined;
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
            lastDataPush: syncState?.lastPushAt,
        };
    } catch (error) {
        console.error("Failed to load initial sync state:", error);
        return {
            lastMetadataPull: undefined,
            lastDataPull: undefined,
            lastDataPush: undefined,
        };
    }
}
