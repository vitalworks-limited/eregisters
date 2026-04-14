import { FormInstance } from "antd";
import { ProgramRuleResult } from "../schemas";

export type FormEvent =
    | { type: "FIELD_CHANGED"; formData: Record<string, any> }
    | { type: "EXECUTE_RULES" }
    | { type: "RULES_COMPLETE"; result: ProgramRuleResult }
    | { type: "PERSIST_COMPLETE" }
    | { type: "RESET" };

export function applyRuleResultsToForm(
    ruleResult: ProgramRuleResult,
    form: FormInstance,
): { previousAssignments: Record<string, any> } {
    if (ruleResult && Object.keys(ruleResult.assignments).length > 0) {
        form.setFieldsValue(ruleResult.assignments);
    }
    if (ruleResult && ruleResult.hiddenFields.length > 0) {
        const currentData = form.getFieldsValue();
        const fieldsToClear: Record<string, any> = {};
        ruleResult.hiddenFields.forEach((hiddenFieldId) => {
            const currentValue = currentData[hiddenFieldId];
            if (
                currentValue !== undefined &&
                currentValue !== null &&
                currentValue !== ""
            ) {
                fieldsToClear[hiddenFieldId] = undefined;
            }
        });
        if (Object.keys(fieldsToClear).length > 0) {
            form.setFieldsValue(fieldsToClear);
        }
    }
    return { previousAssignments: { ...ruleResult.assignments } };
}
