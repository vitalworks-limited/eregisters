import { createCollection } from "@tanstack/db";
import { dexieCollectionOptions } from "tanstack-dexie-db-collection";
import { getInternalUpdateFlag } from "../db/collections";
import { dhis2SyncManager } from "../db/dhis2-sync";
import { isSyncMetadataOnlyChange } from "../db/utils";
import { FlattenedEnrollmentSchema } from "../schemas";

export const enrollmentsCollection = createCollection(
    dexieCollectionOptions({
        id: "enrollments",
        dbName: "MOHRegisterDB",
        tableName: "enrollments",
        schema: FlattenedEnrollmentSchema,
        awaitPersistence: false,
        swallowPersistenceErrors: true,
        getKey: (enrollment) => enrollment.enrollment,
        onInsert: async ({ transaction }) => {
            try {
                if (getInternalUpdateFlag()) return;
                for (const mutation of transaction.mutations) {
                    const enrollment = mutation.modified;

                    if (enrollment.syncStatus === "draft") {
                        console.log(
                            "⏸️  Enrollment is draft, skipping sync queue:",
                            enrollment.enrollment,
                        );
                        continue;
                    }

                    if (enrollment.syncStatus === "pending") {
                        try {
                            dhis2SyncManager.syncEnrollment(enrollment);
                            console.log(
                                "✅ Syncing enrollment:",
                                enrollment.enrollment,
                            );
                        } catch (error) {
                            console.error(
                                "❌ Failed to sync enrollment:",
                                error,
                            );
                        }
                    }
                }
            } catch (error) {
                console.error("❌ Critical error in enrollments onInsert handler:", error);
            }
        },
        onUpdate: async ({ transaction }) => {
            try {
                if (getInternalUpdateFlag()) {
                    console.log("⏭️  [Enrollment onUpdate] Skipping - internal update flag is set");
                    return;
                }

                console.log(`🔄 [Enrollment onUpdate] Processing ${transaction.mutations.length} mutations`);

                for (const mutation of transaction.mutations) {
                    const enrollment = mutation.modified;
                    const changes = mutation.changes;

                    console.log(`🔍 [Enrollment onUpdate] Enrollment ${enrollment.enrollment}:`, {
                        syncStatus: enrollment.syncStatus,
                        changes: Object.keys(changes),
                    });

                    // Allow deleted status through even if it's the only change
                    if (enrollment.syncStatus !== "deleted" && isSyncMetadataOnlyChange(changes)) {
                        console.log(
                            "⏭️  Skipping sync queue for metadata-only update:",
                            enrollment.enrollment,
                        );
                        continue;
                    }
                    if (enrollment.syncStatus === "pending") {
                        try {
                            console.log(`🎯 [Enrollment onUpdate] Syncing enrollment ${enrollment.enrollment}`);
                            dhis2SyncManager.syncEnrollment(enrollment);
                            console.log("✅ Syncing enrollment update:", enrollment.enrollment);
                        } catch (error) {
                            console.error("❌ Failed to sync enrollment update:", error);
                        }
                    } else if (enrollment.syncStatus === "deleted") {
                        try {
                            console.log(`🎯 [Enrollment onUpdate] Deleting enrollment ${enrollment.enrollment}`);
                            dhis2SyncManager.deleteEntity(enrollment, "enrollment");
                            console.log("✅ Deleting enrollment:", enrollment.enrollment);
                        } catch (error) {
                            console.error("❌ Failed to delete enrollment:", error);
                        }
                    } else if (enrollment.syncStatus === "draft") {
                        console.log(
                            "⏸️  Draft enrollment updated, not queueing:",
                            enrollment.enrollment,
                        );
                    } else {
                        console.log(
                            `⚠️  [Enrollment onUpdate] Unexpected status "${enrollment.syncStatus}" for enrollment ${enrollment.enrollment}`,
                        );
                    }
                }
            } catch (error) {
                console.error("❌ Critical error in enrollments onUpdate handler:", error);
            }
        },
        onDelete: async ({ transaction }) => {
            try {
                if (getInternalUpdateFlag()) return;
                for (const mutation of transaction.mutations) {
                    console.log("🗑️  Enrollment deleted:", mutation.key);
                }
            } catch (error) {
                console.error("❌ Critical error in enrollments onDelete handler:", error);
            }
        },
    }),
);
