import { createCollection } from "@tanstack/db";
import { dexieCollectionOptions } from "tanstack-dexie-db-collection";
import { FlattenedTrackedEntitySchema } from "../schemas";
import { getInternalUpdateFlag } from "../db/collections";
import type { FlattenedTrackedEntity } from "../schemas";
import { dhis2SyncManager } from "../db/dhis2-sync";
import { isSyncMetadataOnlyChange } from "../db/utils";

export const trackedEntitiesCollection = createCollection(
    dexieCollectionOptions({
        schema: FlattenedTrackedEntitySchema,
        id: "trackedEntities",
        dbName: "MOHRegisterDB",
        tableName: "trackedEntities",
        getKey: (trackedEntity) => trackedEntity.trackedEntity,
        onInsert: async ({ transaction }) => {
            try {
                // Skip if this is an internal update (sync status changes)
                if (getInternalUpdateFlag()) return;

                // Queue each inserted entity for sync if not draft
                for (const mutation of transaction.mutations) {
                    const entity = mutation.modified as FlattenedTrackedEntity;

                    if (entity.syncStatus === "draft") {
                        console.log(
                            "⏸️  Tracked entity is draft, skipping sync queue:",
                            entity.trackedEntity,
                        );
                        continue;
                    }

                    if (entity.syncStatus === "pending") {
                        try {
                            dhis2SyncManager.syncTrackedEntity(entity);
                            console.log(
                                "✅ Syncing tracked entity:",
                                entity.trackedEntity,
                            );
                        } catch (error) {
                            console.error(
                                "❌ Failed to sync tracked entity:",
                                error,
                            );
                        }
                    }
                }
            } catch (error) {
                console.error("❌ Critical error in tracked entities onInsert handler:", error);
            }
        },
        onUpdate: async ({ transaction }) => {
            try {
                // Skip if this is an internal update (sync status changes)
                if (getInternalUpdateFlag()) return;

                // Queue each updated entity for sync
                for (const mutation of transaction.mutations) {
                    const entity = mutation.modified as FlattenedTrackedEntity;
                    const changes = mutation.changes;

                    // Allow deleted status through even if it's the only change
                    if (entity.syncStatus !== "deleted" && isSyncMetadataOnlyChange(changes)) {
                        console.log(
                            "⏭️  Skipping sync queue for metadata-only update:",
                            entity.trackedEntity,
                        );
                        continue;
                    }

                    // Sync if pending or deleted
                    if (entity.syncStatus === "pending") {
                        try {
                            dhis2SyncManager.syncTrackedEntity(entity);
                            console.log("✅ Syncing tracked entity update:", entity.trackedEntity);
                        } catch (error) {
                            console.error("❌ Failed to sync tracked entity update:", error);
                        }
                    } else if (entity.syncStatus === "deleted") {
                        try {
                            dhis2SyncManager.deleteEntity(entity, "trackedEntity");
                            console.log("✅ Deleting tracked entity:", entity.trackedEntity);
                        } catch (error) {
                            console.error("❌ Failed to delete tracked entity:", error);
                        }
                    }

                    // Log draft updates but don't queue
                    if (entity.syncStatus === "draft") {
                        console.log(
                            "⏸️  Draft tracked entity updated, not queueing:",
                            entity.trackedEntity,
                        );
                    }
                }
            } catch (error) {
                console.error("❌ Critical error in tracked entities onUpdate handler:", error);
            }
        },
        onDelete: async ({ transaction }) => {
            try {
                // Skip if this is an internal update
                if (getInternalUpdateFlag()) return;

                // For deletes, we could queue a deletion operation
                // Currently commenting out as deletion logic needs to be clarified
                for (const mutation of transaction.mutations) {
                    console.log("🗑️  Tracked entity deleted:", mutation.key);
                }
            } catch (error) {
                console.error("❌ Critical error in tracked entities onDelete handler:", error);
            }
        },
        awaitPersistence: false,
        swallowPersistenceErrors: true,
    }),
);
