import { FormInstance } from "antd";
import { useCallback, useRef } from "react";
import { useEventPersistence } from "./useEventPersistence";
import { useProgramRulesExecutor } from "./useProgramRulesExecutor";
import {
    FlattenedEvent,
    ProgramRule,
    ProgramRuleVariable,
} from "../schemas";

interface UseEventFormOptions {
    form: FormInstance;
    event: FlattenedEvent;
    trackedEntityId: string;
    programStageId: string;
    programRules: ProgramRule[];
    programRuleVariables: ProgramRuleVariable[];
    programId: string;
    allowedDataElements?: Set<string>;
    // Pass data from parent to avoid queries
    trackedEntityAttributes?: Record<string, any>;
    previousEvents?: FlattenedEvent[];
}

export function useEventForm({
    form,
    event,
    trackedEntityId,
    programStageId,
    programRules,
    programRuleVariables,
    programId,
    allowedDataElements,
    trackedEntityAttributes,
    previousEvents,
}: UseEventFormOptions) {
    const { updateField, updateFields, event: entity } = useEventPersistence({
        eventId: event.event,
        debounceMs: 150, // Unified debounce for DB persistence
    });

    const { ruleResult, executeRules, setRuleResult } =
        useProgramRulesExecutor({
            programRules,
            programRuleVariables,
            programStage: programStageId,
            program: programId,
            trackedEntityAttributes,
            previousEvents,
        });

    const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
    const batchQueueRef = useRef<Record<string, any>>({});

    /**
     * Unified field change handler - executes rules synchronously and batches DB updates.
     *
     * Flow:
     * 1. Update form state immediately
     * 2. Execute program rules synchronously with updated data
     * 3. Apply rule assignments to form
     * 4. Batch all updates (user input + rule assignments) for DB persistence
     */
    const handleFieldChange = useCallback(
        (fieldId: string, value: any) => {
            // 1. Update form immediately for responsive UI
            form.setFieldValue(fieldId, value);

            // 2. Get current form data with the new value
            const currentData = form.getFieldsValue();

            // 3. Execute rules synchronously (no debounce, no hooks)
            const result = executeRules(currentData);

            // 4. Filter assignments based on allowed data elements
            const filteredAssignments = allowedDataElements
                ? Object.fromEntries(
                      Object.entries(result.assignments).filter(([k]) =>
                          allowedDataElements.has(k),
                      ),
                  )
                : result.assignments;

            // 5. Apply rule assignments to form immediately
            if (Object.keys(filteredAssignments).length > 0) {
                form.setFieldsValue(filteredAssignments);
            }

            // 6. Clear hidden fields from form
            if (result.hiddenFields.length > 0) {
                const fieldsToClear: Record<string, any> = {};
                result.hiddenFields.forEach((hiddenFieldId) => {
                    const currentValue = currentData[hiddenFieldId];
                    if (
                        currentValue !== undefined &&
                        currentValue !== null &&
                        currentValue !== ""
                    ) {
                        fieldsToClear[hiddenFieldId] = undefined;
                        form.setFieldValue(hiddenFieldId, undefined);
                    }
                });

                // Add cleared fields to batch queue
                Object.assign(batchQueueRef.current, fieldsToClear);
            }

            // 7. Queue all updates for batched DB persistence
            batchQueueRef.current[fieldId] = value;
            Object.assign(batchQueueRef.current, filteredAssignments);

            // 8. Debounce DB update (single unified timer)
            if (batchTimerRef.current) {
                clearTimeout(batchTimerRef.current);
            }

            batchTimerRef.current = setTimeout(() => {
                const updates = { ...batchQueueRef.current };
                batchQueueRef.current = {};

                // Single atomic DB update with all changes
                if (Object.keys(updates).length > 0) {
                    updateFields(updates);
                }
            }, 150);
        },
        [
            form,
            executeRules,
            updateFields,
            allowedDataElements,
        ],
    );

    /**
     * Execute rules and apply assignments without field change.
     * Useful for initial form load or manual rule execution.
     */
    const executeAndApplyRules = useCallback(
        async (providedDataValues?: Record<string, any>) => {
            const currentData = providedDataValues || form.getFieldsValue();
            const result = executeRules(currentData);

            const filteredAssignments = allowedDataElements
                ? Object.fromEntries(
                      Object.entries(result.assignments).filter(([k]) =>
                          allowedDataElements.has(k),
                      ),
                  )
                : result.assignments;

            // Apply to form
            if (Object.keys(filteredAssignments).length > 0) {
                form.setFieldsValue(filteredAssignments);
            }

            // Clear hidden fields
            if (result.hiddenFields.length > 0) {
                const fieldsToClear: Record<string, any> = {};
                result.hiddenFields.forEach((fieldId) => {
                    const value = currentData[fieldId];
                    if (value !== undefined && value !== null && value !== "") {
                        fieldsToClear[fieldId] = undefined;
                    }
                });

                if (Object.keys(fieldsToClear).length > 0) {
                    form.setFieldsValue(fieldsToClear);
                }

                // Persist cleared fields and assignments
                await updateFields({
                    ...filteredAssignments,
                    ...fieldsToClear,
                });
            } else if (Object.keys(filteredAssignments).length > 0) {
                // Persist assignments only
                await updateFields(filteredAssignments);
            }

            return filteredAssignments;
        },
        [form, executeRules, updateFields, allowedDataElements],
    );

    return {
        ruleResult,
        handleFieldChange, // New unified handler
        updateField, // Direct DB update without rules (for edge cases)
        entity,
        executeAndApplyRules,
        setRuleResult, // Allow manual rule result updates if needed
    };
}
