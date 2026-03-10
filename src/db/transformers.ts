import type {
    FlattenedEvent,
    FlattenedEnrollment,
    FlattenedTrackedEntity,
} from "../schemas";

/**
 * Shared DHIS2 transformation utilities
 *
 * These functions convert flattened local data structures into DHIS2 API format.
 * Used by both sync systems to ensure consistent data transformation.
 */

/**
 * Transform a tracked entity from local format to DHIS2 API format
 * Converts flat attributes object to array of {attribute, value} objects
 * Handles parent entity relationship via FhyNxUVOpjh attribute
 */
export function transformTrackedEntity(te: FlattenedTrackedEntity) {
    const { attributes, ...rest } = te;
    const { enrolledAt, ...teAttributes } = attributes;

    const finalAttributes = te.parentEntity
        ? { ...teAttributes, FhyNxUVOpjh: te.parentEntity }
        : teAttributes;

    return {
        ...rest,
        attributes: Object.entries(finalAttributes).flatMap(
            ([attribute, value]: [string, any]) => {
                if (value !== undefined && value !== null && value !== "") {
                    return { attribute, value: String(value) };
                }
                return [];
            },
        ),
    };
}
export function transformEnrollment(enrollment: FlattenedEnrollment) {
    const { attributes, ...rest } = enrollment;
    const { enrolledAt, ...enrollmentAttributes } = attributes;

    return {
        ...rest,
        enrolledAt: enrolledAt || rest.enrolledAt,
        attributes: Object.entries(enrollmentAttributes).flatMap(
            ([attribute, value]: [string, any]) => {
                if (value !== undefined && value !== null && value !== "") {
                    return { attribute, value: String(value) };
                }
                return [];
            },
        ),
    };
}

export function transformEvent(event: FlattenedEvent) {
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
                if (value !== undefined && value !== null && value !== "") {
                    if (Array.isArray(value)) {
                        return { dataElement, value: value.join(",") };
                    }
                    return { dataElement, value };
                }
                return [];
            },
        ),
        occurredAt: occurredAt || eventRest.occurredAt,
    };
}
