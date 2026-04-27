import { SyncContext } from "../machines";
import { DataElement, TrackedEntityAttribute } from "../schemas";
import { queryInfo } from "../utils/utils";

export const useMetadata = (): Awaited<ReturnType<typeof queryInfo>> => {

	const metadata = SyncContext.useSelector((a) => a.context.metadata);
    const {
        program,
        trackedEntityAttributes = new Map<string, TrackedEntityAttribute>(),
        organisations = new Map<string, string>(),
        programRuleVariables = [],
        programRules = [],
        orgUnit,
        dataElements = new Map<string, DataElement>(),
        programOrgUnits = new Set<string>(),
        optionGroups = new Map<
            string,
            Array<{
                id: string;
                name: string;
                code: string;
                optionGroup: string;
                sortOrder: number;
            }>
        >(),
        optionSets = new Map<
            string,
            Array<{
                id: string;
                name: string;
                code: string;
                optionSet: string;
                sortOrder: number;
            }>
        >(),
    } = metadata;



    if (program === undefined || orgUnit === undefined) {
        throw new Error("OrgUnit or program undefined");
    }

    return {
        trackedEntityAttributes,
        programRules,
        programRuleVariables,
        organisations,
        orgUnit,
        program,
        dataElements,
        programOrgUnits,
				optionGroups,
				optionSets
    };
};
