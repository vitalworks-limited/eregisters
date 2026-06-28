import { useDataEngine } from "@dhis2/app-runtime";
import { useEffect, useState } from "react";
import { assertAdminOverviewSafeRequest } from "./adminSafeQueryGuard";

/**
 * GeoJSON Polygon boundary fetched from DHIS2 org-unit metadata. The
 * Dashboard map uses these as choropleth-style outlines instead of an
 * OpenStreetMap basemap, so the visual matches DHIS2 Maps.
 */
export interface OrgUnitBoundary {
    id: string;
    name: string;
    level: number;
    parentId?: string;
    /** GeoJSON Polygon or MultiPolygon. */
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

interface RawOrgUnit {
    id: string;
    displayName: string;
    level: number;
    parent?: { id?: string };
    geometry?: {
        type: string;
        coordinates: unknown;
    };
}

interface BoundaryResponse {
    organisationUnits: {
        organisationUnits?: RawOrgUnit[];
    };
}

/**
 * Loads boundary polygons for org units at the requested levels.
 *
 * Levels default to [2, 3] — regions + districts in the Uganda hierarchy.
 * Pagination is disabled because the count is bounded (a few hundred at
 * most), but the request is still guarded by the Admin Overview safe-
 * query check.
 */
export function useOrgUnitBoundaries(
    levels: number[] = [2, 3],
): {
    boundaries: OrgUnitBoundary[];
    loading: boolean;
    error?: string;
} {
    const engine = useDataEngine();
    const [boundaries, setBoundaries] = useState<OrgUnitBoundary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        let cancelled = false;
        const filter = `level:in:[${levels.join(",")}]`;
        const resource = `organisationUnits`;
        try {
            assertAdminOverviewSafeRequest(
                `/api/${resource}?fields=id,displayName,level,geometry&filter=${filter}`,
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
            return;
        }

        (async () => {
            try {
                const r = (await engine.query({
                    organisationUnits: {
                        resource,
                        params: {
                            fields:
                                "id,displayName,level,parent[id],geometry",
                            filter,
                            paging: "false",
                        },
                    },
                })) as unknown as BoundaryResponse;
                const list = r.organisationUnits?.organisationUnits ?? [];
                const next: OrgUnitBoundary[] = [];
                for (const ou of list) {
                    if (!ou.geometry) continue;
                    if (
                        ou.geometry.type !== "Polygon" &&
                        ou.geometry.type !== "MultiPolygon"
                    ) {
                        continue;
                    }
                    next.push({
                        id: ou.id,
                        name: ou.displayName,
                        level: ou.level,
                        parentId: ou.parent?.id,
                        geometry: ou.geometry as
                            | GeoJSON.Polygon
                            | GeoJSON.MultiPolygon,
                    });
                }
                if (!cancelled) setBoundaries(next);
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
    }, [engine, levels.join(",")]);

    return { boundaries, loading, error };
}
