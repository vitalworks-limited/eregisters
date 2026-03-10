import { FlattenedEvent } from "./../schemas";
import { useCallback } from "react";
import { eq, useLiveSuspenseQuery } from "@tanstack/react-db";
import { eventsCollection } from "../collections/events";
import { useBatchQueue } from "./useBatchQueue";

interface UseEventPersistenceOptions {
    eventId: string | null;
    debounceMs?: number;
}

interface UseEventPersistenceReturn {
    event: FlattenedEvent | undefined;
    loading: boolean;
    updateField: (fieldId: string, value: any) => void;
    updateFields: (fields: Record<string, any>) => Promise<void>;
    createEvent: (event: FlattenedEvent) => Promise<void>;
}

export function useEventPersistence(
    options: UseEventPersistenceOptions,
): UseEventPersistenceReturn {
    const { eventId, debounceMs = 100 } = options;
    const { data: event } = useLiveSuspenseQuery((q) =>
        q
            .from({ events: eventsCollection })
            .where(({ events }) => eq(events.event, eventId))
            .findOne(),
    );

    const { updateField, updateFields } = useBatchQueue({
        entityId: eventId,
        debounceMs,
        onFlush: async (id, updates) => {
            const tx = eventsCollection.update(id, (draft) => {
                draft.dataValues = {
                    ...draft.dataValues,
                    ...updates,
                };
            });
            await tx.isPersisted.promise;
        },
    });

    const createEvent = useCallback(async (newEvent: FlattenedEvent) => {
        try {
            const tx = eventsCollection.insert(newEvent);
            await tx.isPersisted.promise;
        } catch (error) {
            console.error(`Failed to create event:`, error);
            throw error;
        }
    }, []);

    return {
        event,
        loading: event === undefined,
        updateField,
        updateFields,
        createEvent,
    };
}
