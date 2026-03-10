import type { ProgramRuleResult, RuleResult } from "../schemas";

/**
 * Serialize ProgramRuleResult for DB storage
 * No conversion needed - runtime structure matches DB structure
 */
export function serializeRuleResult(
    result: ProgramRuleResult,
): Omit<
    RuleResult,
    "id" | "eventId" | "formType" | "updatedAt" | "version" | "trackedEntityId"
> {
    return {
        assignments: result.assignments,
        hiddenFields: result.hiddenFields,
        shownFields: result.shownFields,
        hiddenSections: result.hiddenSections,
        shownSections: result.shownSections,
        hiddenOptions: result.hiddenOptions,
        shownOptions: result.shownOptions,
        hiddenOptionGroups: result.hiddenOptionGroups || {},
        shownOptionGroups: result.shownOptionGroups || {},
        errors: result.errors,
        warnings: result.warnings,
        messages: result.messages,
    };
}

/**
 * Deserialize DB RuleResult back to ProgramRuleResult
 * No conversion needed - runtime structure matches DB structure
 */
export function deserializeRuleResult(stored: RuleResult): ProgramRuleResult {
    return {
        assignments: stored.assignments,
        hiddenFields: stored.hiddenFields,
        shownFields: stored.shownFields,
        hiddenSections: stored.hiddenSections,
        shownSections: stored.shownSections,
        hiddenOptions: stored.hiddenOptions,
        shownOptions: stored.shownOptions,
        hiddenOptionGroups: stored.hiddenOptionGroups || {},
        shownOptionGroups: stored.shownOptionGroups || {},
        errors: stored.errors,
        warnings: stored.warnings,
        messages: stored.messages,
    };
}

/**
 * Generate stable ID for rule result
 * Format: ${eventId}_${formType}
 */
export function getRuleResultId(
    eventId: string,
    formType: "main" | "stage" | "registration",
): string {
    return `${eventId}_${formType}`;
}
