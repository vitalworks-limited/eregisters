import { useCallback, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, FlattenedEvent, FlattenedTrackedEntity } from "../db";

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
            console.log("💾 Flush skipped: No updates in queue");
            return;
        }

        if (!entityId) {
            console.log("💾 Flush skipped: No entityId");
            return;
        }

        console.log(
            `💾 Flushing ${Object.keys(updates).length} updates for ${entityType}:`,
            entityId,
        );

        try {
            if (entityType === "event") {
                const current = await db.events.get(entityId);
                if (!current) {
                    console.error("❌ Event not found in Dexie:", entityId);
                    throw new Error(`Event ${entityId} not found in database`);
                }
                console.log(
                    "✅ Found event in Dexie, updating with:",
                    Object.keys(updates),
                );
                await db.events.put({
                    ...current,
                    dataValues: {
                        ...current.dataValues,
                        ...updates,
                    },
                });
                console.log("✅ Event updated successfully");
            } else {
                const current = await db.trackedEntities.get(entityId);
                if (!current) {
                    console.error(
                        "❌ TrackedEntity not found in Dexie:",
                        entityId,
                    );
                    throw new Error(
                        `TrackedEntity ${entityId} not found in database`,
                    );
                }
                console.log(
                    "✅ Found trackedEntity in Dexie, updating with:",
                    Object.keys(updates),
                );
                await db.trackedEntities.put({
                    ...current,
                    attributes: {
                        ...current.attributes,
                        ...updates,
                    },
                });
                console.log("✅ TrackedEntity updated successfully");
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
