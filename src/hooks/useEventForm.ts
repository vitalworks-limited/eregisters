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

    const { ruleResult, triggerAutoExecute, executeAndApplyRules } =
        useProgramRulesWithDexie({
            form,
            programRules,
            programRuleVariables,
            programStage: programStageId,
            trackedEntityAttributes: trackedEntity.attributes,
            onAssignments: updateFields,
            applyAssignmentsToForm: true,
            persistAssignments: true,
            program: programId,
            autoExecute: true,
            previousEvents,
            allowedDataElements,
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
