import {
    FlattenedEvent,
    FlattenedTrackedEntity,
    FlattenedEnrollment,
} from "../schemas";

function mergeEvent(
    serverEvent: FlattenedEvent,
    localEvent: FlattenedEvent | undefined,
): FlattenedEvent {
    if (!localEvent) {
        return serverEvent;
    }
    return {
        ...localEvent,
        dataValues: {
            ...serverEvent.dataValues,
            ...localEvent.dataValues,
        },
    };
}

function mergeTrackedEntity(
    serverEntity: FlattenedTrackedEntity,
    localEntity: FlattenedTrackedEntity | undefined,
): FlattenedTrackedEntity {
    if (!localEntity) {
        return serverEntity;
    }
    return {
        ...localEntity,
        attributes: {
            ...serverEntity.attributes,
            ...localEntity.attributes,
        },
    };
}

function mergeEnrollment(
    serverEnrollment: FlattenedEnrollment,
    localEnrollment: FlattenedEnrollment | undefined,
): FlattenedEnrollment {
    if (!localEnrollment) {
        return serverEnrollment;
    }
    return {
        ...localEnrollment,
        attributes: {
            ...serverEnrollment.attributes,
            ...localEnrollment.attributes,
        },
    };
}

export async function mergeBulkEvents(
    serverEvents: FlattenedEvent[],
    getLocalEvent: (eventId: string) => Promise<FlattenedEvent | undefined>,
): Promise<FlattenedEvent[]> {
    return Promise.all(
        serverEvents.map(async (serverEvent) => {
            const localEvent = await getLocalEvent(serverEvent.event);
            return mergeEvent(serverEvent, localEvent);
        }),
    );
}

export async function mergeBulkTrackedEntities(
    serverEntities: FlattenedTrackedEntity[],
    getLocalEntity: (id: string) => Promise<FlattenedTrackedEntity | undefined>,
): Promise<FlattenedTrackedEntity[]> {
    return Promise.all(
        serverEntities.map(async (serverEntity) => {
            const localEntity = await getLocalEntity(
                serverEntity.trackedEntity,
            );
            return mergeTrackedEntity(serverEntity, localEntity);
        }),
    );
}

export async function mergeBulkEnrollments(
    serverEnrollments: FlattenedEnrollment[],
    getLocalEnrollment: (
        id: string,
    ) => Promise<FlattenedEnrollment | undefined>,
): Promise<FlattenedEnrollment[]> {
    return Promise.all(
        serverEnrollments.map(async (serverEnrollment) => {
            const localEnrollment = await getLocalEnrollment(
                serverEnrollment.enrollment,
            );
            return mergeEnrollment(serverEnrollment, localEnrollment);
        }),
    );
}
