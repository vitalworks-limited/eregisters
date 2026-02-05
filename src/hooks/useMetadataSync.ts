import { useEffect, useState } from "react";
import {
    MetadataSync,
    MetadataSyncProgress,
    MetadataSyncState,
    MetadataUpdateInfo,
} from "../db/metadata-sync";

/**
 * useMetadataSync Hook
 *
 * React hook for managing metadata synchronization with DHIS2.
 * Provides comprehensive control over metadata sync operations with automatic state management.
 *
 * Features:
 * - Full and incremental sync capabilities
 * - Persistent state across page refreshes (IndexedDB)
 * - Villages sync only once (configurable skip-on-update)
 * - Explicit sync methods for special cases
 * - Progress tracking and error handling
 *
 * @example
 * ```typescript
 * const {
 *   fullSync,
 *   syncChangedMetadata,
 *   syncVillages,
 *   isSyncing,
 *   state
 * } = useMetadataSync(metadataSync);
 *
 * // Initial full sync
 * await fullSync((progress) => {
 *   console.log(`${progress.percentage}% - ${progress.current}`);
 * });
 *
 * // Later: sync only changed metadata (efficient)
 * await syncChangedMetadata();
 *
 * // Explicitly sync villages when needed
 * await syncVillages();
 *
 * // Force complete refresh
 * await refetchAllMetadata();
 * ```
 */
export interface UseMetadataSyncReturn {
    state: MetadataSyncState;
    // Full sync methods
    fullSync: (
        onProgress?: (progress: MetadataSyncProgress) => void,
    ) => Promise<void>;
    forceFullSync: (
        onProgress?: (progress: MetadataSyncProgress) => void,
    ) => Promise<void>;
    // Incremental sync methods
    syncChangedMetadata: (
        onProgress?: (progress: MetadataSyncProgress) => void,
    ) => Promise<void>;
    getChangedMetadataTypes: () => Promise<string[]>;
    // Explicit sync methods
    syncVillages: (
        onProgress?: (progress: MetadataSyncProgress) => void,
    ) => Promise<void>;
    syncSpecificTypes: (
        types: string[],
        onProgress?: (progress: MetadataSyncProgress) => void,
    ) => Promise<void>;
    // Metadata management
    deleteAllMetadata: () => Promise<void>;
    refetchAllMetadata: (
        onProgress?: (progress: MetadataSyncProgress) => void,
    ) => Promise<void>;
    // Update checks
    checkForUpdates: () => Promise<MetadataUpdateInfo>;
    isStale: () => Promise<boolean>;
    // State flags
    isChecking: boolean;
    isSyncing: boolean;
    hasError: boolean;
    lastSync?: string;
}

export function useMetadataSync(
    metadataSync: MetadataSync,
): UseMetadataSyncReturn {
    const [state, setState] = useState<MetadataSyncState>(
        metadataSync.getState(),
    );

    // Subscribe to state changes from IndexedDB
    useEffect(() => {
        const pollInterval = setInterval(() => {
            const currentState = metadataSync.getState();
            setState(currentState);
        }, 500);

        return () => clearInterval(pollInterval);
    }, [metadataSync]);

    // Full sync methods
    const fullSync = async (
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> => {
        try {
            await metadataSync.fullSync(onProgress);
        } catch (error) {
            console.error("Full sync failed:", error);
            throw error;
        }
    };

    const forceFullSync = async (
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> => {
        try {
            await metadataSync.forceFullSync(onProgress);
        } catch (error) {
            console.error("Force full sync failed:", error);
            throw error;
        }
    };

    // Incremental sync methods
    const syncChangedMetadata = async (
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> => {
        try {
            await metadataSync.syncChangedMetadata(onProgress);
        } catch (error) {
            console.error("Sync changed metadata failed:", error);
            throw error;
        }
    };

    const getChangedMetadataTypes = async (): Promise<string[]> => {
        try {
            return await metadataSync.getChangedMetadataTypes();
        } catch (error) {
            console.error("Failed to get changed metadata types:", error);
            throw error;
        }
    };

    // Explicit sync methods
    const syncVillages = async (
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> => {
        try {
            await metadataSync.syncVillages(onProgress);
        } catch (error) {
            console.error("Sync villages failed:", error);
            throw error;
        }
    };

    const syncSpecificTypes = async (
        types: string[],
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> => {
        try {
            await metadataSync.syncSpecificTypes(types as any, onProgress);
        } catch (error) {
            console.error("Sync specific types failed:", error);
            throw error;
        }
    };

    // Metadata management
    const deleteAllMetadata = async (): Promise<void> => {
        try {
            await metadataSync.deleteAllMetadata();
        } catch (error) {
            console.error("Delete all metadata failed:", error);
            throw error;
        }
    };

    const refetchAllMetadata = async (
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> => {
        try {
            await metadataSync.refetchAllMetadata(onProgress);
        } catch (error) {
            console.error("Refetch all metadata failed:", error);
            throw error;
        }
    };

    // Update checks
    const checkForUpdates = async (): Promise<MetadataUpdateInfo> => {
        try {
            const changes = await metadataSync.checkForUpdates();
            return changes;
        } catch (error) {
            console.error("Failed to check for metadata updates:", error);
            throw error;
        }
    };

    const isStale = async (): Promise<boolean> => {
        return metadataSync.isMetadataStale();
    };

    return {
        state,
        fullSync,
        forceFullSync,
        syncChangedMetadata,
        getChangedMetadataTypes,
        syncVillages,
        syncSpecificTypes,
        deleteAllMetadata,
        refetchAllMetadata,
        checkForUpdates,
        isStale,
        isChecking: state.status === "checking",
        isSyncing: state.status === "syncing",
        hasError: state.status === "error",
        lastSync: state.lastSync,
    };
}
