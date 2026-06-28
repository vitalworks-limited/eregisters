import { useDataEngine } from "@dhis2/app-runtime";
import { useEffect, useState } from "react";
import { assertAdminOverviewSafeRequest } from "./adminSafeQueryGuard";

/**
 * Total number of organisation units at each DHIS2 level for the
 * whole instance. Drives the dashboard's coverage breakdown so users
 * can see e.g. "Region: 15/15 (100%), District: 142/146 (97%),
 * Facility: 1,687/8,662 (19%)".
 *
 * Implementation: one tiny count-only request per level
 * (`pageSize=1&totalPages=true&fields=id` → only the pager metadata
 * matters). Cheap and safe — the guard wouldn't have allowed bigger
 * fetches.
 */
export function useOrgUnitCountsByLevel(levels: number[]): {
    counts: Map<number, number>;
    loading: boolean;
    error?: string;
} {
    const engine = useDataEngine();
    const [counts, setCounts] = useState<Map<number, number>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>();
    const key = levels.join(",");

    useEffect(() => {
        if (levels.length === 0) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        for (const lvl of levels) {
            assertAdminOverviewSafeRequest(
                `/api/organisationUnits?fields=id&filter=level:eq:${lvl}&pageSize=1&totalPages=true`,
            );
        }

        (async () => {
            try {
                const results = await Promise.allSettled(
                    levels.map((lvl) =>
                        engine.query({
                            ous: {
                                resource: "organisationUnits",
                                params: {
                                    fields: "id",
                                    filter: `level:eq:${lvl}`,
                                    pageSize: 1,
                                    totalPages: true,
                                },
                            },
                        }),
                    ),
                );
                const out = new Map<number, number>();
                results.forEach((r, idx) => {
                    if (r.status !== "fulfilled") return;
                    const lvl = levels[idx];
                    const payload = (
                        r.value as {
                            ous?: {
                                pager?: { total?: number };
                                page?: { total?: number };
                            };
                        }
                    ).ous;
                    const total =
                        payload?.pager?.total ?? payload?.page?.total;
                    if (typeof total === "number") out.set(lvl, total);
                });
                if (!cancelled) setCounts(out);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [engine, key]);

    return { counts, loading, error };
}
