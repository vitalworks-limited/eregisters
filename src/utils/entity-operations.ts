import {
    FlattenedTrackedEntity,
    FlattenedEvent,
    FlattenedEnrollment,
    SyncStatus,
} from "../schemas";
import {
    trackedEntitiesCollection,
    eventsCollection,
    enrollmentsCollection,
} from "../collections";

/**
 * Update tracked entity with sync status management.
 * Uses insertLocally to update existing entity (TanStack DB pattern).
 *
 * @param entity - Tracked entity to update
 * @param updates - Partial updates to apply
 * @returns Updated entity
 */
export function updateTrackedEntityWithSync(
    entity: FlattenedTrackedEntity,
    updates: Partial<FlattenedTrackedEntity>,
): FlattenedTrackedEntity {
    const updatedEntity: FlattenedTrackedEntity = {
        ...entity,
        ...updates,
        updatedAt: new Date().toISOString(),
        syncStatus: determineSyncStatus(entity.syncStatus),
        version: entity.version + 1,
    };

    trackedEntitiesCollection.utils.insertLocally(updatedEntity);
    return updatedEntity;
}

/**
 * Update tracked entity attributes with sync status management.
 *
 * @param entity - Tracked entity to update
 * @param attributes - Attributes to update
 * @returns Updated entity
 */
export function updateTrackedEntityAttributes(
    entity: FlattenedTrackedEntity,
    attributes: Record<string, any>,
): FlattenedTrackedEntity {
    return updateTrackedEntityWithSync(entity, {
        attributes: { ...entity.attributes, ...attributes },
    });
}

/**
 * Update event with sync status management.
 * Uses insertLocally to update existing event (TanStack DB pattern).
 *
 * @param event - Event to update
 * @param updates - Partial updates to apply
 * @returns Updated event
 */
export function updateEventWithSync(
    event: FlattenedEvent,
    updates: Partial<FlattenedEvent>,
): FlattenedEvent {
    const updatedEvent: FlattenedEvent = {
        ...event,
        ...updates,
        updatedAt: new Date().toISOString(),
        syncStatus: determineSyncStatus(event.syncStatus),
        version: event.version + 1,
    };

    eventsCollection.utils.insertLocally(updatedEvent);
    return updatedEvent;
}

/**
 * Update event data values with sync status management.
 *
 * @param event - Event to update
 * @param dataValues - Data values to update
 * @returns Updated event
 */
export function updateEventDataValues(
    event: FlattenedEvent,
    dataValues: Record<string, any>,
): FlattenedEvent {
    return updateEventWithSync(event, {
        dataValues: { ...event.dataValues, ...dataValues },
    });
}

/**
 * Update enrollment with sync status management.
 * Uses insertLocally to update existing enrollment (TanStack DB pattern).
 *
 * @param enrollment - Enrollment to update
 * @param updates - Partial updates to apply
 * @returns Updated enrollment
 */
export function updateEnrollmentWithSync(
    enrollment: FlattenedEnrollment,
    updates: Partial<FlattenedEnrollment>,
): FlattenedEnrollment {
    const updatedEnrollment: FlattenedEnrollment = {
        ...enrollment,
        ...updates,
        updatedAt: new Date().toISOString(),
        syncStatus: determineSyncStatus(enrollment.syncStatus),
        version: enrollment.version + 1,
    };

    enrollmentsCollection.utils.insertLocally(updatedEnrollment);
    return updatedEnrollment;
}

/**
 * Determine next sync status based on current status.
 * - "synced" entities become "pending" when updated
 * - "draft" and "pending" entities remain in their current state
 * - "deleted" entities remain deleted
 *
 * @param currentStatus - Current sync status
 * @returns Next sync status
 */
function determineSyncStatus(currentStatus: SyncStatus): SyncStatus {
    if (currentStatus === "synced") {
        return "pending";
    }
    return currentStatus;
}

/**
 * Mark entity as deleted (soft delete with sync status).
 *
 * @param entity - Entity to delete
 * @returns Updated entity marked as deleted
 */
export function markTrackedEntityAsDeleted(
    entity: FlattenedTrackedEntity,
): FlattenedTrackedEntity {
    return updateTrackedEntityWithSync(entity, {
        deleted: true,
        syncStatus: "deleted",
    });
}

/**
 * Mark event as deleted (soft delete with sync status).
 *
 * @param event - Event to delete
 * @returns Updated event marked as deleted
 */
export function markEventAsDeleted(event: FlattenedEvent): FlattenedEvent {
    return updateEventWithSync(event, {
        deleted: true,
        syncStatus: "deleted",
    });
}

/**
 * Mark enrollment as deleted (soft delete with sync status).
 *
 * @param enrollment - Enrollment to delete
 * @returns Updated enrollment marked as deleted
 */
export function markEnrollmentAsDeleted(
    enrollment: FlattenedEnrollment,
): FlattenedEnrollment {
    return updateEnrollmentWithSync(enrollment, {
        deleted: true,
        syncStatus: "deleted",
    });
}
