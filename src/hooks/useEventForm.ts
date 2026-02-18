import { FormInstance } from "antd";
import { useCallback } from "react";
import { useDexiePersistence } from "./useDexiePersistence";
import { useProgramRulesWithDexie } from "./useProgramRules";
import {
    FlattenedEvent,
    FlattenedTrackedEntity,
    ProgramRule,
    ProgramRuleVariable,
} from "../schemas";

interface UseEventFormOptions {
    form: FormInstance;
    event: FlattenedEvent;
    trackedEntity: FlattenedTrackedEntity;
    programStageId: string;
    programRules: ProgramRule[];
    programRuleVariables: ProgramRuleVariable[];
    programId: string;
    previousEvents?: FlattenedEvent[];
    allowedDataElements?: Set<string>;
}

export function useEventForm({
    form,
    event,
    trackedEntity,
    programStageId,
    programRules,
    programRuleVariables,
    programId,
    previousEvents,
    allowedDataElements,
}: UseEventFormOptions) {
    const { updateField, updateFields, entity } =
        useDexiePersistence<FlattenedEvent>({
            entityType: "event",
            entityId: event.event,
            debounceMs: 100,
        });

    const filteredUpdateFields = useCallback(
        async (fields: Record<string, any>) => {
            if (!allowedDataElements) return updateFields(fields);
            const filtered = Object.fromEntries(
                Object.entries(fields).filter(([key]) =>
                    allowedDataElements.has(key),
                ),
            );
            if (Object.keys(filtered).length > 0) return updateFields(filtered);
        },
        [updateFields, allowedDataElements],
    );

    const { ruleResult, triggerAutoExecute, executeAndApplyRules } =
        useProgramRulesWithDexie({
            form,
            programRules,
            programRuleVariables,
            programStage: programStageId,
            trackedEntityAttributes: trackedEntity.attributes,
            onAssignments: filteredUpdateFields,
            applyAssignmentsToForm: true,
            persistAssignments: true,
            program: programId,
            autoExecute: true,
            previousEvents,
        });

    const updateFieldWithRules = useCallback(
        (fieldId: string, value: any) => {
            updateField(fieldId, value);
            triggerAutoExecute();
        },
        [updateField, triggerAutoExecute],
    );

    return {
        ruleResult,
        updateFieldWithRules,
        entity,
        triggerAutoExecute,
        executeAndApplyRules,
    };
}
