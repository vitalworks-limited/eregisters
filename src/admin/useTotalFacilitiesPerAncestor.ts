import { useDataEngine } from "@dhis2/app-runtime";
import { useEffect, useState } from "react";
import { assertAdminOverviewSafeRequest } from "./adminSafeQueryGuard";

/**
 * One-shot fetch of every leaf org unit (at the maximum DHIS2 level)
 * with its ancestor chain, so the Dashboard can compute the *total*
 * facility count under each polygon. The result drives the
 * "enrolled / total" coverage ratio displayed on the Coverage Map
 * choropleth.
 *
 * This is metadata only — id + ancestors[id]. A few KB per thousand
 * facilities. The safe-query guard explicitly allows it.
 */
export interface TotalsPerAncestor {
    /** Number of leaf facilities under each ancestor id. */
    countByAncestorId: Map<string, number>;
    /** Total leaf facilities in the instance. */
    grandTotal: number;
}

interface FacilityResponse {
    list: {
        organisationUnits?: Array<{
            id: string;
            ancestors?: Array<{ id: string }>;
        }>;
    };
}

export function useTotalFacilitiesPerAncestor(
    facilityLevel: number | undefined,
): {
    totals: TotalsPerAncestor;
    loading: boolean;
    error?: string;
} {
    const engine = useDataEngine();
    const [totals, setTotals] = useState<TotalsPerAncestor>({
        countByAncestorId: new Map(),
        grandTotal: 0,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        if (!facilityLevel) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        const resource = "organisationUnits";
        const params = {
            fields: "id,ancestors[id]",
            filter: `level:eq:${facilityLevel}`,
            paging: "false",
        };
        try {
            assertAdminOverviewSafeRequest(
                `/api/${resource}?fields=${params.fields}&filter=${params.filter}`,
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
            return;
        }

        (async () => {
            try {
                const r = (await engine.query({
                    list: { resource, params },
                })) as unknown as FacilityResponse;
                const counts = new Map<string, number>();
                let grandTotal = 0;
                for (const ou of r.list?.organisationUnits ?? []) {
                    grandTotal += 1;
                    for (const a of ou.ancestors ?? []) {
                        counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
                    }
                }
                if (!cancelled)
                    setTotals({ countByAncestorId: counts, grandTotal });
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
    }, [engine, facilityLevel]);

    return { totals, loading, error };
}
