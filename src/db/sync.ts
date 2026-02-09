import { useDataEngine } from "@dhis2/app-runtime";
import { db, type SyncOperation, type SyncState } from "./index";
import { createMetadataSync, type MetadataSync } from "./metadata-sync";
import {
    deleteOldDrafts,
    deleteSyncOperation,
    failSyncOperation,
    getNextSyncOperation,
    getSyncOperationsByStatus,
    getSyncQueueStats,
    queueSyncOperation,
    updateSyncOperation,
} from "./operations";
import {
    FlattenedEvent,
    FlattenedRelationship,
    FlattenedTrackedEntity,
} from "../schemas";

/**
 * Sync Manager for MOH Registers Application
 *
 * Handles synchronization between local IndexedDB and remote DHIS2 API.
 * Provides offline-first capabilities with automatic background sync.
 */

export type SyncStatus = "idle" | "syncing" | "online" | "offline";

export interface SyncManagerState {
    status: SyncStatus;
    pendingCount: number;
    lastSyncAt?: string;
    error?: string;
}

const SYNC_CONFIG = {
    batchSize: 10,
    retryLimit: 3,
    syncInterval: 5000, // 5 seconds
    pullInterval: 10000, // 10 seconds - interval for pulling data from server
    enablePull: true, // Enable pulling data from server
};

/**
 * SyncManager Class
 *
 * Manages the synchronization lifecycle between local database and DHIS2 API.
 */
export class SyncManager {
    private engine: ReturnType<typeof useDataEngine>;
    private isOnline: boolean = navigator.onLine;
    private isSyncing: boolean = false;
    private isPulling: boolean = false;
    private syncInterval?: NodeJS.Timeout;
    private cleanupInterval?: NodeJS.Timeout;
    private metadataCheckInterval?: NodeJS.Timeout;
    private metadataSync: MetadataSync;

    constructor(engine: ReturnType<typeof useDataEngine>) {
        this.engine = engine;
        this.metadataSync = createMetadataSync(engine);
        this.setupOnlineListener();
        this.setupDatabaseHooks();
        this.initializeSyncState();
    }

    /**
     * Initialize sync state in database if not exists
     */
    private async initializeSyncState(): Promise<void> {
        const existingState = await db.syncState.get("current");
        if (!existingState) {
            await db.syncState.put({
                id: "current",
                status: this.isOnline ? "online" : "offline",
                isOnline: this.isOnline,
                isSyncing: false,
                pendingCount: 0,
                updatedAt: new Date().toISOString(),
            });
        }
    }

    /**
     * Update sync state in database
     */
    private async updateSyncState(
        updates: Partial<Omit<SyncState, "id" | "updatedAt">>,
    ): Promise<void> {
        const currentState = await db.syncState.get("current");
        if (!currentState) {
            // Initialize if missing
            await this.initializeSyncState();
        }

        await db.syncState.update("current", {
            ...updates,
            updatedAt: new Date().toISOString(),
        });
    }

