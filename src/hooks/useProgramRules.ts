import { FormInstance } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    ProgramRule,
    ProgramRuleResult,
    ProgramRuleVariable,
} from "../schemas";
import {
    createEmptyProgramRuleResult,
    executeProgramRules,
} from "../utils/utils";

export interface UseProgramRulesOptions {
    form: FormInstance;
    programRules: ProgramRule[];
    programRuleVariables: ProgramRuleVariable[];
    programStage?: string;
    program: string;
    id?: string;
    trackedEntityAttributes?: Record<string, any>;
    previousEvents?: Array<{ dataValues: Record<string, any> }>;
    debounceMs?: number;
    autoExecute?: boolean;
    isRegistration?: boolean;
}

export interface UseProgramRulesReturn {
    ruleResult: ProgramRuleResult;
    executeRules: (dataValues?: Record<string, any>) => ProgramRuleResult;
    triggerAutoExecute: () => void;
    isExecuting: boolean;
    hasErrors: boolean;
    hasWarnings: boolean;
    hasMessages: boolean;
}

export const useProgramRules = ({
    form,
    programRules,
    programRuleVariables,
    programStage,
    program,
    id,
    trackedEntityAttributes = {},
    previousEvents = [],
    debounceMs = 500,
    autoExecute = false,
    isRegistration = false,
}: UseProgramRulesOptions): UseProgramRulesReturn => {
    const [ruleResult, setRuleResult] = useState<ProgramRuleResult>(
        createEmptyProgramRuleResult(),
    );
    const [isExecuting, setIsExecuting] = useState(false);

    // Use provided data instead of querying
    const effectiveTrackedEntityAttributes = trackedEntityAttributes;
    const effectivePreviousEvents = previousEvents;

    const executeRules = useCallback(
        (providedDataValues?: Record<string, any>): ProgramRuleResult => {
            setIsExecuting(true);
            try {
                const dataValues = providedDataValues || form.getFieldsValue();
                const attributeValues = isRegistration
                    ? dataValues
                    : effectiveTrackedEntityAttributes;
                const result = executeProgramRules({
                    programRules,
                    programRuleVariables,
                    dataValues,
                    attributeValues,
                    program,
                    programStage,
                    previousEvents: effectivePreviousEvents,
                });

                setRuleResult(result);
                setIsExecuting(false);

                return result;
            } catch (error) {
                console.error("❌ Program rules execution failed:", error);
                setIsExecuting(false);
                return createEmptyProgramRuleResult();
            }
        },
        [
            form,
            programRules,
            programRuleVariables,
            effectiveTrackedEntityAttributes,
            effectivePreviousEvents,
            program,
            programStage,
            isRegistration,
        ],
    );

    const lastExecutedValuesRef = useRef<string>("");
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * Trigger function that can be called manually or automatically
     * This is exposed so DataElementField can call it on field changes
     */
    const triggerAutoExecute = useCallback(() => {
        if (!autoExecute) return;

        const dataValues = form.getFieldsValue();
        // For registration, attributes come from form values
        // For events, attributes come from TanStack DB query
        const attributeValues = isRegistration
            ? dataValues
            : effectiveTrackedEntityAttributes;

        const valuesString = JSON.stringify({
            data: dataValues,
            attributes: attributeValues,
        });

        // Skip if values haven't changed
        if (lastExecutedValuesRef.current === valuesString) {
            return;
        }

        lastExecutedValuesRef.current = valuesString;

        // Clear existing timer
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }

        // Start debounce timer
        timerRef.current = setTimeout(() => {
            executeRules();
        }, debounceMs);
    }, [
        autoExecute,
        form,
        isRegistration,
        effectiveTrackedEntityAttributes,
        executeRules,
        debounceMs,
    ]);

    /**
     * Auto-execute rules when dependencies change
     * This catches changes to tracked entity data from TanStack DB
     */
    useEffect(() => {
        if (!autoExecute) return;
        triggerAutoExecute();
    }, [
        autoExecute,
        effectiveTrackedEntityAttributes,
        effectivePreviousEvents,
        triggerAutoExecute,
    ]);

    // Derived state
    const hasErrors = ruleResult.errors.length > 0;
    const hasWarnings = ruleResult.warnings.length > 0;
    const hasMessages = ruleResult.messages.length > 0;

    return {
        ruleResult,
        executeRules,
        triggerAutoExecute,
        isExecuting,
        hasErrors,
        hasWarnings,
        hasMessages,
    };
};

