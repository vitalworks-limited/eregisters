import { useDataEngine } from "@dhis2/app-runtime";
import { useEffect, useState } from "react";
import { assertAdminOverviewSafeRequest } from "./adminSafeQueryGuard";

/**
 * One-shot fetch of every DHIS2 user with their org-unit assignments
 * and lastLogin so the Dashboard map and table can show the real
 * "logged in now" count without relying on the cached summary feed.
 *
 * Why this is safe: `/api/users` is metadata, not tracker data. We
 * request id, disabled, lastLogin and the org-unit ids — a few
 * kilobytes per thousand users. The Admin Overview safe-query guard
 * explicitly permits this resource.
 */
export interface UsersByOrgUnit {
    /** Count of users (including disabled) assigned to each org-unit id. */
    totalById: Map<string, number>;
    /** Count of users assigned and **not** disabled. */
    activeById: Map<string, number>;
    /** Count of users with `lastLogin` within the recent window. */
    recentLoginsById: Map<string, number>;
    /** The recent window applied (minutes). */
    recentWindowMinutes: number;
}

interface UserRow {
    id: string;
    disabled?: boolean;
    lastLogin?: string;
    organisationUnits?: Array<{ id: string }>;
}

interface UsersResponse {
    list: {
        users?: UserRow[];
    };
}

const DEFAULT_RECENT_WINDOW_MINUTES = 60;

export function useUsersByOrgUnit(
    recentWindowMinutes: number = DEFAULT_RECENT_WINDOW_MINUTES,
): {
    counts: UsersByOrgUnit;
    loading: boolean;
    error?: string;
} {
    const engine = useDataEngine();
    const [counts, setCounts] = useState<UsersByOrgUnit>({
        totalById: new Map(),
        activeById: new Map(),
        recentLoginsById: new Map(),
        recentWindowMinutes,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        let cancelled = false;
        const resource = "users";
        try {
            assertAdminOverviewSafeRequest(
                `/api/${resource}?fields=id,disabled,lastLogin,organisationUnits[id]`,
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
                            fields:
                                "id,disabled,lastLogin,organisationUnits[id]",
                            paging: "false",
                        },
                    },
                })) as unknown as UsersResponse;
                const total = new Map<string, number>();
                const active = new Map<string, number>();
                const recent = new Map<string, number>();
                const recentCutoff =
                    Date.now() - recentWindowMinutes * 60_000;
                for (const u of r.list?.users ?? []) {
                    const isRecent =
                        !!u.lastLogin &&
                        new Date(u.lastLogin).getTime() >= recentCutoff;
                    for (const ou of u.organisationUnits ?? []) {
                        total.set(ou.id, (total.get(ou.id) ?? 0) + 1);
                        if (!u.disabled) {
                            active.set(
                                ou.id,
                                (active.get(ou.id) ?? 0) + 1,
                            );
                        }
                        if (isRecent && !u.disabled) {
                            recent.set(
                                ou.id,
                                (recent.get(ou.id) ?? 0) + 1,
                            );
                        }
                    }
                }
                if (!cancelled)
                    setCounts({
                        totalById: total,
                        activeById: active,
                        recentLoginsById: recent,
                        recentWindowMinutes,
                    });
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
    }, [engine, recentWindowMinutes]);

    return { counts, loading, error };
}