    private setupDatabaseHooks() {
        // Hook for creating tracked entities
        db.trackedEntities.hook("creating", (primKey, obj, transaction) => {
            // Initialize sync metadata if not present
            const entity = obj;
            if (!entity.syncStatus) {
                entity.syncStatus = "pending";
                entity.version = 1;
                entity.updatedAt = new Date().toISOString();
            }

            transaction.on("complete", () => {
                // Get the created entity to check its final status
                db.trackedEntities.get(primKey).then((created) => {
                    if (created && created.syncStatus === "pending") {
                        this.queueCreateTrackedEntity(created, 8).catch(
                            (error) => {
                                console.error(
                                    "❌ Failed to queue tracked entity sync:",
                                    error,
                                );
                            },
                        );
                    } else if (created && created.syncStatus === "draft") {
                        console.log(
                            "⏸️  Tracked entity is draft, skipping sync queue:",
                            primKey,
                        );
                    }
                });
            });
        });

        // Hook for updating tracked entities
        db.trackedEntities.hook(
            "updating",
            (modifications, primKey, obj, transaction) => {
                const entity = obj;
                const mods: Partial<FlattenedTrackedEntity> = modifications;
                if (
                    !("syncStatus" in mods) &&
                    entity.syncStatus !== "draft" &&
                    entity.syncStatus !== "synced"
                ) {
                    mods.syncStatus = "pending";
                }
                if (!("version" in mods) && !("lastSynced" in mods)) {
                    mods.version = (entity.version || 0) + 1;
                    mods.updatedAt = new Date().toISOString();
                }

                transaction.on("complete", () => {
                    db.trackedEntities.get(primKey).then((updated) => {
                        if (!updated) return;
                        if (updated.syncStatus === "synced") {
                            return;
                        }

                        if (updated.syncStatus === "pending") {
                            this.queueCreateTrackedEntity(updated, 8).catch(
                                (error) => {
                                    console.error(
                                        "❌ Failed to queue tracked entity update:",
                                        error,
                                    );
                                },
                            );
                        }
                    });
                });
            },
        );

        // Hook for deleting tracked entities
        db.trackedEntities.hook("deleting", (primKey, obj, transaction) => {});

        // ============================================================
        // EVENTS HOOKS
        // ============================================================

        // Hook for creating events
        db.events.hook("creating", (primKey, obj, transaction) => {
            const event = obj;
            if (!event.syncStatus) {
                event.syncStatus = "pending";
                event.version = 1;
                event.updatedAt = new Date().toISOString();
            }
            transaction.on("complete", () => {
                db.events.get(primKey).then((created) => {
                    console.log("🎣 Hook: Creating event", created);
                    if (created && created.syncStatus === "pending") {
                        this.queueCreateEvent(created, 7).catch((error) => {
                            console.error(
                                "❌ Failed to queue event sync:",
                                error,
                            );
                        });
                    } else if (created && created.syncStatus === "draft") {
                        console.log(
                            "⏸️  Event is draft, skipping sync queue:",
                            primKey,
                        );
                    }
                });
            });
        });

        db.events.hook(
            "updating",
            (modifications, primKey, obj, transaction) => {
                const event = obj;
                const mods: Partial<FlattenedEvent> = modifications;

                // Skip status update if this is a sync-initiated update
                if ("lastSynced" in mods) {
                    // This update is from sync process, don't change syncStatus or queue
                    return;
                }

                if (
                    !("syncStatus" in mods) &&
                    event.syncStatus !== "draft" &&
                    event.syncStatus !== "synced"
                ) {
                    mods.syncStatus = "pending";
                }
                if (!("version" in mods) && !("lastSynced" in mods)) {
                    mods.version = (event.version || 0) + 1;
                    mods.updatedAt = new Date().toISOString();
                }
                transaction.on("complete", () => {
                    db.events.get(primKey).then((updated) => {
                        if (!updated) return;
                        // Skip if already synced - no need to queue again
                        if (updated.syncStatus === "synced") {
                            return;
                        }
                        if (updated.syncStatus === "pending") {
                            this.queueCreateEvent(updated, 7).catch((error) => {
                                console.error(
                                    "❌ Failed to queue event update:",
                                    error,
                                );
                            });
                        }
                    });
                });
            },
        );

        db.events.hook("deleting", (primKey, obj, transaction) => {
            console.log("🎣 Hook: Deleting event", primKey);
        });

        // ============================================================
        // RELATIONSHIPS HOOKS
        // ============================================================

        // Hook for creating relationships
        db.relationships.hook("creating", (primKey, obj, transaction) => {
            console.log("🎣 Hook: Creating relationship", primKey);

            // Initialize sync metadata if not present
            const relationship = obj;
            if (!relationship.syncStatus) {
                relationship.syncStatus = "pending";
                relationship.version = 1;
                relationship.updatedAt = new Date().toISOString();
            }
            transaction.on("complete", () => {
                db.relationships.get(primKey).then((created) => {
                    if (created && created.syncStatus === "pending") {
                        this.queueCreateRelationship(created, 6).catch(
                            (error) => {
                                console.error(
                                    "❌ Failed to queue relationship sync:",
                                    error,
                                );
                            },
                        );
                    } else if (created && created.syncStatus === "draft") {
                        console.log(
                            "⏸️  Relationship is draft, skipping sync queue:",
                            primKey,
                        );
                    }
                });
            });
        });

        // Hook for updating relationships
        db.relationships.hook(
            "updating",
            (modifications, primKey, obj, transaction) => {
                const relationship = obj;
                const mods: Partial<FlattenedRelationship> = modifications;

                if (
                    !("syncStatus" in mods) &&
                    relationship.syncStatus !== "draft" &&
                    relationship.syncStatus !== "synced"
                ) {
                    mods.syncStatus = "pending";
                }

                if (!("version" in mods) && !("lastSynced" in mods)) {
                    mods.version = (relationship.version || 0) + 1;
                    mods.updatedAt = new Date().toISOString();
                }
                transaction.on("complete", () => {
                    db.relationships.get(primKey).then((updated) => {
                        if (!updated) return;

                        // Skip if already synced - no need to queue again
                        if (updated.syncStatus === "synced") {
                            return;
                        }

                        if (updated.syncStatus === "pending") {
                            this.queueCreateRelationship(updated, 6).catch(
                                (error) => {
                                    console.error(
                                        "❌ Failed to queue relationship update:",
                                        error,
                                    );
                                },
                            );
                        } else if (updated.syncStatus === "draft") {
                            console.log(
                                "⏸️  Relationship is draft, skipping sync queue:",
                                primKey,
                            );
                        }
                    });
                });
            },
        );
    }

