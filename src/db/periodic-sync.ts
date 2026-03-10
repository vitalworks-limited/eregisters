import { useDataEngine } from "@dhis2/app-runtime";
import Dexie from "dexie";
import { dhis2SyncManager } from "./dhis2-sync";
import type {
    FlattenedTrackedEntity,
    FlattenedEnrollment,
    FlattenedEvent,
} from "../schemas";

let syncInterval: NodeJS.Timeout | null = null;
let collectionDb: Dexie | null = null;

// Get or create the Dexie database instance for accessing TanStack collection tables
// We use verno (version number) to avoid schema conflicts with TanStack's dynamic schema
const getCollectionDb = async () => {
    if (collectionDb) {
        return collectionDb;
    }

    // Access the existing database by opening it without defining a schema
    // This allows us to query tables that were created by TanStack DB
    const db = new Dexie("MOHRegisterDB");

    // We need to discover the existing schema version
    await db.open();

    collectionDb = db;
    return db;
};

/**
 * Periodic sync to catch any items that weren't synced by direct collection hooks
 * Runs every 30 seconds
 */
export function startPeriodicSync(engine: ReturnType<typeof useDataEngine>) {
    // Initialize the sync manager with the engine
    dhis2SyncManager.initialize(engine);

    // Clear any existing interval
    if (syncInterval) {
        clearInterval(syncInterval);
    }

    console.log("🔄 [PeriodicSync] Starting periodic sync (30s interval)");

    // Run sync immediately on start
    runPeriodicSync();

    // Then run every 30 seconds
    syncInterval = setInterval(() => {
        runPeriodicSync();
    }, 30000);
}

/**
 * Stop periodic sync (cleanup on app unmount)
 */
export function stopPeriodicSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log("⏹️  [PeriodicSync] Stopped periodic sync");
    }
}

/**
 * Run a single sync cycle
 */
async function runPeriodicSync() {
    console.log("🔍 [PeriodicSync] Starting sync cycle");

    try {
        const db = await getCollectionDb();

        // Get all items and filter in memory (can't use indexed queries on syncStatus)
        const allTEs = (await db
            .table<FlattenedTrackedEntity>("trackedEntities")
            .toArray()) as FlattenedTrackedEntity[];
        const pendingTEs = allTEs.filter((te) => te.syncStatus === "pending");

        const allEnrollments = (await db
            .table<FlattenedEnrollment>("enrollments")
            .toArray()) as FlattenedEnrollment[];
        const pendingEnrollments = allEnrollments.filter(
            (en) => en.syncStatus === "pending"
        );

        const allEvents = (await db
            .table<FlattenedEvent>("events")
            .toArray()) as FlattenedEvent[];
        const pendingEvents = allEvents.filter(
            (ev) => ev.syncStatus === "pending"
        );

        console.log(`📊 [PeriodicSync] Found pending items:`, {
            trackedEntities: pendingTEs.length,
            enrollments: pendingEnrollments.length,
            events: pendingEvents.length,
        });

        // Skip if nothing to sync
        if (
            pendingTEs.length === 0 &&
            pendingEnrollments.length === 0 &&
            pendingEvents.length === 0
        ) {
            console.log("✅ [PeriodicSync] No pending items to sync");
            return;
        }

        // Sync tracked entities first
        for (const te of pendingTEs) {
            await dhis2SyncManager.syncTrackedEntity(te);
        }

        // Then enrollments (their parent TEs should now be synced)
        for (const enrollment of pendingEnrollments) {
            await dhis2SyncManager.syncEnrollment(enrollment);
        }

        // Finally events (their parent enrollments should now be synced)
        for (const event of pendingEvents) {
            await dhis2SyncManager.syncEvent(event);
        }

        console.log("✅ [PeriodicSync] Sync cycle completed");
    } catch (error) {
        console.error("❌ [PeriodicSync] Error during sync cycle:", error);
    }
}
