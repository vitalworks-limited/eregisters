import { FlattenedEvent, FlattenedTrackedEntity } from "./../schemas";
import { useCallback, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

type EntityType = "event" | "trackedEntity" | "relationship";

interface UseDexiePersistenceOptions {
    entityType: EntityType;
    entityId: string | null;
    debounceMs?: number;
}

interface UseDexiePersistenceReturn<T> {
    entity: T | null;
    loading: boolean;
    updateField: (fieldId: string, value: any) => void;
    updateFields: (fields: Record<string, any>) => Promise<void>;
    createEntity: (entity: T) => Promise<void>;
}

export function useDexiePersistence<
    T extends FlattenedEvent | FlattenedTrackedEntity,
>(options: UseDexiePersistenceOptions): UseDexiePersistenceReturn<T> {
    const { entityType, entityId, debounceMs = 300 } = options;

    const entity = useLiveQuery(async () => {
        if (!entityId) return null;

        if (entityType === "event") {
            return (await db.events.get(entityId)) as T | undefined;
        } else {
            return (await db.trackedEntities.get(entityId)) as T | undefined;
        }
    }, [entityId, entityType]);

    const batchQueueRef = useRef<Record<string, any>>({});
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const flush = useCallback(async () => {
        const updates = { ...batchQueueRef.current };
        batchQueueRef.current = {};

        if (Object.keys(updates).length === 0) {
            return;
        }

        if (!entityId) {
            return;
        }

        try {
            if (entityType === "event") {
                const current = await db.events.get(entityId);
                if (!current) {
                    throw new Error(`Event ${entityId} not found in database`);
                }
                await db.events.update(entityId, {
                    dataValues: {
                        ...current.dataValues,
                        ...updates,
                    },
                });
            } else {
                const current = await db.trackedEntities.get(entityId);
                if (!current) {
                    throw new Error(
                        `TrackedEntity ${entityId} not found in database`,
                    );
                }
                await db.trackedEntities.update(entityId, {
                    attributes: {
                        ...current.attributes,
                        ...updates,
                    },
                });
            }
        } catch (error) {
            console.error(`❌ Failed to update ${entityType}:`, error);
            throw error;
        }
    }, [entityId, entityType]);
    const updateField = useCallback(
        (fieldId: string, value: any) => {
            console.log(`Updating field ${fieldId} with value:`, value);
            batchQueueRef.current[fieldId] = value;

            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            timerRef.current = setTimeout(() => {
                flush();
            }, debounceMs);
        },
        [flush, debounceMs],
    );
    const updateFields = useCallback(
        async (fields: Record<string, any>) => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }

            batchQueueRef.current = {
                ...batchQueueRef.current,
                ...fields,
            };
            await flush();
        },
        [flush],
    );

    const createEntity = useCallback(
        async (newEntity: T) => {
            try {
                if (entityType === "event") {
                    await db.events.put(newEntity as FlattenedEvent);
                } else {
                    await db.trackedEntities.put(
                        newEntity as FlattenedTrackedEntity,
                    );
                }
            } catch (error) {
                console.error(`Failed to create ${entityType}:`, error);
                throw error;
            }
        },
        [entityType],
    );

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            if (Object.keys(batchQueueRef.current).length > 0) {
                flush();
            }
        };
    }, [flush]);

    return {
        entity: (entity as T) || null,
        loading: entity === undefined,
        updateField,
        updateFields,
        createEntity,
    };
}