    /**
     * Setup online/offline event listeners
     */
    private setupOnlineListener(): void {
        window.addEventListener("online", () => {
            console.log("📡 Network connection restored");
            this.isOnline = true;
            this.updateSyncState({
                status: "online",
                isOnline: true,
            });
            this.startSync();
        });

        window.addEventListener("offline", () => {
            console.log("📡 Network connection lost");
            this.isOnline = false;
            this.updateSyncState({
                status: "offline",
                isOnline: false,
            });
        });
    }

    /**
     * Get current sync manager state from database
     */
    public async getState(): Promise<SyncManagerState> {
        const state = await db.syncState.get("current");
        if (!state) {
            // Fallback if state not initialized
            const stats = await getSyncQueueStats();
            return {
                status: this.isSyncing
                    ? "syncing"
                    : this.isOnline
                      ? "online"
                      : "offline",
                pendingCount: stats.pending + stats.failed,
            };
        }

        return {
            status: state.status,
            pendingCount: state.pendingCount,
            lastSyncAt: state.lastSyncAt,
            error: state.lastError,
        };
    }

    /**
     * Start automatic background sync
     * ✅ OPTIMIZED: Default interval increased to 5 minutes (was 30 seconds)
     * Syncs every 5 minutes when online to reduce unnecessary sync checks
     * ✅ OPTIMIZED: Auto-cleanup of old drafts runs daily
     * ✅ NEW: Metadata staleness checks every 30 minutes
     */
    public startAutoSync(intervalMs: number = 300000): void {
        if (this.syncInterval) {
            console.warn("⚠️  Auto-sync already running");
            return;
        }
        this.syncInterval = setInterval(() => {
            if (this.isOnline && !this.isSyncing) {
                this.startSync().catch((error) => {
                    console.error("❌ Auto-sync error:", error);
                });
            }
        }, intervalMs);

        // Immediate first sync if online
        if (this.isOnline) {
            this.startSync().catch((error) => {
                console.error("❌ Initial sync error:", error);
            });
        }

        // ✅ OPTIMIZED: Run draft cleanup daily (24 hours)
        this.scheduleDraftCleanup();

        // ✅ NEW: Start metadata freshness checks every 30 minutes
        this.startMetadataChecks();
    }

