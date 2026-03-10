import { useCallback, useMemo, useState } from "react";
import type {
    ProgramRule,
    ProgramRuleResult,
    ProgramRuleVariable,
    FlattenedEvent,
} from "../schemas";
import {
    createEmptyProgramRuleResult,
    executeProgramRules,
} from "../utils/utils";

export interface UseProgramRulesExecutorOptions {
    programRules: ProgramRule[];
    programRuleVariables: ProgramRuleVariable[];
    programStage?: string;
    program: string;
    trackedEntityId?: string;
    isRegistration?: boolean;
    // Optional: pass data directly to avoid queries
    trackedEntityAttributes?: Record<string, any>;
    previousEvents?: FlattenedEvent[];
}

export interface UseProgramRulesExecutorReturn {
    ruleResult: ProgramRuleResult;
    executeRules: (
        dataValues: Record<string, any>,
        attributeValues?: Record<string, any>,
    ) => ProgramRuleResult;
    setRuleResult: (result: ProgramRuleResult) => void;
    hasErrors: boolean;
    hasWarnings: boolean;
    hasMessages: boolean;
}

export const useProgramRulesExecutor = ({
    programRules,
    programRuleVariables,
    programStage,
    program,
    trackedEntityId,
    isRegistration = false,
    trackedEntityAttributes: providedAttributes,
    previousEvents: providedEvents,
}: UseProgramRulesExecutorOptions): UseProgramRulesExecutorReturn => {
    const [ruleResult, setRuleResult] = useState<ProgramRuleResult>(
        createEmptyProgramRuleResult(),
    );

    // Get effective attribute values and previous events
    const effectiveTrackedEntityAttributes = useMemo(() => {
        if (isRegistration) return {};
        if (providedAttributes) return providedAttributes;
        return {};
    }, [isRegistration, providedAttributes]);

    const effectivePreviousEvents = useMemo(() => {
        if (isRegistration) return [];
        if (providedEvents) return providedEvents;
        return [];
    }, [isRegistration, providedEvents]);

    /**
     * Execute program rules with provided data values.
     *
     * @param dataValues - Current form data values
     * @param attributeValues - Optional attribute values (defaults to queried data)
     * @returns Program rule execution result
     */
    const executeRules = useCallback(
        (
            dataValues: Record<string, any>,
            attributeValues?: Record<string, any>,
        ): ProgramRuleResult => {
            try {
                // For registration, attributes come from dataValues
                // For events, use provided attributeValues or fall back to queried data
                const finalAttributeValues = isRegistration
                    ? dataValues
                    : attributeValues || effectiveTrackedEntityAttributes;

                const result = executeProgramRules({
                    programRules,
                    programRuleVariables,
                    dataValues,
                    attributeValues: finalAttributeValues,
                    program,
                    programStage,
                    previousEvents: effectivePreviousEvents,
                });

                setRuleResult(result);
                return result;
            } catch (error) {
                console.error("❌ Program rules execution failed:", error);
                const emptyResult = createEmptyProgramRuleResult();
                setRuleResult(emptyResult);
                return emptyResult;
            }
        },
        [
            programRules,
            programRuleVariables,
            effectiveTrackedEntityAttributes,
            effectivePreviousEvents,
            program,
            programStage,
            isRegistration,
        ],
    );

    // Derived state
    const hasErrors = ruleResult.errors.length > 0;
    const hasWarnings = ruleResult.warnings.length > 0;
    const hasMessages = ruleResult.messages.length > 0;

    return {
        ruleResult,
        executeRules,
        setRuleResult,
        hasErrors,
        hasWarnings,
        hasMessages,
    };
};
