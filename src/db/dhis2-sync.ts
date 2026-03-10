import type {
    FlattenedEvent,
    FlattenedEnrollment,
    FlattenedTrackedEntity,
} from "../schemas";
import { setInternalUpdate } from "./collections";
import { eventsCollection } from "../collections/events";
import { enrollmentsCollection } from "../collections/enrollments";
import { trackedEntitiesCollection } from "../collections/tracked-entities";
import { useDataEngine } from "@dhis2/app-runtime";
import {
    transformTrackedEntity,
    transformEnrollment,
    transformEvent,
} from "./transformers";

class DHIS2SyncManager {
    private engine: ReturnType<typeof useDataEngine> | null = null;

    initialize(engine: ReturnType<typeof useDataEngine>) {
        this.engine = engine;
        console.log("✅ [DHIS2Sync] Engine initialized");
    }

    private ensureEngine(): boolean {
        if (!this.engine) {
            console.error("❌ [DHIS2Sync] Engine not initialized");
            return false;
        }
        return true;
    }

    async syncTrackedEntity(entity: FlattenedTrackedEntity) {
        if (!this.ensureEngine()) return;
        if (entity.syncStatus !== "pending") return;

        console.log(`🔄 [DHIS2Sync] Syncing tracked entity ${entity.trackedEntity}`);

        try {
            const payload = {
                trackedEntities: [transformTrackedEntity(entity)],
            };

            await this.engine!.mutate({
                resource: "tracker",
                type: "create",
                data: payload,
                params: { async: false, importStrategy: "CREATE_AND_UPDATE" },
            });

            const now = new Date().toISOString();
            setInternalUpdate(true);
            await trackedEntitiesCollection.utils.updateLocally(
                entity.trackedEntity,
                {
                    syncStatus: "synced",
                    lastSynced: now,
                }
            );
            setInternalUpdate(false);

            console.log(`✅ [DHIS2Sync] Tracked entity ${entity.trackedEntity} synced successfully`);
        } catch (error) {
            console.error(`❌ [DHIS2Sync] Failed to sync tracked entity ${entity.trackedEntity}:`, error);
            // Keep status as pending so periodic sync can retry
        }
    }

    async syncEnrollment(enrollment: FlattenedEnrollment) {
        if (!this.ensureEngine()) return;
        if (enrollment.syncStatus !== "pending") return;

        console.log(`🔄 [DHIS2Sync] Syncing enrollment ${enrollment.enrollment}`);

        // Check if parent tracked entity exists and is synced
        const parentTE = trackedEntitiesCollection.get(enrollment.trackedEntity);
        if (!parentTE) {
            console.warn(`⚠️  [DHIS2Sync] Parent TE ${enrollment.trackedEntity} not found for enrollment ${enrollment.enrollment}`);
            return;
        }

        if (parentTE.syncStatus === "draft") {
            console.warn(`⚠️  [DHIS2Sync] Parent TE ${enrollment.trackedEntity} is still draft, skipping enrollment ${enrollment.enrollment}`);
            return;
        }

        // If parent is pending, sync it first
        if (parentTE.syncStatus === "pending") {
            console.log(`📎 [DHIS2Sync] Parent TE ${enrollment.trackedEntity} is pending, syncing it first`);
            await this.syncTrackedEntity(parentTE);
            // Re-check parent status after sync attempt
            const updatedParent = trackedEntitiesCollection.get(enrollment.trackedEntity);
            if (updatedParent?.syncStatus !== "synced") {
                console.warn(`⚠️  [DHIS2Sync] Parent TE ${enrollment.trackedEntity} sync failed, skipping enrollment`);
                return;
            }
        }

        try {
            const payload = {
                enrollments: [transformEnrollment(enrollment)],
            };

            await this.engine!.mutate({
                resource: "tracker",
                type: "create",
                data: payload,
                params: { async: false, importStrategy: "CREATE_AND_UPDATE" },
            });

            const now = new Date().toISOString();
            setInternalUpdate(true);
            await enrollmentsCollection.utils.updateLocally(enrollment.enrollment, {
                syncStatus: "synced",
                lastSynced: now,
            });
            setInternalUpdate(false);

            console.log(`✅ [DHIS2Sync] Enrollment ${enrollment.enrollment} synced successfully`);
        } catch (error) {
            console.error(`❌ [DHIS2Sync] Failed to sync enrollment ${enrollment.enrollment}:`, error);
            // Keep status as pending so periodic sync can retry
        }
    }