    /**
     * Stop automatic background sync
     */
    public stopAutoSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = undefined;
            console.log("🛑 Auto-sync stopped");
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
            console.log("🛑 Draft cleanup stopped");
        }
        if (this.metadataCheckInterval) {
            clearInterval(this.metadataCheckInterval);
            this.metadataCheckInterval = undefined;
            console.log("🛑 Metadata checks stopped");
        }
    }
    private scheduleDraftCleanup(): void {
        // Run cleanup immediately on start
        deleteOldDrafts(30).catch((error) => {
            console.error("❌ Draft cleanup error:", error);
        });

        // Schedule daily cleanup (24 hours)
        this.cleanupInterval = setInterval(
            () => {
                deleteOldDrafts(30).catch((error) => {
                    console.error("❌ Draft cleanup error:", error);
                });
            },
            24 * 60 * 60 * 1000,
        ); // 24 hours

        console.log("🗑️  Scheduled daily draft cleanup (30+ days old)");
    }

    /**
     * Start metadata staleness checks (runs every 30 minutes)
     * ✅ NEW: Checks if metadata is stale and logs notification
     * Users can manually sync via the UI button if needed
     */
    private startMetadataChecks(): void {
        // Check immediately on start
        this.checkMetadataFreshness().catch((error) => {
            console.error("❌ Metadata check error:", error);
        });

        // Schedule checks every 30 minutes
        this.metadataCheckInterval = setInterval(
            () => {
                this.checkMetadataFreshness().catch((error) => {
                    console.error("❌ Metadata check error:", error);
                });
            },
            30 * 60 * 1000,
        ); // 30 minutes

        console.log(
            "📋 Scheduled metadata freshness checks (every 30 minutes)",
        );
    }

    /**
     * Check if metadata is stale and notify user
     * Does not automatically sync - user must trigger manual sync via UI
     */
    private async checkMetadataFreshness(): Promise<void> {
        try {
            const isStale = await this.metadataSync.isMetadataStale();
            if (isStale) {
                console.log(
                    "📋 Metadata is stale (>1 hour old). User can sync via UI button.",
                );
                // Optional: Could emit an event or notification here
                // For now, just log - user has manual sync button in UI
            } else {
                console.log("📋 Metadata is fresh");
            }
        } catch (error) {
            console.error("❌ Failed to check metadata freshness:", error);
        }
    }

    /**
     * Get the metadata sync manager instance
     * Allows components to access metadata sync functionality
     */
    public getMetadataSync(): MetadataSync {
        return this.metadataSync;
    }

    /**
     * Manually trigger a sync operation
     * ✅ OPTIMIZED: Batch operations for better network performance
     */
    public async startSync(): Promise<void> {
        if (!this.isOnline) {
            console.log("📵 Offline - sync skipped");
            return;
        }

        if (this.isSyncing) {
            console.log("🔄 Sync already in progress");
            return;
        }

        this.isSyncing = true;
        const syncStartTime = Date.now();

        // Get pending count before sync
        const stats = await getSyncQueueStats();
        await this.updateSyncState({
            status: "syncing",
            isSyncing: true,
            pendingCount: stats.pending + stats.failed,
        });

        try {
            console.log("🔄 Starting sync...");
            let syncedCount = 0;
            while (this.isOnline) {
                // Get batch of operations
                const batch = await this.getNextBatch(10);
                if (batch.length === 0) break;

                // Group by type for efficient batching
                const eventOps = batch.filter(
                    (op) =>
                        op.type === "CREATE_EVENT" ||
                        op.type === "UPDATE_EVENT",
                );
                const entityOps = batch.filter(
                    (op) =>
                        op.type === "CREATE_TRACKED_ENTITY" ||
                        op.type === "UPDATE_TRACKED_ENTITY",
                );
                const relationshipOps = batch.filter(
                    (op) => op.type === "CREATE_RELATIONSHIP",
                );

                try {
                    // Batch events together (most common operation)
                    if (eventOps.length > 0) {
                        await this.processBatchedEvents(eventOps);
                        for (const op of eventOps) {
                            // Clean up ALL pending operations for this event BEFORE updating status
                            // This prevents race condition where hook creates new operation
                            const allOps =
                                await getSyncOperationsByStatus("pending");
                            const orphanedOps = allOps.filter(
                                (o) => o.entityId === op.entityId,
                            );
                            for (const orphan of orphanedOps) {
                                await deleteSyncOperation(orphan.id);
                            }

                            await deleteSyncOperation(op.id);

                            // Update event syncStatus to "synced" AFTER cleanup
                            await db.events.update(op.entityId, {
                                syncStatus: "synced",
                                lastSynced: new Date().toISOString(),
                            });

                            syncedCount++;
                        }
                    }

                    if (relationshipOps.length > 0) {
                        await this.processBatchedRelationships(relationshipOps);
                        for (const op of relationshipOps) {
                            // Clean up ALL pending operations for this relationship BEFORE updating status
                            const allOps =
                                await getSyncOperationsByStatus("pending");
                            const orphanedOps = allOps.filter(
                                (o) => o.entityId === op.entityId,
                            );
                            for (const orphan of orphanedOps) {
                                await deleteSyncOperation(orphan.id);
                            }

                            await deleteSyncOperation(op.id);

                            // Update relationship syncStatus to "synced" AFTER cleanup
                            await db.relationships.update(op.entityId, {
                                syncStatus: "synced",
                                lastSynced: new Date().toISOString(),
                            });

                            syncedCount++;
                        }
                    }
                    // Process entities one by one (less common, more critical)
                    for (const op of entityOps) {
                        try {
                            await this.processSyncOperation(op);

                            // Clean up ALL pending operations for this tracked entity BEFORE updating status
                            const allOps =
                                await getSyncOperationsByStatus("pending");
                            const orphanedOps = allOps.filter(
                                (o) => o.entityId === op.entityId,
                            );
                            for (const orphan of orphanedOps) {
                                await deleteSyncOperation(orphan.id);
                            }

                            await deleteSyncOperation(op.id);

                            // Update tracked entity syncStatus to "synced" AFTER cleanup
                            await db.trackedEntities.update(op.entityId, {
                                syncStatus: "synced",
                                lastSynced: new Date().toISOString(),
                            });

                            syncedCount++;
                        } catch (error: any) {
                            console.error("❌ Sync operation failed:", error);
                            await failSyncOperation(
                                op.id,
                                error.message || "Unknown error",
                            );

                            if (op.attempts >= 3) {
                                console.error(
                                    "🚫 Max retry attempts reached for operation:",
                                    op.id,
                                );
                            }
                        }
                    }
                } catch (error: any) {
                    console.error("❌ Batch sync failed:", error);
                    for (const op of eventOps) {
                        await failSyncOperation(
                            op.id,
                            error.message || "Batch sync failed",
                        );
                    }
                }
            }
            if (syncedCount > 0) {
                console.log(`✅ Sync completed: ${syncedCount} operations`);
            }

            // Record successful sync
            const syncDuration = Date.now() - syncStartTime;
            const finalStats = await getSyncQueueStats();
            await this.updateSyncState({
                status: this.isOnline ? "online" : "offline",
                isSyncing: false,
                lastSyncAt: new Date().toISOString(),
                lastSyncDuration: syncDuration,
                lastSyncCount: syncedCount,
                pendingCount: finalStats.pending + finalStats.failed,
                lastError: undefined, // Clear any previous errors
            });
        } catch (error) {
            console.error("❌ Sync error:", error);
            const finalStats = await getSyncQueueStats();
            await this.updateSyncState({
                status: this.isOnline ? "online" : "offline",
                isSyncing: false,
                lastError:
                    error instanceof Error ? error.message : String(error),
                pendingCount: finalStats.pending + finalStats.failed,
            });
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Get next batch of sync operations
     * ✅ OPTIMIZED: Fetch multiple operations at once
     */
    private async getNextBatch(size: number): Promise<SyncOperation[]> {
        const operations: SyncOperation[] = [];

        for (let i = 0; i < size; i++) {
            const op = await getNextSyncOperation();
            if (!op) break;

            // Log retry attempts
            if (op.status === "failed") {
                console.log(
                    `🔄 Retrying failed operation (attempt ${op.attempts + 1}/3): ${op.type} - ${op.entityId}`,
                );
            }
            // Mark as syncing
            await updateSyncOperation(op.id, {
                status: "syncing",
                attempts: op.attempts + 1,
            });

            operations.push(op);
        }

        return operations;
    }

    /**
     * Process batched events in single API call
     * ✅ OPTIMIZED: Send up to 10 events in one request
     */
    private async processBatchedEvents(
        operations: SyncOperation[],
    ): Promise<void> {
        const opsToSync: SyncOperation[] = [];

        for (const op of operations) {
            const event = await db.events.get(op.entityId);
            if (event?.syncStatus === "synced") {
                await deleteSyncOperation(op.id);
                continue;
            }

            opsToSync.push(op);
        }

        if (opsToSync.length === 0) return;
        const events = opsToSync.map((op) => {
            return op.data as FlattenedEvent;
        });
        const allEvents = events.map(({ dataValues, ...event }) => {
            const { occurredAt, ...othersDataElements } = dataValues;
            return {
                ...event,
                dataValues: Object.entries(othersDataElements).flatMap(
                    ([dataElement, value]: [string, any]) => {
                        if (
                            value !== undefined &&
                            value !== null &&
                            value !== ""
                        ) {
                            if (Array.isArray(value)) {
                                return {
                                    dataElement,
                                    value: value.join(","),
                                };
                            }
                            return {
                                dataElement,
                                value,
                            };
                        }
                        return [];
                    },
                ),
                occurredAt,
            };
        });

        await this.engine.mutate({
            resource: "tracker",
            type: "create",
            data: { events: allEvents },
            params: { async: false, importStrategy: "CREATE_AND_UPDATE" },
        });
    }

    private async processBatchedRelationships(
        operations: SyncOperation[],
    ): Promise<void> {
        const opsToSync: SyncOperation[] = [];

        for (const op of operations) {
            const relationship = await db.relationships.get(op.entityId);
            if (relationship?.syncStatus === "synced") {
                await deleteSyncOperation(op.id);
                continue;
            }

            opsToSync.push(op);
        }

        if (opsToSync.length === 0) return;
        const relationships = opsToSync.map((op) => {
            const { from, to, lastSynced, toId, fromId } =
                op.data as FlattenedRelationship;
        });
        await this.engine.mutate({
            resource: "tracker",
            type: "create",
            data: { relationships },
            params: { async: false, importStrategy: "CREATE_AND_UPDATE" },
        });
    }

    /**
     * Process a single sync operation
     */
    private async processSyncOperation(
        operation: SyncOperation,
    ): Promise<void> {
        console.log(`🔄 Processing: ${operation.type} - ${operation.entityId}`);
        try {
            switch (operation.type) {
                case "CREATE_TRACKED_ENTITY":
                    await this.syncCreateTrackedEntity(operation.data);
                    break;

                case "UPDATE_TRACKED_ENTITY":
                    await this.syncUpdateTrackedEntity(operation.data);
                    break;

                case "CREATE_EVENT":
                    await this.syncCreateEvent(operation.data);
                    break;

                case "UPDATE_EVENT":
                    await this.syncUpdateEvent(operation.data);
                    break;
                case "CREATE_RELATIONSHIP":
                    await this.syncCreateRelationship(operation.data);
                    break;

                default:
                    throw new Error(
                        `Unknown operation type: ${operation.type}`,
                    );
            }
        } catch (error) {
            console.error(
                `❌ Failed: ${operation.type} - ${operation.entityId}`,
                error,
            );
            throw error;
        }
    }

    /**
     * Sync create tracked entity to DHIS2 API
     */
    private async syncCreateTrackedEntity(data: any): Promise<void> {
        const entity = await db.trackedEntities.get(data.trackedEntity);
        if (entity?.syncStatus === "synced") return;

        const { attributes, enrollment, events, relationships, ...rest } = data;
        const { enrolledAt, TRACKER_ID, ENROLLED_AT, ...othersAttributes } =
            attributes;
        const allAttributes = Object.entries(othersAttributes).flatMap(
            ([attribute, value]: [string, any]) => {
                if (attribute === "TRACKER_ID" || attribute === "ENROLLED_AT") {
                    return [];
                }
                if (value !== undefined && value !== null && value !== "") {
                    return { attribute, value: String(value) };
                }
                return [];
            },
        );
        const trackedEntities = [
            {
                ...rest,
                attributes: allAttributes,
            },
        ];

        const enrollments = [
            {
                ...enrollment,
                enrolledAt,
            },
        ];

        const payload: any = { trackedEntities, enrollments };

        if (relationships && relationships.length > 0) {
            payload.relationships = relationships;
        }

        await this.engine.mutate({
            resource: "tracker",
            type: "create",
            data: payload,
            params: { async: false, importStrategy: "CREATE_AND_UPDATE" },
        });
    }
    private async syncCreateRelationship(relationships: any): Promise<void> {
        await this.engine.mutate({
            resource: "tracker",
            type: "create",
            data: { relationships },
            params: { async: false, importStrategy: "CREATE_AND_UPDATE" },
        });
    }

    /**
     * Sync update tracked entity to DHIS2 API
     */
    private async syncUpdateTrackedEntity(data: any): Promise<void> {
        const entity = await db.trackedEntities.get(data.trackedEntity);
        if (entity?.syncStatus === "synced") return;
        const { attributes, enrollment, events, relationships, ...rest } = data;
        const { enrolledAt, TRACKER_ID, ENROLLED_AT, ...othersAttributes } =
            attributes;
        const allAttributes = Object.entries(othersAttributes).flatMap(
            ([attribute, value]: [string, any]) => {
                if (attribute === "TRACKER_ID" || attribute === "ENROLLED_AT") {
                    return [];
                }
                if (value !== undefined && value !== null && value !== "") {
                    return { attribute, value: String(value) };
                }
                return [];
            },
        );
        const trackedEntities = [
            {
                ...rest,
                attributes: allAttributes,
            },
        ];
        const enrollments = [
            {
                ...enrollment,
                // Don't include attributes - tracked entity attributes belong to the TE, not enrollment
            },
        ];
        await this.engine.mutate({
            resource: "tracker",
            type: "create",
            data: { trackedEntities, enrollments },
            params: { async: false, importStrategy: "CREATE_AND_UPDATE" },
        });
    }

    /**
     * Sync create/update events to DHIS2 API
     */
    private async syncCreateEvent(data: any): Promise<void> {
        const { dataValues, relationships, ...event } = data;
        const { occurredAt, ...othersDataElements } = dataValues;

        const allEvents = [
            {
                ...event,
                dataValues: Object.entries(othersDataElements).flatMap(
                    ([dataElement, value]: [string, any]) => {
                        if (
                            value !== undefined &&
                            value !== null &&
                            value !== ""
                        ) {
                            if (Array.isArray(value)) {
                                return {
                                    dataElement,
                                    value: value.join(","),
                                };
                            }
                            return {
                                dataElement,
                                value,
                            };
                        }
                        return [];
                    },
                ),
                occurredAt,
            },
        ];

        await this.engine.mutate({
            resource: "tracker",
            type: "create",
            data: { events: allEvents },
            params: { async: false, importStrategy: "CREATE_AND_UPDATE" },
        });
    }

    /**
     * Sync update event to DHIS2 API
     */
    private async syncUpdateEvent(data: any): Promise<void> {
        await this.syncCreateEvent(data);
    }

    /**
     * Check if operation already exists in queue
     * ✅ OPTIMIZED: Prevent duplicate queue entries
     */
    private async operationExists(
        entityId: string,
        type: string,
    ): Promise<boolean> {
        // Check pending and syncing operations for this entity
        const pending = await getSyncOperationsByStatus("pending");
        const syncing = await getSyncOperationsByStatus("syncing");

        const allOps = [...pending, ...syncing];
        return allOps.some(
            (op) => op.entityId === entityId && op.type === type,
        );
    }

    /**
     * Queue a create tracked entity operation
     * ✅ OPTIMIZED: Check for duplicates before queueing
     */
    public async queueCreateTrackedEntity(
        data: any,
        priority: number = 5,
    ): Promise<void> {
        const exists = await this.operationExists(
            data.trackedEntity,
            "CREATE_TRACKED_ENTITY",
        );

        if (exists) {
            console.log(
                `⏭️  Skipping duplicate: CREATE_TRACKED_ENTITY - ${data.trackedEntity}`,
            );
            return;
        }

        await queueSyncOperation({
            type: "CREATE_TRACKED_ENTITY",
            entityId: data.trackedEntity,
            data,
            priority,
        });

        // Update pending count
        const stats = await getSyncQueueStats();
        await this.updateSyncState({
            pendingCount: stats.pending + stats.failed,
        });

        if (this.isOnline && !this.isSyncing) {
            this.startSync();
        }
    }

    /**
     * Queue a create/update event operation
     * ✅ OPTIMIZED: Check for duplicates before queueing
     */
    public async queueCreateEvent(
        data: any,
        priority: number = 5,
    ): Promise<void> {
        // Check if event is already synced
        const event = await db.events.get(data.event);
        if (event?.syncStatus === "synced") {
            console.log(
                `⏭️  Skipping already synced: CREATE_EVENT - ${data.event}`,
            );
            return;
        }

        // Check if already queued
        const exists = await this.operationExists(data.event, "CREATE_EVENT");

        if (exists) {
            console.log(`⏭️  Skipping duplicate: CREATE_EVENT - ${data.event}`);
            return;
        }

        await queueSyncOperation({
            type: "CREATE_EVENT",
            entityId: data.event,
            data,
            priority,
        });

        // Update pending count
        const stats = await getSyncQueueStats();
        await this.updateSyncState({
            pendingCount: stats.pending + stats.failed,
        });

        // Trigger immediate sync if online
        if (this.isOnline && !this.isSyncing) {
            this.startSync();
        }
    }

    public async queueCreateRelationship(
        data: any,
        priority: number = 5,
    ): Promise<void> {
        // Check if already queued
        const exists = await this.operationExists(
            data.relationship,
            "CREATE_RELATIONSHIP",
        );

        if (exists) {
            console.log(
                `⏭️  Skipping duplicate: CREATE_RELATIONSHIP - ${data.relationship}`,
            );
            return;
        }

        await queueSyncOperation({
            type: "CREATE_RELATIONSHIP",
            entityId: data.relationship,
            data,
            priority,
        });

        // Update pending count
        const stats = await getSyncQueueStats();
        await this.updateSyncState({
            pendingCount: stats.pending + stats.failed,
        });

        // Trigger immediate sync if online
        if (this.isOnline && !this.isSyncing) {
            this.startSync();
        }
    }

    /**
     * Check if online
     */
    public getOnlineStatus(): boolean {
        return this.isOnline;
    }

    // Pull data from server
    private async pullFromServer() {
        if (this.isPulling || !this.isOnline) {
            return;
        }
        this.isPulling = true;

        this.isPulling = false;
    }

    // Start periodic pull from server
    private startPeriodicPull() {
        // Initial pull
        if (this.isOnline) {
            this.pullFromServer();
        }

        // // Set up periodic pull
        // this.pullTimer = setInterval(() => {
        //     if (this.isOnline && !this.isPulling) {
        //         this.pullFromServer();
        //     }
        // }, SYNC_CONFIG.pullInterval);
    }

    // Manually trigger pull
    public async pullNow() {
        if (this.isOnline) {
            await this.pullFromServer();
        } else {
            throw new Error("Cannot pull while offline");
        }
    }
}

/**
 * Create a sync manager instance
 */
export function createSyncManager(
    engine: ReturnType<typeof useDataEngine>,
): SyncManager {
    return new SyncManager(engine);
}
