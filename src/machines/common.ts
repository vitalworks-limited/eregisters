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
        const assignmentsToApply: Record<string, any> = {};
        Object.entries(ruleResult.assignments).forEach(([key, value]) => {
            const hasNewValue =
                value !== null && value !== undefined && value !== "";
            // form.getFieldValue reads directly from the internal store,
            // so it sees values set by setFieldsValue even before Form.Item
            // fields have registered (which happens later in useEffect).
            const currentValue = form.getFieldValue(key);
            const hasCurrentValue =
                currentValue !== undefined &&
                currentValue !== null &&
                currentValue !== "";
            // Apply assignment only if it has a real value, or the field is
            // currently empty (so empty assignments don't wipe existing values).
            if (hasNewValue || !hasCurrentValue) {
                assignmentsToApply[key] = value;
            }
        });
        if (Object.keys(assignmentsToApply).length > 0) {
            form.setFieldsValue(assignmentsToApply);
        }
    }
    if (ruleResult && ruleResult.hiddenFields.length > 0) {
        const fieldsToClear: Record<string, any> = {};
        ruleResult.hiddenFields.forEach((hiddenFieldId) => {
            // Use getFieldValue (store-level) rather than getFieldsValue
            // so we can read values set via setFieldsValue before fields register.
            const currentValue = form.getFieldValue(hiddenFieldId);
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
