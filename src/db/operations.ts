import type { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";
import { db, type SyncOperation } from "./index";

/**
 * Database Operations for MOH Registers Application
 *
 * This module provides a clean API for interacting with the IndexedDB database.
 * All operations are async and return promises.
 */

// ============================================================================
// TrackedEntity Operations
// ============================================================================

/**
 * Save or update a tracked entity in the local database
 */
export async function saveTrackedEntity(
    entity: FlattenedTrackedEntity,
): Promise<void> {
    await db.trackedEntities.put(entity);
}

/**
 * Get a tracked entity by ID
 */
export async function getTrackedEntity(
    id: string,
): Promise<FlattenedTrackedEntity | undefined> {
    return await db.trackedEntities.get(id);
}

/**
 * Get all tracked entities for an organization unit (paginated)
 * ✅ OPTIMIZED: Added pagination to prevent loading large datasets
 */
export async function getTrackedEntitiesByOrgUnit(
    orgUnit: string,
    page: number = 1,
    pageSize: number = 50,
): Promise<{ entities: FlattenedTrackedEntity[]; total: number }> {
    const total = await db.trackedEntities
        .where("orgUnit")
        .equals(orgUnit)
        .count();

    const entities = await db.trackedEntities
        .where("orgUnit")
        .equals(orgUnit)
        .reverse()
        .sortBy("updatedAt")
        .then((sorted) => {
            const start = (page - 1) * pageSize;
            return sorted.slice(start, start + pageSize);
        });

    return { entities, total };
}

/**
 * Get all tracked entities (paginated)
 */
export async function getTrackedEntities(
    page: number = 1,
    pageSize: number = 10,
): Promise<{ entities: FlattenedTrackedEntity[]; total: number }> {
    const total = await db.trackedEntities.count();
    const entities = await db.trackedEntities
        .orderBy("updatedAt")
        .reverse()
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .toArray();

    return { entities, total };
}

/**
 * Delete a tracked entity
 */
export async function deleteTrackedEntity(id: string): Promise<void> {
    await db.trackedEntities.delete(id);
}

/**
 * Bulk save tracked entities (useful for initial sync and search results)
 * @param entities - Tracked entities to save
 * @param syncStatus - Optional sync status to set (default: "synced" for search results)
 */
export async function bulkSaveTrackedEntities(
    entities: FlattenedTrackedEntity[],
    syncStatus: "synced" | "pending" | "draft" = "synced",
): Promise<void> {
    // Add sync metadata to entities before saving
    const entitiesWithMetadata = entities.map((entity) => {
        const entityWithSync = entity as any;
        return {
            ...entity,
            syncStatus: entityWithSync.syncStatus || syncStatus,
            version: entityWithSync.version || 1,
            lastModified:
                entityWithSync.lastModified || new Date().toISOString(),
            lastSynced:
                syncStatus === "synced"
                    ? new Date().toISOString()
                    : entityWithSync.lastSynced,
        };
    });

    await db.trackedEntities.bulkPut(entitiesWithMetadata as any);
}

// ============================================================================
// Event Operations
// ============================================================================

/**
 * Save or update an event in the local database
 */
export async function saveEvent(event: FlattenedEvent): Promise<void> {
    await db.events.put(event);
}

/**
 * Get an event by ID
 */
export async function getEvent(
    id: string,
): Promise<FlattenedEvent | undefined> {
    return await db.events.get(id);
}

/**
 * Get all events for a tracked entity (paginated)
 * ✅ OPTIMIZED: Added pagination to prevent loading large event datasets
 */
export async function getEventsByTrackedEntity(
    trackedEntityId: string,
    page: number = 1,
    pageSize: number = 100,
): Promise<{ events: FlattenedEvent[]; total: number }> {
    const total = await db.events
        .where("trackedEntity")
        .equals(trackedEntityId)
        .count();

    const events = await db.events
        .where("trackedEntity")
        .equals(trackedEntityId)
        .reverse()
        .sortBy("occurredAt")
        .then((sorted) => {
            const start = (page - 1) * pageSize;
            return sorted.slice(start, start + pageSize);
        });

    return { events, total };
}

/**
 * Get all events for a program stage (paginated)
 * ✅ OPTIMIZED: Added pagination to prevent loading large event datasets
 */
export async function getEventsByProgramStage(
    trackedEntityId: string,
    programStageId: string,
    page: number = 1,
    pageSize: number = 100,
): Promise<{ events: FlattenedEvent[]; total: number }> {
    const total = await db.events
        .where("[trackedEntity+programStage]")
        .equals([trackedEntityId, programStageId])
        .count();

    const events = await db.events
        .where("[trackedEntity+programStage]")
        .equals([trackedEntityId, programStageId])
        .reverse()
        .sortBy("occurredAt")
        .then((sorted) => {
            const start = (page - 1) * pageSize;
            return sorted.slice(start, start + pageSize);
        });

    return { events, total };
}

/**
 * Delete an event
 */
export async function deleteEvent(id: string): Promise<void> {
    await db.events.delete(id);
}

/**
 * Bulk save events (useful for initial sync)
 */
export async function bulkSaveEvents(events: FlattenedEvent[]): Promise<void> {
    await db.events.bulkPut(events);
}

// ============================================================================
// Sync Queue Operations
// ============================================================================

/**
 * Add an operation to the sync queue
 * Uses composite ID (entityId_type) to ensure only one operation exists per entity+type
 * Multiple calls will upsert (update existing) rather than creating duplicates
 */
export async function queueSyncOperation(
    operation: Omit<
        SyncOperation,
        "id" | "status" | "attempts" | "createdAt" | "updatedAt"
    >,
): Promise<SyncOperation> {
    const now = new Date().toISOString();
    const compositeId = `${operation.entityId}_${operation.type}`;
    const existing = await db.syncQueue.get(compositeId);

    const completeOperation: SyncOperation = {
        ...operation,
        id: compositeId,
        status: "pending",
        attempts: existing?.attempts || 0,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
    };

    await db.syncQueue.put(completeOperation);
    return completeOperation;
}

/**
 * Get next pending sync operation (highest priority, oldest first)
 * Also includes failed operations that haven't exceeded retry limit
 */
export async function getNextSyncOperation(): Promise<
    SyncOperation | undefined
> {
    // Get pending operations
    const pendingOps = await db.syncQueue
        .where("status")
        .equals("pending")
        .sortBy("priority");

    // Get failed operations that can be retried (attempts < 3)
    const failedOps = await db.syncQueue
        .where("status")
        .equals("failed")
        .toArray();

    const now = new Date();
    const retryableFailedOps = failedOps
        .filter((op) => {
            if (op.attempts >= 3) return false;

            // Implement exponential backoff: 5s, 15s, 45s
            const backoffDelay = Math.pow(3, op.attempts) * 5000;
            const lastAttempt = new Date(op.updatedAt);
            const timeSinceLastAttempt = now.getTime() - lastAttempt.getTime();

            return timeSinceLastAttempt >= backoffDelay;
        })
        .sort(
            (a, b) =>
                b.priority - a.priority ||
                a.createdAt.localeCompare(b.createdAt),
        );

    // Combine both, prioritizing pending operations
    const allOps = [...pendingOps.reverse(), ...retryableFailedOps];

    return allOps[0]; // Highest priority first
}

/**
 * Update sync operation status
 */
export async function updateSyncOperation(
    id: string,
    update: Partial<Pick<SyncOperation, "status" | "attempts" | "error">>,
): Promise<void> {
    const operation = await db.syncQueue.get(id);
    if (!operation) return;

    await db.syncQueue.put({
        ...operation,
        ...update,
        updatedAt: new Date().toISOString(),
    });
}

/**
 * Mark sync operation as completed
 */
export async function completeSyncOperation(id: string): Promise<void> {
    await updateSyncOperation(id, { status: "completed" });
}

/**
 * Mark sync operation as failed
 */
export async function failSyncOperation(
    id: string,
    error: string,
): Promise<void> {
    const operation = await db.syncQueue.get(id);
    if (!operation) return;

    await updateSyncOperation(id, {
        status: "failed",
        attempts: operation.attempts + 1,
        error,
    });
}

/**
 * Retry a failed sync operation
 */
export async function retrySyncOperation(id: string): Promise<void> {
    await updateSyncOperation(id, { status: "pending", error: undefined });
}

/**
 * Delete a sync operation
 */
export async function deleteSyncOperation(id: string): Promise<void> {
    await db.syncQueue.delete(id);
}

/**
 * Get all sync operations with a specific status
 */
export async function getSyncOperationsByStatus(
    status: SyncOperation["status"],
): Promise<SyncOperation[]> {
    return await db.syncQueue
        .where("status")
        .equals(status)
        .sortBy("createdAt");
}

/**
 * Get sync queue statistics
 */
export async function getSyncQueueStats(): Promise<{
    pending: number;
    syncing: number;
    failed: number;
    completed: number;
    total: number;
}> {
    const [pending, syncing, failed, completed] = await Promise.all([
        db.syncQueue.where("status").equals("pending").count(),
        db.syncQueue.where("status").equals("syncing").count(),
        db.syncQueue.where("status").equals("failed").count(),
        db.syncQueue.where("status").equals("completed").count(),
    ]);

    return {
        pending,
        syncing,
        failed,
        completed,
        total: pending + syncing + failed + completed,
    };
}
