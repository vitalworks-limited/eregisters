import { useDataEngine } from "@dhis2/app-runtime";
import { db, type SyncOperation, type SyncState } from "./index";
import { createMetadataSync, type MetadataSync } from "./metadata-sync";
import {
    deleteSyncOperation,
    failSyncOperation,
    getNextSyncOperation,
    getSyncQueueStats,
    queueSyncOperation,
    updateSyncOperation,
} from "./operations";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";

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
    syncInterval: 5000,
    pullInterval: 10000,
    enablePull: true,
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
    private isSyncUpdating: boolean = false;
    private syncInterval?: NodeJS.Timeout;
    private pullTimer?: NodeJS.Timeout;
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
            await this.initializeSyncState();
        }

        await db.syncState.update("current", {
            ...updates,
            updatedAt: new Date().toISOString(),
        });
    }

    private setupDatabaseHooks() {
        db.trackedEntities.hook("creating", (primKey, obj, transaction) => {
            const entity = obj;
            if (!entity.syncStatus) {
                entity.syncStatus = "pending";
                entity.version = 1;
                entity.updatedAt = new Date().toISOString();
            }

            transaction.on("complete", () => {
                if (this.isSyncUpdating) return;

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
                    if (this.isSyncUpdating) return;

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

        db.trackedEntities.hook("deleting", (primKey, obj, transaction) => {});

        // ============================================================
        // EVENTS HOOKS
        // ============================================================
        db.events.hook("creating", (primKey, obj, transaction) => {
            const event = obj;
            if (!event.syncStatus) {
                event.syncStatus = "pending";
                event.version = 1;
                event.updatedAt = new Date().toISOString();
            }
            transaction.on("complete", () => {
                if (this.isSyncUpdating) return;

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

                if ("lastSynced" in mods) {
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
                    if (this.isSyncUpdating) return;

                    db.events.get(primKey).then((updated) => {
                        if (!updated) return;
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
            return;
        }
        this.syncInterval = setInterval(() => {
            if (this.isOnline && !this.isSyncing) {
                this.startSync().catch((error) => {
                    console.error("❌ Auto-sync error:", error);
                });
            }
        }, intervalMs);

        if (this.isOnline) {
            this.startSync().catch((error) => {
                console.error("❌ Initial sync error:", error);
            });
        }
        this.startMetadataChecks();
    }

    /**
     * Stop automatic background sync
     */
    public stopAutoSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = undefined;
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        if (this.metadataCheckInterval) {
            clearInterval(this.metadataCheckInterval);
            this.metadataCheckInterval = undefined;
        }

        if (this.pullTimer) {
            clearInterval(this.pullTimer);
            this.pullTimer = undefined;
        }
    }

    /**
     * Start metadata staleness checks (runs every 30 minutes)
     * ✅ NEW: Checks if metadata is stale and logs notification
     * Users can manually sync via the UI button if needed
     */
    private startMetadataChecks(): void {
        this.checkMetadataFreshness().catch((error) => {
            console.error("❌ Metadata check error:", error);
        });

        this.metadataCheckInterval = setInterval(
            () => {
                this.checkMetadataFreshness().catch((error) => {
                    console.error("❌ Metadata check error:", error);
                });
            },
            30 * 60 * 1000,
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
            return;
        }

        if (this.isSyncing) {
            return;
        }
        this.isSyncing = true;
        const syncStartTime = Date.now();
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
                const batch = await this.getNextBatch(10);
                if (batch.length === 0) break;

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
                try {
                    if (eventOps.length > 0) {
                        await this.processBatchedEvents(eventOps);
                        for (const op of eventOps) {
                            await deleteSyncOperation(op.id);
                            this.isSyncUpdating = true;
                            await db.events.update(op.entityId, {
                                syncStatus: "synced",
                                lastSynced: new Date().toISOString(),
                            });
                            this.isSyncUpdating = false;
                            syncedCount++;
                        }
                    }

                    for (const op of entityOps) {
                        try {
                            await this.processSyncOperation(op);

                            await deleteSyncOperation(op.id);
                            this.isSyncUpdating = true;
                            await db.trackedEntities.update(op.entityId, {
                                syncStatus: "synced",
                                lastSynced: new Date().toISOString(),
                            });
                            this.isSyncUpdating = false;

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

            const syncDuration = Date.now() - syncStartTime;
            const finalStats = await getSyncQueueStats();
            await this.updateSyncState({
                status: this.isOnline ? "online" : "offline",
                isSyncing: false,
                lastSyncAt: new Date().toISOString(),
                lastSyncDuration: syncDuration,
                lastSyncCount: syncedCount,
                pendingCount: finalStats.pending + finalStats.failed,
                lastError: undefined,
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

            if (op.status === "failed") {
                console.log(
                    `🔄 Retrying failed operation (attempt ${op.attempts + 1}/3): ${op.type} - ${op.entityId}`,
                );
            }
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
            let finalDataValues = othersDataElements;
            if (event.parentEvent) {
                finalDataValues = {
                    ...finalDataValues,
                    Wx7x4sMAa62: event.parentEvent,
                };
            }
            return {
                ...event,
                dataValues: Object.entries(finalDataValues).flatMap(
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
    private async syncCreateTrackedEntity(data: any) {
        const entity = await db.trackedEntities.get(data.trackedEntity);

        if (entity?.syncStatus === "synced") return;
        const { attributes, enrollment, events, relationships, ...rest } = data;
        const { enrolledAt, ...othersAttributes } = attributes;

        let finalAttributes = othersAttributes;
        if (entity && entity.parentEntity) {
            finalAttributes = {
                ...finalAttributes,
                FhyNxUVOpjh: entity.parentEntity,
            };
        }
        const allAttributes = Object.entries(finalAttributes).flatMap(
            ([attribute, value]: [string, any]) => {
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

    /**
     * Sync update tracked entity to DHIS2 API
     */
    private async syncUpdateTrackedEntity(data: any) {
        const entity = await db.trackedEntities.get(data.trackedEntity);
        if (entity?.syncStatus === "synced") return;
        const { attributes, enrollment, events, relationships, ...rest } = data;
        const { enrolledAt, ...othersAttributes } = attributes;

        let finalAttributes = othersAttributes;
        if (entity && entity.parentEntity) {
            finalAttributes = {
                ...finalAttributes,
                FhyNxUVOpjh: entity.parentEntity,
            };
        }
        const allAttributes = Object.entries(finalAttributes).flatMap(
            ([attribute, value]: [string, any]) => {
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
        const enrollments = [enrollment];
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
    private async syncCreateEvent(data: any) {
        const { dataValues, relationships, ...event } = data;
        const { occurredAt, ...othersDataElements } = dataValues;

        let finalDataValues = othersDataElements;
        if (event.parentEvent) {
            finalDataValues = {
                ...finalDataValues,
                Wx7x4sMAa62: event.parentEvent,
            };
        }
        const allEvents = [
            {
                ...event,
                dataValues: Object.entries(finalDataValues).flatMap(
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
    private async syncUpdateEvent(data: any) {
        await this.syncCreateEvent(data);
    }

    /**
     * Queue a create tracked entity operation
     * Uses composite ID for automatic deduplication at database level
     */
    public async queueCreateTrackedEntity(
        data: any,
        priority: number = 5,
    ): Promise<void> {

        await queueSyncOperation({
            type: "CREATE_TRACKED_ENTITY",
            entityId: data.trackedEntity,
            data,
            priority,
        });

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
        const event = await db.events.get(data.event);
        if (event?.syncStatus === "synced") {
            console.log(
                `⏭️  Skipping already synced: CREATE_EVENT - ${data.event}`,
            );
            return;
        }

        await queueSyncOperation({
            type: "CREATE_EVENT",
            entityId: data.event,
            data,
            priority,
        });

        const stats = await getSyncQueueStats();
        await this.updateSyncState({
            pendingCount: stats.pending + stats.failed,
        });

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

    private async pullFromServer() {
        if (this.isPulling || !this.isOnline) {
            return;
        }
        this.isPulling = true;

        this.isPulling = false;
    }

    private startPeriodicPull() {
        // Initial pull
        if (this.isOnline) {
            this.pullFromServer();
        }

        this.pullTimer = setInterval(() => {
            if (this.isOnline && !this.isPulling) {
                this.pullFromServer();
            }
        }, SYNC_CONFIG.pullInterval);
    }

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
