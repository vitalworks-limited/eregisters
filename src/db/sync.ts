import { useDataEngine } from "@dhis2/app-runtime";
import { db, type SyncOperation, type SyncState } from "./index";
import { createMetadataSync, type MetadataSync } from "./metadata-sync";
import {
    deleteSyncOperation,
    failSyncOperation,
    getSyncQueueStats,
    queueSyncOperation,
    updateSyncOperation,
} from "./operations";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
    TrackedEntity,
} from "../schemas";
import {
    flattenEnrollment,
    flattenEvent,
    flattenTrackedEntity,
} from "../utils/utils";

export interface PullOptions {
    fromStart?: boolean;
    orgUnit?: string;
}

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
    private scheduledSyncTimer?: NodeJS.Timeout;
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
    private async initializeSyncState() {
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
    ) {
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
                        this.queueTrackedEntity(created, 8).catch((error) => {
                            console.error(
                                "❌ Failed to queue tracked entity sync:",
                                error,
                            );
                        });
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
                            this.queueTrackedEntity(updated, 8).catch(
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

        db.enrollments.hook("creating", (primKey, obj, transaction) => {
            const entity = obj;
            if (!entity.syncStatus) {
                entity.syncStatus = "pending";
                entity.version = 1;
                entity.updatedAt = new Date().toISOString();
            }

            transaction.on("complete", () => {
                if (this.isSyncUpdating) return;
                db.enrollments.get(primKey).then((created) => {
                    if (created && created.syncStatus === "pending") {
                        this.queueEnrollment(created, 8).catch((error) => {
                            console.error(
                                "❌ Failed to queue tracked entity sync:",
                                error,
                            );
                        });
                    }
                });
            });
        });

        db.enrollments.hook(
            "updating",
            (modifications, primKey, obj, transaction) => {
                const enrollment = obj;
                const mods: Partial<FlattenedEnrollment> = modifications;
                if (
                    !("syncStatus" in mods) &&
                    enrollment.syncStatus !== "draft" &&
                    enrollment.syncStatus !== "synced"
                ) {
                    mods.syncStatus = "pending";
                }
                if (!("version" in mods) && !("lastSynced" in mods)) {
                    mods.version = (enrollment.version || 0) + 1;
                    mods.updatedAt = new Date().toISOString();
                }

                transaction.on("complete", () => {
                    if (this.isSyncUpdating) return;

                    db.enrollments.get(primKey).then((updated) => {
                        if (!updated) return;
                        if (updated.syncStatus === "pending") {
                            this.queueEnrollment(updated, 8).catch((error) => {
                                console.error(
                                    "❌ Failed to queue tracked entity update:",
                                    error,
                                );
                            });
                        }
                    });
                });
            },
        );

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
                    if (created && created.syncStatus === "pending") {
                        this.queueEvent(created, 7).catch((error) => {
                            console.error(
                                "❌ Failed to queue event sync:",
                                error,
                            );
                        });
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
                            this.queueEvent(updated, 7).catch((error) => {
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
            this.isOnline = true;
            this.updateSyncState({
                status: "online",
                isOnline: true,
            });
            this.startSync();
        });

        window.addEventListener("offline", () => {
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
        this.startPeriodicPull();
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
     * Check if metadata is stale and automatically sync changed types
     */
    private async checkMetadataFreshness() {
        try {
            const isStale = await this.metadataSync.isMetadataStale();
            if (isStale) {
                console.log("📋 Metadata is stale — syncing changed types...");
                await this.metadataSync.syncChangedMetadata();
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
    private scheduleSync() {
        if (this.scheduledSyncTimer) clearTimeout(this.scheduledSyncTimer);
        this.scheduledSyncTimer = setTimeout(() => {
            if (this.isOnline && !this.isSyncing) {
                this.startSync();
            }
        }, 50);
    }

    public async startSync() {
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
    private async getNextBatch(size: number): Promise<SyncOperation[]> {
        const pendingOps = await db.syncQueue
            .where("status")
            .equals("pending")
            .limit(size)
            .toArray();

        const now = new Date();
        const failedOps = await db.syncQueue
            .where("status")
            .equals("failed")
            .toArray();
        const retryableFailedOps = failedOps.filter((op) => {
            if (op.attempts >= 3) return false;
            const backoffDelay = Math.pow(3, op.attempts) * 5000;
            const timeSinceLastAttempt =
                now.getTime() - new Date(op.updatedAt).getTime();
            return timeSinceLastAttempt >= backoffDelay;
        });

        const ops = [...pendingOps, ...retryableFailedOps].slice(0, size);

        for (const op of ops) {
            await updateSyncOperation(op.id, {
                status: "syncing",
                attempts: op.attempts + 1,
            });
        }

        return ops;
    }

    private async syncAll(ops: SyncOperation[]): Promise<number> {
        const allTrackedEntities: any[] = [];
        const allEnrollments: any[] = [];
        const allEvents: any[] = [];
        const syncedTeIds: string[] = [];
        const syncedEventIds: string[] = [];
        const syncedEnrollmentIds: string[] = [];
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

        for (const op of ops) {
            if (op.type === "CREATE_OR_UPDATE_TRACKED_ENTITY") {
                const data = op.data as FlattenedTrackedEntity;
                const entity = await db.trackedEntities.get(data.trackedEntity);
                if (!entity || entity.syncStatus === "synced") continue;
                const { attributes, ...rest } = data;
                allTrackedEntities.push({
                    ...rest,
                    attributes: buildAttributes(
                        attributes,
                        entity.parentEntity,
                    ),
                });
                syncedTeIds.push(data.trackedEntity);
            }
            if (op.type === "CREATE_UPDATE_EVENT") {
                const data = op.data as FlattenedEvent;
                const event = await db.events.get(data.event);
                if (!event || event.syncStatus === "synced") continue;
                allEvents.push(buildEvent(event));
                syncedEventIds.push(data.event);
            }
            if (op.type === "CREATE_ENROLLMENT") {
                const data = op.data as FlattenedEnrollment;
                const enrollment = await db.enrollments.get(data.enrollment);
                if (!enrollment || enrollment.syncStatus === "synced") continue;
                const { attributes, ...rest } = data;
                allEnrollments.push({
                    ...rest,
                    attributes: buildAttributes(attributes),
                });
                syncedEnrollmentIds.push(data.enrollment);
            }
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
            await deleteSyncOperation(teId).catch(() => {});
            await db.trackedEntities.update(teId, {
                syncStatus: "synced",
                lastSynced: now,
            });
        }
        for (const eventId of syncedEventIds) {
            await deleteSyncOperation(eventId).catch(() => {});
            await db.events.update(eventId, {
                syncStatus: "synced",
                lastSynced: now,
            });
        }
        for (const enrollmentId of syncedEnrollmentIds) {
            await deleteSyncOperation(enrollmentId).catch(() => {});
            await db.enrollments.update(enrollmentId, {
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
    public async queueTrackedEntity(data: any, priority: number = 5) {
        await queueSyncOperation({
            type: "CREATE_OR_UPDATE_TRACKED_ENTITY",
            entityId: data.trackedEntity,
            data,
            priority,
        });

        const stats = await getSyncQueueStats();
        await this.updateSyncState({
            pendingCount: stats.pending + stats.failed,
        });

        this.scheduleSync();
    }

    public async queueEnrollment(data: any, priority: number = 5) {
        await queueSyncOperation({
            type: "CREATE_ENROLLMENT",
            entityId: data.enrollment.enrollment,
            data,
            priority,
        });

        const stats = await getSyncQueueStats();
        await this.updateSyncState({
            pendingCount: stats.pending + stats.failed,
        });

        this.scheduleSync();
    }

    public async queueEvent(data: any, priority: number = 5) {
        const event = await db.events.get(data.event);
        if (event?.syncStatus === "synced") {
            return;
        }

        await queueSyncOperation({
            type: "CREATE_UPDATE_EVENT",
            entityId: data.event,
            data,
            priority,
        });

        const stats = await getSyncQueueStats();
        await this.updateSyncState({
            pendingCount: stats.pending + stats.failed,
        });

        this.scheduleSync();
    }

    /**
     * Check if online
     */
    public getOnlineStatus(): boolean {
        return this.isOnline;
    }

    private async pullFromServer(options: PullOptions = {}) {
        if (this.isPulling || !this.isOnline) {
            return;
        }
        this.isPulling = true;

        try {
            const syncState = await db.syncState.get("current");
            let orgUnitIds: string[] = [];
            if (options.orgUnit) {
                orgUnitIds = [options.orgUnit];
            } else {
                const allOrgUnits = await db.organisationUnits.toArray();
                const seen = new Set<string>();
                for (const ou of allOrgUnits) {
                    if (!seen.has(ou.id)) {
                        seen.add(ou.id);
                        orgUnitIds.push(ou.id);
                    }
                }
            }
            if (orgUnitIds.length === 0) return;
            const programs = await db.programs.toArray();
            const program = programs[0];
            if (!program) return;
            const now = new Date().toISOString();
            const pullVersions = syncState?.pullVersions ?? {};
            for (const orgUnitId of orgUnitIds) {
                const lastPullAt = options.fromStart
                    ? undefined
                    : pullVersions[orgUnitId];

                const params: Record<string, any> = {
                    program: program.id,
                    orgUnit: orgUnitId,
                    ouMode: "SELECTED",
                    fields: "*,enrollments[*,events[*]]",
                    paging: false,
                };

                if (lastPullAt) {
                    params.updatedAfter = lastPullAt;
                }
                const response = (await this.engine.query({
                    trackedEntities: {
                        resource: "tracker/trackedEntities",
                        params,
                    },
                })) as {
                    trackedEntities: { trackedEntities: TrackedEntity[] };
                };
                const instances = response.trackedEntities.trackedEntities;
                if (instances.length > 0) {
                    this.isSyncUpdating = true;
                    for (const raw of instances) {
                        const flattened = flattenTrackedEntity(raw);
                        await db.trackedEntities.put({
                            ...flattened,
                            syncStatus: "synced",
                            lastSynced: now,
                        });

                        for (const rawEnrollment of raw.enrollments ?? []) {
                            await db.enrollments.put(
                                flattenEnrollment(rawEnrollment),
                            );
                            for (const rawEvent of rawEnrollment.events ?? []) {
                                await db.events.put(flattenEvent(rawEvent));
                            }
                        }
                    }
                    this.isSyncUpdating = false;
                }
                pullVersions[orgUnitId] = now;
            }

            await this.updateSyncState({
                lastPullAt: now,
                pullVersions,
            });
        } catch (error) {
            console.error("❌ Data pull failed:", error);
        } finally {
            this.isPulling = false;
        }
    }

    private startPeriodicPull(): void {
        if (this.pullTimer) return;

        if (this.isOnline) {
            this.pullFromServer().catch((e) =>
                console.error("❌ Initial pull error:", e),
            );
        }

        this.pullTimer = setInterval(() => {
            if (this.isOnline && !this.isPulling) {
                this.pullFromServer().catch((e) =>
                    console.error("❌ Periodic pull error:", e),
                );
            }
        }, SYNC_CONFIG.pullInterval);
    }

    public async pullNow(options: PullOptions = {}) {
        if (!this.isOnline) {
            throw new Error("Cannot pull while offline");
        }
        await this.pullFromServer(options);
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
