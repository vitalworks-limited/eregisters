import { FormInstance } from "antd";
import { debounce } from "lodash";
import { useCallback, useMemo } from "react";
import { ProgramRule, ProgramRuleVariable } from "../schemas";
import { executeProgramRules } from "../utils/utils";

interface UseFieldChangeHandlerOptions {
    form: FormInstance<any>;
    programRules: ProgramRule[];
    programRuleVariables: ProgramRuleVariable[];
    programId: string;
    programStageId?: string;
    saveRuleResult: (result: any) => void;
    onSave: (data: Record<string, any>) => void;
    debounceMs?: number;
    attributeValues?: Record<string, any>;
    previousEvents?: any[];
}

/**
 * Custom hook for handling field changes with two-pass program rules execution and debounced saving.
 *
 * This hook encapsulates the complex logic of:
 * 1. Updating form field values
 * 2. Executing program rules with user input (Pass 1)
 * 3. Applying calculated assignments
 * 4. Re-executing program rules with calculated values (Pass 2) to handle dependent calculations
 * 5. Clearing hidden fields
 * 6. Debounced database persistence
 *
 * Two-pass execution handles dependency chains like: DOB ’ Age ’ Age in months ’ Z-scores
 *
 * @param options Configuration options
 * @returns handleFieldChange callback function
 */
export function useFieldChangeHandler(options: UseFieldChangeHandlerOptions) {
    const {
        form,
        programRules,
        programRuleVariables,
        programId,
        programStageId,
        saveRuleResult,
        onSave,
        debounceMs = 500,
        attributeValues = {},
        previousEvents = [],
    } = options;

    // Debounced save to database (500ms delay by default)
    const debouncedSave = useMemo(
        () =>
            debounce((currentData: Record<string, any>) => {
                onSave(currentData);
            }, debounceMs),
        [onSave, debounceMs],
    );

    const handleFieldChange = useCallback(
        (fieldId: string, value: any) => {
            form.setFieldValue(fieldId, value);
            let currentData = form.getFieldsValue();

            // PASS 1: Execute program rules with user input
            let result = executeProgramRules({
                programRules,
                programRuleVariables,
                ...(programStageId
                    ? {
                          dataValues: currentData,
                          attributeValues: attributeValues,
                          programStage: programStageId,
                          previousEvents: previousEvents,
                      }
                    : { attributeValues: currentData }),
                program: programId,
            });

            // Apply first-level assignments (all assignments, no filtering)
            if (Object.keys(result.assignments).length > 0) {
                form.setFieldsValue(result.assignments);
                currentData = { ...currentData, ...result.assignments };

                // PASS 2: Execute rules again with calculated values
                // This handles dependent calculations (e.g., Age ’ Age in months ’ Z-scores)
                result = executeProgramRules({
                    programRules,
                    programRuleVariables,
                    ...(programStageId
                        ? {
                              dataValues: currentData,
                              attributeValues: attributeValues,
                              programStage: programStageId,
                              previousEvents: previousEvents,
                          }
                        : { attributeValues: currentData }),
                    program: programId,
                });

                // Apply second-level assignments
                if (Object.keys(result.assignments).length > 0) {
                    form.setFieldsValue(result.assignments);
                    currentData = { ...currentData, ...result.assignments };
                }
            }

            // Save final result
            saveRuleResult(result);

            // Clear hidden fields (only once at the end)
            if (result.hiddenFields.length > 0) {
                result.hiddenFields.forEach((hiddenFieldId) => {
                    const currentValue = currentData[hiddenFieldId];
                    if (
                        currentValue !== undefined &&
                        currentValue !== null &&
                        currentValue !== ""
                    ) {
                        form.setFieldValue(hiddenFieldId, undefined);
                        currentData = {
                            ...currentData,
                            [hiddenFieldId]: undefined,
                        };
                    }
                });
            }

            // Debounced save to database with all calculated values
            debouncedSave(currentData);
        },
        [
            form,
            programRules,
            programRuleVariables,
            programId,
            programStageId,
            attributeValues,
            previousEvents,
            saveRuleResult,
            debouncedSave,
        ],
    );

    return { handleFieldChange };
}
