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
