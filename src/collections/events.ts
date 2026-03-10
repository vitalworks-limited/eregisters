import { createCollection } from "@tanstack/db";
import { dexieCollectionOptions } from "tanstack-dexie-db-collection";
import { getInternalUpdateFlag } from "../db/collections";
import { dhis2SyncManager } from "../db/dhis2-sync";
import { isSyncMetadataOnlyChange } from "../db/utils";
import { FlattenedEventSchema } from "../schemas";

export const eventsCollection = createCollection(
    dexieCollectionOptions({
        id: "events",
        dbName: "MOHRegisterDB",
        tableName: "events",
        schema: FlattenedEventSchema,
        awaitPersistence: false,
        swallowPersistenceErrors: true,
        getKey: (event) => event.event,
        onInsert: async ({ transaction }) => {
            try {
                if (getInternalUpdateFlag()) return;

                for (const mutation of transaction.mutations) {
                    const event = mutation.modified;

                    if (event.syncStatus === "draft") {
                        console.log(
                            "⏸️  Event is draft, skipping sync queue:",
                            event.event,
                        );
                        continue;
                    }

                    if (event.syncStatus === "pending") {
                        try {
                            dhis2SyncManager.syncEvent(event);
                            console.log("✅ Syncing event:", event.event);
                        } catch (error) {
                            console.error("❌ Failed to sync event:", error);
                        }
                    }
                }
            } catch (error) {
                console.error("❌ Critical error in events onInsert handler:", error);
            }
        },
        onUpdate: async ({ transaction }) => {
            try {
                if (getInternalUpdateFlag()) return;

                for (const mutation of transaction.mutations) {
                    const event = mutation.modified;
                    const changes = mutation.changes;
                    if (
                        event.syncStatus !== "deleted" &&
                        isSyncMetadataOnlyChange(changes)
                    ) {
                        console.log(
                            "⏭️  Skipping sync queue for metadata-only update:",
                            event.event,
                        );
                        continue;
                    }
                    if (event.syncStatus === "pending") {
                        try {
                            dhis2SyncManager.syncEvent(event);
                            console.log("✅ Syncing event update:", event.event);
                        } catch (error) {
                            console.error("❌ Failed to sync event update:", error);
                        }
                    } else if (event.syncStatus === "deleted") {
                        try {
                            dhis2SyncManager.deleteEntity(event, "event");
                            console.log("✅ Deleting event:", event.event);
                        } catch (error) {
                            console.error("❌ Failed to delete event:", error);
                        }
                    }
                }
            } catch (error) {
                console.error("❌ Critical error in events onUpdate handler:", error);
            }
        },
        onDelete: async ({ transaction }) => {
            try {
                for (const mutation of transaction.mutations) {
                    console.log("🗑️  Event deleted:", mutation.key);
                }
            } catch (error) {
                console.error("❌ Critical error in events onDelete handler:", error);
            }
        },
    }),
);
