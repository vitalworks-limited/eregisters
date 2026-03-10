import { useDataEngine } from "@dhis2/app-runtime";
import { trackedEntitiesCollection } from "../collections";
import { enrollmentsCollection } from "../collections/enrollments";
import { eventsCollection } from "../collections/events";
import { TrackedEntity } from "../schemas";
import {
    flattenEnrollment,
    flattenEvent,
    flattenTrackedEntity,
} from "../utils/utils";
import { db, type SyncState } from "./index";
import { createMetadataSync, type MetadataSync } from "./metadata-sync";

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
    private isPulling: boolean = false;
    private pullTimer?: NodeJS.Timeout;
    private cleanupInterval?: NodeJS.Timeout;
    private metadataCheckInterval?: NodeJS.Timeout;
    private metadataSync: MetadataSync;

    constructor(engine: ReturnType<typeof useDataEngine>) {
        this.engine = engine;
        this.metadataSync = createMetadataSync(engine);
        this.setupOnlineListener();
        // this.setupDatabaseHooks();
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
            return {
                status: this.isOnline ? "online" : "offline",
                pendingCount: 0,
            };
        }

        return {
            status: state.status,
            pendingCount: state.pendingCount || 0,
            lastSyncAt: state.lastSyncAt,
            error: state.lastError,
        };
    }
    public startAutoSync(): void {
        this.startMetadataChecks();
        this.startPeriodicPull();
    }

    /**
     * Stop automatic background sync
     */
    public stopAutoSync(): void {
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

                const trackedEntities = instances.map(flattenTrackedEntity);
                const events = instances.flatMap(({ enrollments }) =>
                    enrollments.flatMap(({ events }) =>
                        events.map(flattenEvent),
                    ),
                );
                const enrollments = instances.flatMap(({ enrollments }) =>
                    enrollments.map(flattenEnrollment),
                );
                await enrollmentsCollection.utils.bulkInsertLocally(
                    enrollments,
                );

                await trackedEntitiesCollection.utils.bulkInsertLocally(
                    trackedEntities,
                );
                await eventsCollection.utils.bulkInsertLocally(events);

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
