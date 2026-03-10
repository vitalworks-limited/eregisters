import { useCallback, useEffect, useRef } from "react";

interface UseBatchQueueOptions<T> {
    /**
     * The ID of the entity being updated
     */
    entityId: string | null | undefined;

    /**
     * Debounce delay in milliseconds
     */
    debounceMs: number;

    /**
     * Flush function that persists the batched updates
     */
    onFlush: (entityId: string, updates: Record<string, any>) => Promise<void>;
}

interface UseBatchQueueReturn {
    /**
     * Queue a single field update
     */
    updateField: (fieldId: string, value: any) => void;

    /**
     * Queue multiple field updates
     */
    updateFields: (fields: Record<string, any>) => Promise<void>;

    /**
     * Manually flush the queue immediately
     */
    flush: () => Promise<void>;
}

/**
 * Custom hook for batching field updates with debouncing
 *
 * @example
 * ```tsx
 * const { updateField, updateFields } = useBatchQueue({
 *   entityId: event.event,
 *   debounceMs: 100,
 *   onFlush: async (id, updates) => {
 *     await eventsCollection.update(id, (draft) => {
 *       draft.dataValues = { ...draft.dataValues, ...updates };
 *     });
 *   }
 * });
 * ```
 */
export function useBatchQueue({
    entityId,
    debounceMs,
    onFlush,
}: UseBatchQueueOptions<any>): UseBatchQueueReturn {
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
            await onFlush(entityId, updates);
        } catch (error) {
            console.error(`❌ Failed to flush batch queue:`, error);
            throw error;
        }
    }, [entityId, onFlush]);

    const updateField = useCallback(
        (fieldId: string, value: any) => {
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
            }
            batchQueueRef.current = {
                ...batchQueueRef.current,
                ...fields,
            };
            await flush();
        },
        [flush],
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
        updateField,
        updateFields,
        flush,
    };
}
