import { ProgramRuleResult } from "../schemas";

export type FormEvent =
    | { type: "FIELD_CHANGED"; formData: Record<string, any> }
    | { type: "EXECUTE_RULES" }
    | { type: "RULES_COMPLETE"; result: ProgramRuleResult }
    | { type: "PERSIST_COMPLETE" }
    | { type: "RESET" };
