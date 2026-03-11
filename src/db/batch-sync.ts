import {
    FlattenedTrackedEntity,
    FlattenedEvent,
} from "../schemas";
import { dhis2SyncManager } from "./dhis2-sync";
import { setInternalUpdate } from "./collections";
import {
    trackedEntitiesCollection,
    eventsCollection,
} from "../collections";

/**
 * Batch Sync Manager
 *
 * Optimizes sync performance by:
 * 1. Batching multiple entities together to reduce HTTP requests
 * 2. Prioritizing entities based on user actions (recently modified first)
 * 3. Implementing exponential backoff for failed syncs
 * 4. Providing sync progress monitoring
 */

export interface BatchSyncOptions {
    batchSize?: number; // Default: 10
    maxRetries?: number; // Default: 3
    retryDelay?: number; // Default: 1000ms
    onProgress?: (progress: SyncProgress) => void;
}

export interface SyncProgress {
    total: number;
    completed: number;
    failed: number;
    percentage: number;
    currentBatch: number;
    totalBatches: number;
}

export interface SyncResult {
    success: boolean;
    synced: number;
    failed: number;
    errors: Array<{ id: string; error: string }>;
}

class BatchSyncManager {
    private isSyncing = false;
    private syncQueue: Set<string> = new Set();

    /**
     * Sync multiple tracked entities in batches
     */
    async syncTrackedEntitiesBatch(
        entities: FlattenedTrackedEntity[],
        options: BatchSyncOptions = {},
    ): Promise<SyncResult> {
        const {
            batchSize = 10,
            maxRetries = 3,
            retryDelay = 1000,
            onProgress,
        } = options;

        if (this.isSyncing) {
            return { success: false, synced: 0, failed: 0, errors: [] };
        }

        this.isSyncing = true;
        const result: SyncResult = {
            success: true,
            synced: 0,
            failed: 0,
            errors: [],
        };

        try {
            // Filter entities that need syncing
            const pendingEntities = entities.filter(
                (e) =>
                    e.syncStatus === "pending" ||
                    e.syncStatus === "failed" ||
                    e.syncStatus === "deleted",
            );

            // Sort by updatedAt descending (most recent first)
            const sortedEntities = pendingEntities.sort(
                (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime(),
            );

            const totalBatches = Math.ceil(sortedEntities.length / batchSize);

            // Process in batches
            for (let i = 0; i < sortedEntities.length; i += batchSize) {
                const batch = sortedEntities.slice(i, i + batchSize);
                const currentBatch = Math.floor(i / batchSize) + 1;

                // Report progress
                if (onProgress) {
                    onProgress({
                        total: sortedEntities.length,
                        completed: result.synced,
                        failed: result.failed,
                        percentage: Math.round(
                            (result.synced / sortedEntities.length) * 100,
                        ),
                        currentBatch,
                        totalBatches,
                    });
                }

                // Sync batch with retry logic
                await this.syncBatchWithRetry(
                    batch,
                    "trackedEntity",
                    maxRetries,
                    retryDelay,
                    result,
                );
            }

            // Final progress report
            if (onProgress) {
                onProgress({
                    total: sortedEntities.length,
                    completed: result.synced,
                    failed: result.failed,
                    percentage: 100,
                    currentBatch: totalBatches,
                    totalBatches,
                });
            }

            result.success = result.failed === 0;
            return result;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Sync multiple events in batches
     */
    async syncEventsBatch(
        events: FlattenedEvent[],
        options: BatchSyncOptions = {},
    ): Promise<SyncResult> {
        const {
            batchSize = 10,
            maxRetries = 3,
            retryDelay = 1000,
            onProgress,
        } = options;

        if (this.isSyncing) {
            return { success: false, synced: 0, failed: 0, errors: [] };
        }

        this.isSyncing = true;
        const result: SyncResult = {
            success: true,
            synced: 0,
            failed: 0,
            errors: [],
        };

        try {
            // Filter events that need syncing
            const pendingEvents = events.filter(
                (e) =>
                    e.syncStatus === "pending" ||
                    e.syncStatus === "failed" ||
                    e.syncStatus === "deleted",
            );

            // Sort by updatedAt descending (most recent first)
            const sortedEvents = pendingEvents.sort(
                (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime(),
            );

            const totalBatches = Math.ceil(sortedEvents.length / batchSize);

            // Process in batches
            for (let i = 0; i < sortedEvents.length; i += batchSize) {
                const batch = sortedEvents.slice(i, i + batchSize);
                const currentBatch = Math.floor(i / batchSize) + 1;

                // Report progress
                if (onProgress) {
                    onProgress({
                        total: sortedEvents.length,
                        completed: result.synced,
                        failed: result.failed,
                        percentage: Math.round(
                            (result.synced / sortedEvents.length) * 100,
                        ),
                        currentBatch,
                        totalBatches,
                    });
                }

                // Sync batch with retry logic
                await this.syncBatchWithRetry(
                    batch,
                    "event",
                    maxRetries,
                    retryDelay,
                    result,
                );
            }

            // Final progress report
            if (onProgress) {
                onProgress({
                    total: sortedEvents.length,
                    completed: result.synced,
                    failed: result.failed,
                    percentage: 100,
                    currentBatch: totalBatches,
                    totalBatches,
                });
            }

            result.success = result.failed === 0;
            return result;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Sync a batch of entities with retry logic and exponential backoff
     */
    private async syncBatchWithRetry<
        T extends FlattenedTrackedEntity | FlattenedEvent,
    >(
        batch: T[],
        type: "trackedEntity" | "event",
        maxRetries: number,
        baseDelay: number,
        result: SyncResult,
    ): Promise<void> {
        const promises = batch.map(async (entity) => {
            let retries = 0;
            let lastError: Error | null = null;

            while (retries < maxRetries) {
                try {
                    if (entity.syncStatus === "deleted") {
                        // Handle deletions
                        await dhis2SyncManager.deleteEntity(entity, type);
                    } else {
                        // Handle creates/updates
                        if (type === "trackedEntity") {
                            await dhis2SyncManager.syncTrackedEntity(
                                entity as FlattenedTrackedEntity,
                            );
                        } else {
                            await dhis2SyncManager.syncEvent(
                                entity as FlattenedEvent,
                            );
                        }
                    }

                    result.synced++;
                        ` Synced ${type}:`,
                        type === "trackedEntity"
                            ? (entity as FlattenedTrackedEntity).trackedEntity
                            : (entity as FlattenedEvent).event,
                    );
                    return; // Success, exit retry loop
                } catch (error) {
                    lastError = error as Error;
                    retries++;

                    if (retries < maxRetries) {
                        // Exponential backoff: 1s, 2s, 4s, 8s...
                        const delay = baseDelay * Math.pow(2, retries - 1);
                            `�  Retry ${retries}/${maxRetries} for ${type} after ${delay}ms`,
                        );
                        await new Promise((resolve) =>
                            setTimeout(resolve, delay),
                        );
                    }
                }
            }

            // All retries exhausted
            result.failed++;
            result.errors.push({
                id:
                    type === "trackedEntity"
                        ? (entity as FlattenedTrackedEntity).trackedEntity
                        : (entity as FlattenedEvent).event,
                error: lastError?.message || "Unknown error",
            });

            // Mark entity as failed
            setInternalUpdate(true);
            if (type === "trackedEntity") {
                trackedEntitiesCollection.utils.insertLocally({
                    ...(entity as FlattenedTrackedEntity),
                    syncStatus: "failed",
                    syncError: lastError?.message || "Unknown error",
                });
            } else {
                eventsCollection.utils.insertLocally({
                    ...(entity as FlattenedEvent),
                    syncStatus: "failed",
                    syncError: lastError?.message || "Unknown error",
                });
            }
            setInternalUpdate(false);

                `L Failed to sync ${type} after ${maxRetries} retries:`,
                lastError,
            );
        });

        // Wait for all entities in batch to complete
        await Promise.all(promises);
    }

    /**
     * Check if sync is currently in progress
     */
    get isSyncInProgress(): boolean {
        return this.isSyncing;
    }

    /**
     * Get queued entity IDs
     */
    getQueuedEntities(): string[] {
        return Array.from(this.syncQueue);
    }

    /**
     * Clear the sync queue
     */
    clearQueue(): void {
        this.syncQueue.clear();
    }
}

// Export singleton instance
export const batchSyncManager = new BatchSyncManager();
