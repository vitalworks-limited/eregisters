import { eq, useLiveSuspenseQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { ruleResultsCollection } from "../collections/rule-results";
import { ProgramRuleResult } from "../schemas";
import { createEmptyProgramRuleResult } from "../utils/utils";

interface UseRuleResultPersistenceOptions {
    formType: "main" | "stage" | "registration" | "child";
}

export function useRuleResultPersistence({
    formType,
}: UseRuleResultPersistenceOptions) {
    const { data: storedResult } = useLiveSuspenseQuery((q) =>
        q
            .from({ ruleResults: ruleResultsCollection })
            .where(({ ruleResults }) => eq(ruleResults.id, formType))
            .findOne(),
    );
    const saveRuleResult = async (results: ProgramRuleResult) => {
        await ruleResultsCollection.utils.bulkInsertLocally([
            { ...results, id: formType },
        ]);
    };

    return {
        ruleResult: storedResult ?? createEmptyProgramRuleResult(),
        saveRuleResult,
    };
}