    async syncEvent(event: FlattenedEvent) {
        if (!this.ensureEngine()) return;
        if (event.syncStatus !== "pending") return;

        console.log(`🔄 [DHIS2Sync] Syncing event ${event.event}`);

        // Check if parent enrollment exists and is synced
        const parentEnrollment = enrollmentsCollection.get(event.enrollment);
        if (!parentEnrollment) {
            console.warn(`⚠️  [DHIS2Sync] Parent enrollment ${event.enrollment} not found for event ${event.event}`);
            return;
        }

        if (parentEnrollment.syncStatus === "draft") {
            console.warn(`⚠️  [DHIS2Sync] Parent enrollment ${event.enrollment} is still draft, skipping event ${event.event}`);
            return;
        }

        // If parent is pending, sync it first
        if (parentEnrollment.syncStatus === "pending") {
            console.log(`📎 [DHIS2Sync] Parent enrollment ${event.enrollment} is pending, syncing it first`);
            await this.syncEnrollment(parentEnrollment);
            // Re-check parent status after sync attempt
            const updatedParent = enrollmentsCollection.get(event.enrollment);
            if (updatedParent?.syncStatus !== "synced") {
                console.warn(`⚠️  [DHIS2Sync] Parent enrollment ${event.enrollment} sync failed, skipping event`);
                return;
            }
        }

        try {
            const payload = {
                events: [transformEvent(event)],
            };

            await this.engine!.mutate({
                resource: "tracker",
                type: "create",
                data: payload,
                params: { async: false, importStrategy: "CREATE_AND_UPDATE" },
            });

            const now = new Date().toISOString();
            setInternalUpdate(true);
            await eventsCollection.utils.updateLocally(event.event, {
                syncStatus: "synced",
                lastSynced: now,
            });
            setInternalUpdate(false);

            console.log(`✅ [DHIS2Sync] Event ${event.event} synced successfully`);
        } catch (error) {
            console.error(`❌ [DHIS2Sync] Failed to sync event ${event.event}:`, error);
            // Keep status as pending so periodic sync can retry
        }
    }

    async deleteEntity(
        entity: FlattenedTrackedEntity | FlattenedEnrollment | FlattenedEvent,
        type: "trackedEntity" | "enrollment" | "event"
    ) {
        if (!this.ensureEngine()) return;

        console.log(`🗑️  [DHIS2Sync] Deleting ${type} ${entity[type]}`);

        try {
            const payload: any = {};

            if (type === "trackedEntity") {
                payload.trackedEntities = [transformTrackedEntity(entity as FlattenedTrackedEntity)];
            } else if (type === "enrollment") {
                payload.enrollments = [transformEnrollment(entity as FlattenedEnrollment)];
            } else if (type === "event") {
                payload.events = [transformEvent(entity as FlattenedEvent)];
            }

            await this.engine!.mutate({
                resource: "tracker",
                type: "create",
                data: payload,
                params: { async: false, importStrategy: "DELETE" },
            });

            setInternalUpdate(true);
            if (type === "trackedEntity") {
                const tx = trackedEntitiesCollection.delete((entity as FlattenedTrackedEntity).trackedEntity);
                await tx.isPersisted.promise;
            } else if (type === "enrollment") {
                const tx = enrollmentsCollection.delete((entity as FlattenedEnrollment).enrollment);
                await tx.isPersisted.promise;
            } else if (type === "event") {
                const tx = eventsCollection.delete((entity as FlattenedEvent).event);
                await tx.isPersisted.promise;
            }
            setInternalUpdate(false);

            console.log(`✅ [DHIS2Sync] ${type} ${entity[type]} deleted successfully`);
        } catch (error) {
            console.error(`❌ [DHIS2Sync] Failed to delete ${type} ${entity[type]}:`, error);
        }
    }
}

export const dhis2SyncManager = new DHIS2SyncManager();
