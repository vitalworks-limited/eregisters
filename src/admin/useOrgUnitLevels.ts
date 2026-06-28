import { useDataEngine } from "@dhis2/app-runtime";
import { useEffect, useState } from "react";
import { assertAdminOverviewSafeRequest } from "./adminSafeQueryGuard";

/** A single org-unit level in the DHIS2 hierarchy (e.g. "Region", "District"). */
export interface OrgUnitLevel {
    id: string;
    displayName: string;
    level: number;
}

interface LevelResponse {
    levels: {
        organisationUnitLevels?: Array<{
            id: string;
            displayName: string;
            level: number;
        }>;
    };
}

/**
 * Reads the DHIS2 organisation-unit levels metadata so the dashboard
 * can label filters by their real names ("Region", "District",
 * "Subcounty", …) instead of guessing.
 */
export function useOrgUnitLevels(): {
    levels: OrgUnitLevel[];
    loading: boolean;
    error?: string;
} {
    const engine = useDataEngine();
    const [levels, setLevels] = useState<OrgUnitLevel[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        let cancelled = false;
        const resource = "organisationUnitLevels";
        try {
            assertAdminOverviewSafeRequest(`/api/${resource}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
            return;
        }

        (async () => {
            try {
                const r = (await engine.query({
                    levels: {
                        resource,
                        params: {
                            fields: "id,displayName,level",
                            order: "level:asc",
                            paging: "false",
                        },
                    },
                })) as unknown as LevelResponse;
                const list = r.levels?.organisationUnitLevels ?? [];
                if (!cancelled) setLevels(list);
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error ? err.message : String(err),
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [engine]);

    return { levels, loading, error };
}
