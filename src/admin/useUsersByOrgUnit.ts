import { useDataEngine } from "@dhis2/app-runtime";
import { useEffect, useState } from "react";
import { assertAdminOverviewSafeRequest } from "./adminSafeQueryGuard";

/**
 * One-shot fetch of every DHIS2 user with their org-unit assignments
 * so the Dashboard table can show the **real** user count per
 * facility instead of relying on the cached summary.
 *
 * Why this is safe: `/api/users` is metadata, not tracker data. We
 * request only `id` and `organisationUnits[id]` — a few kilobytes per
 * thousand users. The Admin Overview safe-query guard explicitly
 * permits this resource.
 */
export interface UsersByOrgUnit {
    /** Count of users (including disabled) assigned to each org-unit id. */
    totalById: Map<string, number>;
    /** Count of users assigned and **not** disabled. */
    activeById: Map<string, number>;
}

interface UserRow {
    id: string;
    disabled?: boolean;
    organisationUnits?: Array<{ id: string }>;
}

interface UsersResponse {
    list: {
        users?: UserRow[];
    };
}

export function useUsersByOrgUnit(): {
    counts: UsersByOrgUnit;
    loading: boolean;
    error?: string;
} {
    const engine = useDataEngine();
    const [counts, setCounts] = useState<UsersByOrgUnit>({
        totalById: new Map(),
        activeById: new Map(),
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        let cancelled = false;
        const resource = "users";
        try {
            assertAdminOverviewSafeRequest(
                `/api/${resource}?fields=id,disabled,organisationUnits[id]`,
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
            return;
        }

        (async () => {
            try {
                const r = (await engine.query({
                    list: {
                        resource,
                        params: {
                            fields: "id,disabled,organisationUnits[id]",
                            paging: "false",
                        },
                    },
                })) as unknown as UsersResponse;
                const total = new Map<string, number>();
                const active = new Map<string, number>();
                for (const u of r.list?.users ?? []) {
                    for (const ou of u.organisationUnits ?? []) {
                        total.set(ou.id, (total.get(ou.id) ?? 0) + 1);
                        if (!u.disabled) {
                            active.set(
                                ou.id,
                                (active.get(ou.id) ?? 0) + 1,
                            );
                        }
                    }
                }
                if (!cancelled)
                    setCounts({ totalById: total, activeById: active });
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

    return { counts, loading, error };
}
