import { useDataEngine } from "@dhis2/app-runtime";
import { useEffect, useState } from "react";
import { PROGRAM_UID } from "../sync/config";
import { assertAdminOverviewSafeRequest } from "./adminSafeQueryGuard";

/**
 * Accurate program-wide totals for the Dashboard cards.
 *
 * Why a separate hook: the cached summary feed may not yet exist in
 * the dataStore. To avoid showing zeros that look like real data, we
 * issue **count-only** tracker probes (`pageSize=1&totalPages=true`)
 * — single small requests that return just the total in the response
 * metadata. The safe-query guard explicitly tolerates this pattern.
 */
export interface ProgramTotals {
    registeredClients?: number;
    totalEnrollments?: number;
    totalEvents?: number;
}

interface ProbeResponse {
    page?: { total?: number };
    pager?: { total?: number };
    total?: number;
}

function extractTotal(r: ProbeResponse): number | undefined {
    return r?.pager?.total ?? r?.page?.total ?? r?.total;
}

export function useProgramTotals(
    rootOrgUnitId: string | undefined,
): {
    totals: ProgramTotals;
    loading: boolean;
    error?: string;
} {
    const engine = useDataEngine();
    const [totals, setTotals] = useState<ProgramTotals>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        if (!rootOrgUnitId) {
            setLoading(false);
            return;
        }
        let cancelled = false;

        const baseParams = {
            program: PROGRAM_UID,
            orgUnit: rootOrgUnitId,
            ouMode: "DESCENDANTS",
            pageSize: 1,
            totalPages: true,
        };

        const teUrl = `/api/tracker/trackedEntities?program=${PROGRAM_UID}&orgUnit=${rootOrgUnitId}&ouMode=DESCENDANTS&pageSize=1&totalPages=true&fields=trackedEntity`;
        const evUrl = `/api/tracker/events?program=${PROGRAM_UID}&orgUnit=${rootOrgUnitId}&ouMode=DESCENDANTS&pageSize=1&totalPages=true&fields=event`;

        try {
            assertAdminOverviewSafeRequest(teUrl);
            assertAdminOverviewSafeRequest(evUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
            return;
        }

        (async () => {
            try {
                const [teRes, evRes] = await Promise.allSettled([
                    engine.query({
                        te: {
                            resource: "tracker/trackedEntities",
                            params: { ...baseParams, fields: "trackedEntity" },
                        },
                    }),
                    engine.query({
                        ev: {
                            resource: "tracker/events",
                            params: { ...baseParams, fields: "event" },
                        },
                    }),
                ]);
                const next: ProgramTotals = {};
                if (teRes.status === "fulfilled") {
                    next.registeredClients = extractTotal(
                        (teRes.value as { te?: ProbeResponse }).te ?? {},
                    );
                }
                if (evRes.status === "fulfilled") {
                    next.totalEvents = extractTotal(
                        (evRes.value as { ev?: ProbeResponse }).ev ?? {},
                    );
                }
                if (!cancelled) setTotals(next);
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
    }, [engine, rootOrgUnitId]);

    return { totals, loading, error };
}
