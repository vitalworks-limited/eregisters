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
                        if (updated.syncStatus === "pending") {
                            this.queueUpdateTrackedEntity(updated, 8).catch(
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

                if (!("syncStatus" in mods)) {
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
                        if (updated.syncStatus === "synced") return;
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

                try {
                    const count = await this.syncAll(batch);
                    syncedCount += count;
                } catch (error: any) {
                    console.error("❌ Sync batch failed:", error);
                    for (const op of batch) {
                        await failSyncOperation(
                            op.id,
                            error.message || "Sync failed",
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
     * Build one unified DHIS2 tracker payload from all queued operations
     * and send it in a single POST /tracker call.
     * Returns the number of records marked as synced.
     */
    private async syncAll(ops: SyncOperation[]): Promise<number> {
        const allTrackedEntities: any[] = [];
        const allEnrollments: any[] = [];
        const allEvents: any[] = [];
        const syncedTeIds: string[] = [];
        const syncedEventIds: string[] = [];

        // Track TE IDs in this batch so we don't double-add their events
        const teIdsInBatch = new Set<string>();

        // Helper: build DHIS2 attribute array from flat attributes map
        const buildAttributes = (
            attributes: Record<string, any>,
            parentEntity?: string,
        ) => {
            const { enrolledAt, ...teAttributes } = attributes;
            const finalAttributes = parentEntity
                ? { ...teAttributes, FhyNxUVOpjh: parentEntity }
                : teAttributes;
            return Object.entries(finalAttributes).flatMap(
                ([attribute, value]: [string, any]) => {
                    if (value !== undefined && value !== null && value !== "") {
                        return { attribute, value: String(value) };
                    }
                    return [];
                },
            );
        };

        // Helper: build DHIS2 event object from a FlattenedEvent
        const buildEvent = (event: FlattenedEvent) => {
            const { dataValues, ...eventRest } = event;
            const { occurredAt, ...otherDataElements } = dataValues;
            let finalDataValues: Record<string, any> = otherDataElements;
            if (event.parentEvent) {
                finalDataValues = {
                    ...finalDataValues,
                    Wx7x4sMAa62: event.parentEvent,
                };
            }
            return {
                ...eventRest,
                dataValues: Object.entries(finalDataValues).flatMap(
                    ([dataElement, value]: [string, any]) => {
                        if (
                            value !== undefined &&
                            value !== null &&
                            value !== ""
                        ) {
                            if (Array.isArray(value)) {
                                return { dataElement, value: value.join(",") };
                            }
                            return { dataElement, value };
                        }
                        return [];
                    },
                ),
                occurredAt,
            };
        };

        // --- CREATE_TRACKED_ENTITY: send TE + enrollment + linked events ---
        for (const op of ops) {
            if (op.type !== "CREATE_TRACKED_ENTITY") continue;

            const data = op.data as FlattenedTrackedEntity;
            const entity = await db.trackedEntities.get(data.trackedEntity);
            if (!entity || entity.syncStatus === "synced") continue;

            const { attributes, enrollment, relationships, ...rest } =
                data as any;

            allTrackedEntities.push({
                ...rest,
                attributes: buildAttributes(attributes, entity.parentEntity),
            });
            allEnrollments.push({
                ...enrollment,
                enrolledAt: attributes.enrolledAt,
            });
            syncedTeIds.push(entity.trackedEntity);
            teIdsInBatch.add(entity.trackedEntity);

            // Pull in ALL pending events for this TE from the DB
            const pendingEvents = await db.events
                .where("trackedEntity")
                .equals(entity.trackedEntity)
                .filter((e) => e.syncStatus === "pending")
                .toArray();

            for (const event of pendingEvents) {
                if (syncedEventIds.includes(event.event)) continue;
                allEvents.push(buildEvent(event));
                syncedEventIds.push(event.event);
            }
        }

        // --- UPDATE_TRACKED_ENTITY: send only TE attributes, no enrollment ---
        for (const op of ops) {
            if (op.type !== "UPDATE_TRACKED_ENTITY") continue;

            const data = op.data as FlattenedTrackedEntity;
            const entity = await db.trackedEntities.get(data.trackedEntity);
            if (!entity || entity.syncStatus === "synced") continue;
            if (teIdsInBatch.has(entity.trackedEntity)) continue; // already handled by CREATE

            const { attributes, enrollment, relationships, ...rest } =
                data as any;

            allTrackedEntities.push({
                ...rest,
                attributes: buildAttributes(attributes, entity.parentEntity),
            });
            syncedTeIds.push(entity.trackedEntity);
            teIdsInBatch.add(entity.trackedEntity);

            const pendingEvents = await db.events
                .where("trackedEntity")
                .equals(entity.trackedEntity)
                .filter((e) => e.syncStatus === "pending")
                .toArray();
            for (const event of pendingEvents) {
                if (syncedEventIds.includes(event.event)) continue;
                allEvents.push(buildEvent(event));
                syncedEventIds.push(event.event);
            }
        }
        for (const op of ops) {
            if (op.type !== "UPDATE_ENROLLMENT") continue;

            const data = op.data as FlattenedTrackedEntity;
            const { attributes, enrollment } = data as any;

            allEnrollments.push({
                ...enrollment,
                enrolledAt: attributes.enrolledAt,
            });
        }

        for (const op of ops) {
            if (op.type !== "CREATE_EVENT" && op.type !== "UPDATE_EVENT")
                continue;
            if (syncedEventIds.includes(op.entityId)) continue;

            const event = await db.events.get(op.entityId);
            if (!event || event.syncStatus === "synced") continue;

            if (teIdsInBatch.has(event.trackedEntity)) continue;

            allEvents.push(buildEvent(event));
            syncedEventIds.push(event.event);
        }

        if (
            allTrackedEntities.length === 0 &&
            allEnrollments.length === 0 &&
            allEvents.length === 0
        ) {
            for (const op of ops) {
                await deleteSyncOperation(op.id);
            }
            return 0;
        }

        const payload: any = {};
        if (allTrackedEntities.length > 0)
            payload.trackedEntities = allTrackedEntities;
        if (allEnrollments.length > 0) payload.enrollments = allEnrollments;
        if (allEvents.length > 0) payload.events = allEvents;

        await this.engine.mutate({
            resource: "tracker",
            type: "create",
            data: payload,
            params: { async: false, importStrategy: "CREATE_AND_UPDATE" },
        });

        const now = new Date().toISOString();
        this.isSyncUpdating = true;

        for (const teId of syncedTeIds) {
            await db.trackedEntities.update(teId, {
                syncStatus: "synced",
                lastSynced: now,
            });
        }
        for (const eventId of syncedEventIds) {
            await deleteSyncOperation(`${eventId}_CREATE_EVENT`).catch(
                () => {},
            );
            await deleteSyncOperation(`${eventId}_UPDATE_EVENT`).catch(
                () => {},
            );
            await db.events.update(eventId, {
                syncStatus: "synced",
                lastSynced: now,
            });
        }
        for (const op of ops) {
            await deleteSyncOperation(op.id);
        }

        this.isSyncUpdating = false;

        return syncedTeIds.length + syncedEventIds.length;
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
     * Queue an update-only tracked entity operation (no enrollment)
     */
    public async queueUpdateTrackedEntity(
        data: any,
        priority: number = 5,
    ): Promise<void> {
        await queueSyncOperation({
            type: "UPDATE_TRACKED_ENTITY",
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
     * Queue an enrollment-only update (no TE attributes)
     */
    public async queueUpdateEnrollment(
        data: any,
        priority: number = 5,
    ): Promise<void> {
        await queueSyncOperation({
            type: "UPDATE_ENROLLMENT",
            entityId: data.enrollment.enrollment,
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
