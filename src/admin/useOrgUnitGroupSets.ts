import { useDataEngine } from "@dhis2/app-runtime";
import { useEffect, useState } from "react";
import { assertAdminOverviewSafeRequest } from "./adminSafeQueryGuard";

/**
 * A DHIS2 OrganisationUnitGroup as exposed in a group set — id, name
 * and the maintainer-assigned colour (falls back when null).
 */
export interface OrgUnitGroupInGroupSet {
    id: string;
    displayName: string;
    color: string;
}

export interface OrgUnitGroupSet {
    id: string;
    displayName: string;
    groups: OrgUnitGroupInGroupSet[];
}

interface RawGroup {
    id: string;
    displayName: string;
    color?: string;
}

interface RawGroupSet {
    id: string;
    displayName: string;
    organisationUnitGroups?: RawGroup[];
}

interface Response {
    list: {
        organisationUnitGroupSets?: RawGroupSet[];
    };
}

/**
 * Deterministic colour palette used when a group has no `color` set in
 * DHIS2 Maintenance — ColorBrewer's Set1, accessible and high-contrast.
 */
const FALLBACK_PALETTE = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
    "#bcbd22",
    "#17becf",
    "#aec7e8",
    "#ffbb78",
];

/**
 * Loads every OrganisationUnitGroupSet in the instance with its
 * constituent groups. Powers the Coverage Map "Colour facilities by
 * group set" picker so the user can render Facility Type (HC II /
 * HC III / Hospital / etc.) or Ownership (Government / Private /
 * Mission) splits without leaving the dashboard.
 */
export function useOrgUnitGroupSets(): {
    groupSets: OrgUnitGroupSet[];
    loading: boolean;
    error?: string;
} {
    const engine = useDataEngine();
    const [groupSets, setGroupSets] = useState<OrgUnitGroupSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        let cancelled = false;
        const resource = "organisationUnitGroupSets";
        try {
            assertAdminOverviewSafeRequest(
                `/api/${resource}?fields=id,displayName,organisationUnitGroups[id,displayName,color]`,
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
                                "id,displayName,organisationUnitGroups[id,displayName,color]",
                            paging: "false",
                        },
                    },
                })) as unknown as Response;
                const list = r.list?.organisationUnitGroupSets ?? [];
                const next: OrgUnitGroupSet[] = list.map((gs) => ({
                    id: gs.id,
                    displayName: gs.displayName,
                    groups: (gs.organisationUnitGroups ?? []).map(
                        (g, idx) => ({
                            id: g.id,
                            displayName: g.displayName,
                            color:
                                (g.color && g.color.trim()) ||
                                FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length],
                        }),
                    ),
                }));
                if (!cancelled) setGroupSets(next);
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

    return { groupSets, loading, error };
}