export interface UseProgramRulesWithDexieOptions extends UseProgramRulesOptions {
    onAssignments?: (assignments: Record<string, any>) => Promise<void>;
    applyAssignmentsToForm?: boolean;
    persistAssignments?: boolean;
    clearHiddenFields?: boolean;
    allowedDataElements?: Set<string>;
}

export interface UseProgramRulesWithDexieReturn extends UseProgramRulesReturn {
    executeAndApplyRules: (
        dataValues?: Record<string, any>,
        maxIterations?: number,
    ) => Promise<Record<string, any>>;
}

export const useProgramRulesWithDexie = ({
    form,
    programRules,
    programRuleVariables,
    programStage,
    program,
    id,
    trackedEntityAttributes = {},
    previousEvents = [],
    debounceMs = 500,
    autoExecute = false,
    onAssignments,
    applyAssignmentsToForm = true,
    persistAssignments = false,
    clearHiddenFields = false,
    isRegistration = false,
    allowedDataElements,
}: UseProgramRulesWithDexieOptions): UseProgramRulesWithDexieReturn => {
    const basicRules = useProgramRules({
        form,
        programRules,
        programRuleVariables,
        programStage,
        program,
        id,
        trackedEntityAttributes,
        previousEvents,
        debounceMs,
        autoExecute,
        isRegistration,
    });

    const executeAndApplyRules = useCallback(
        async (providedDataValues?: Record<string, any>) => {
            let allAssignments: Record<string, any> = {};
            const currentValues = providedDataValues || form.getFieldsValue();
            const result = basicRules.executeRules(currentValues);
            if (clearHiddenFields && result.hiddenFields.length > 0) {
                const fieldsToClear: Record<string, any> = {};
                result.hiddenFields.forEach((fieldId) => {
                    if (
                        currentValues[fieldId] !== undefined &&
                        currentValues[fieldId] !== null &&
                        currentValues[fieldId] !== ""
                    ) {
                        fieldsToClear[fieldId] = undefined;
                    }
                });

                if (Object.keys(fieldsToClear).length > 0) {
                    form.setFieldsValue(fieldsToClear);
                    if (onAssignments) {
                        try {
                            await onAssignments(fieldsToClear);
                        } catch (error) {
                            console.error(
                                "Failed to clear hidden fields from Dexie:",
                                error,
                            );
                        }
                    }
                }
            }
            const filteredAssignments = allowedDataElements
                ? Object.fromEntries(
                      Object.entries(result.assignments).filter(([k]) =>
                          allowedDataElements.has(k),
                      ),
                  )
                : result.assignments;
            allAssignments = { ...allAssignments, ...filteredAssignments };
            if (applyAssignmentsToForm) {
                form.setFieldsValue(filteredAssignments);
            }
            if (persistAssignments && onAssignments) {
                try {
                    await onAssignments(filteredAssignments);
                } catch (error) {
                    console.error("Failed to persist assignments:", error);
                }
            }
            return allAssignments;
        },
        [
            basicRules,
            form,
            applyAssignmentsToForm,
            persistAssignments,
            onAssignments,
            clearHiddenFields,
            allowedDataElements,
        ],
    );

    return {
        ...basicRules,
        executeAndApplyRules,
        triggerAutoExecute: basicRules.triggerAutoExecute,
    };
};

export function useFieldVisibility(
    fieldId: string,
    ruleResult: ProgramRuleResult,
): boolean {
    return useMemo(() => {
        if (ruleResult.hiddenFields.includes(fieldId)) {
            return false;
        }
        if (ruleResult.shownFields.includes(fieldId)) {
            return true;
        }
        return true;
    }, [fieldId, ruleResult]);
}

export function useSectionVisibility(
    sectionId: string,
    ruleResult: ProgramRuleResult,
): boolean {
    return useMemo(() => {
        if (ruleResult.hiddenSections.includes(sectionId)) {
            return false;
        }

        if (ruleResult.shownSections.includes(sectionId)) {
            return true;
        }

        return true;
    }, [sectionId, ruleResult]);
}

export function useFilteredOptions<T extends { id: string }>(
    fieldId: string,
    allOptions: T[] = [],
    ruleResult: ProgramRuleResult,
): T[] {
    return useMemo(() => {
        const hiddenOptions = ruleResult.hiddenOptions[fieldId];
        const shownOptions = ruleResult.shownOptions[fieldId];
        if (!hiddenOptions && !shownOptions) {
            return allOptions;
        }

        return allOptions.filter((option) => {
            if (hiddenOptions?.includes(option.id)) {
                return false;
            }

            if (shownOptions && shownOptions.length > 0) {
                return shownOptions.includes(option.id);
            }

            return true;
        });
    }, [fieldId, allOptions, ruleResult]);
}
