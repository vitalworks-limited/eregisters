import { FlattenedTrackedEntity } from "./../schemas";
import { useCallback } from "react";
import { useLiveSuspenseQuery, eq } from "@tanstack/react-db";
import { trackedEntitiesCollection } from "../collections";
import { useBatchQueue } from "./useBatchQueue";

interface UseTrackedEntityPersistenceOptions {
    trackedEntityId: string | undefined;
    debounceMs?: number;
}

interface UseTrackedEntityPersistenceReturn {
    trackedEntity: FlattenedTrackedEntity | undefined;
    loading: boolean;
    updateField: (fieldId: string, value: any) => void;
    updateFields: (fields: Record<string, any>) => Promise<void>;
    createTrackedEntity: (entity: FlattenedTrackedEntity) => Promise<void>;
}

export function useTrackedEntityPersistence(
    options: UseTrackedEntityPersistenceOptions,
): UseTrackedEntityPersistenceReturn {
    const { trackedEntityId, debounceMs = 300 } = options;

    // Use TanStack DB's useLiveSuspenseQuery to get the tracked entity
    const { data: trackedEntity } = useLiveSuspenseQuery((q) =>
        q
            .from({ trackedEntity: trackedEntitiesCollection })
            .where(({ trackedEntity }) =>
                eq(trackedEntity.trackedEntity, trackedEntityId),
            )
            .findOne(),
    );

    const { updateField, updateFields } = useBatchQueue({
        entityId: trackedEntityId,
        debounceMs,
        onFlush: async (id, updates) => {
            const tx = trackedEntitiesCollection.update(id, (draft) => {
                draft.attributes = {
                    ...draft.attributes,
                    ...updates,
                };
            });
            await tx.isPersisted.promise;
        },
    });

    const createTrackedEntity = useCallback(
        async (newEntity: FlattenedTrackedEntity) => {
            try {
                const tx = trackedEntitiesCollection.insert(newEntity);
                await tx.isPersisted.promise;
            } catch (error) {
                console.error(`Failed to create tracked entity:`, error);
                throw error;
            }
        },
        [],
    );

    return {
        trackedEntity,
        loading: trackedEntity === undefined,
        updateField,
        updateFields,
        createTrackedEntity,
    };
}
