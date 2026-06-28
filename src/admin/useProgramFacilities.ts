import { useDataEngine } from "@dhis2/app-runtime";
import { useEffect, useState } from "react";
import { PROGRAM_UID } from "../sync/config";
import { assertAdminOverviewSafeRequest } from "./adminSafeQueryGuard";

/**
 * Lightweight facility shape used by the Admin Dashboard map.
 *
 * Source: `programs/{PROGRAM_UID}?fields=organisationUnits[id,...]`.
 * Only metadata — no patient data. We pull geometry so the map can
 * plot a point even when the operational summary hasn't been
 * generated yet.
 */
export interface AncestorRef {
    id: string;
    displayName: string;
    level: number;
}

export interface ProgramFacility {
    id: string;
    displayName: string;
    level?: number;
    parentName?: string;
    /** Ordered root → parent. Each element has DHIS2 id, name and level. */
    ancestors: AncestorRef[];
    latitude?: number;
    longitude?: number;
}

interface ProgramQueryRow {
    id: string;
    displayName: string;
    level?: number;
    parent?: { displayName?: string };
    ancestors?: Array<{ id: string; displayName: string; level: number }>;
    geometry?: { type?: string; coordinates?: unknown };
}

interface ProgramFacilitiesQuery {
    program: {
        organisationUnits?: ProgramQueryRow[];
    };
}

/**
 * Extracts a [lng, lat] tuple from any of the DHIS2 geometry shapes we
 * see in the wild.
 */
function pickLngLat(geom: { type?: string; coordinates?: unknown } | undefined):
    | [number, number]
    | null {
    if (!geom?.coordinates) return null;
    if (geom.type === "Point" && Array.isArray(geom.coordinates)) {
        const [lng, lat] = geom.coordinates as [number, number];
        if (typeof lng === "number" && typeof lat === "number") return [lng, lat];
    }
    if (
        geom.type === "Polygon" &&
        Array.isArray(geom.coordinates) &&
        Array.isArray(geom.coordinates[0]) &&
        Array.isArray((geom.coordinates as number[][][])[0][0])
    ) {
        // Use the polygon centroid (mean of the outer ring vertices)
        const ring = (geom.coordinates as number[][][])[0];
        if (ring.length === 0) return null;
        let sumLng = 0;
        let sumLat = 0;
        for (const [lng, lat] of ring) {
            sumLng += lng;
            sumLat += lat;
        }
        return [sumLng / ring.length, sumLat / ring.length];
    }
    return null;
}

/**
 * Loads the facilities enrolled in the eRegisters program. Honours the
 * Admin Overview safe-query guard so any future refactor that touches
 * tracker endpoints is caught.
 */
export function useProgramFacilities(): {
    facilities: ProgramFacility[];
    loading: boolean;
    error?: string;
} {
    const engine = useDataEngine();
    const [facilities, setFacilities] = useState<ProgramFacility[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | undefined>();

    useEffect(() => {
        let cancelled = false;
        const resource = `programs/${PROGRAM_UID}`;
        try {
            assertAdminOverviewSafeRequest(`/api/${resource}`);
        } catch (err) {
            // The guard would only fire if PROGRAM_UID were ever
            // misconfigured to a tracker resource — keep the dashboard
            // alive instead of breaking it.
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
            return;
        }

        (async () => {
            try {
                const r = (await engine.query({
                    program: {
                        resource,
                        params: {
                            fields:
                                "organisationUnits[id,displayName,level,parent[displayName],ancestors[id,displayName,level],geometry]",
                        },
                    },
                })) as unknown as ProgramFacilitiesQuery;
                const ous = r.program?.organisationUnits ?? [];
                const next: ProgramFacility[] = ous.map((ou: ProgramQueryRow) => {
                    const ll = pickLngLat(ou.geometry);
                    return {
                        id: ou.id,
                        displayName: ou.displayName,
                        level: ou.level,
                        parentName: ou.parent?.displayName,
                        ancestors: (ou.ancestors ?? []).map((a) => ({
                            id: a.id,
                            displayName: a.displayName,
                            level: a.level,
                        })),
                        latitude: ll ? ll[1] : undefined,
                        longitude: ll ? ll[0] : undefined,
                    };
                });
                if (!cancelled) setFacilities(next);
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

    return { facilities, loading, error };
}
