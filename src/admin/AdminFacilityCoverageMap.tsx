import {
    AimOutlined,
    HomeOutlined,
    TeamOutlined,
} from "@ant-design/icons";
import {
    Button,
    Divider,
    Flex,
    Radio,
    Segmented,
    Select,
    Skeleton,
    Tag,
    theme,
    Tooltip,
    Typography,
} from "antd";
import L from "leaflet";
// @ts-expect-error — d2-app-scripts handles CSS via Vite; no TS types needed.
import "leaflet/dist/leaflet.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    CircleMarker,
    GeoJSON,
    MapContainer,
    Popup,
    useMap,
    ZoomControl,
} from "react-leaflet";
import { FacilityRiskPoint, HealthStatus } from "./summaryTypes";
import { useOrgUnitBoundaries } from "./useOrgUnitBoundaries";
import { useOrgUnitGroupSets } from "./useOrgUnitGroupSets";
import { useOrgUnitLevels } from "./useOrgUnitLevels";
import {
    AncestorRef,
    ProgramFacility,
    useProgramFacilities,
} from "./useProgramFacilities";
import { useTotalFacilitiesPerAncestor } from "./useTotalFacilitiesPerAncestor";
import { useUsersByOrgUnit } from "./useUsersByOrgUnit";

const { Text, Title } = Typography;

interface PlottedFacility {
    id: string;
    name: string;
    districtName?: string;
    latitude: number;
    longitude: number;
    ancestors: AncestorRef[];
    risk?: FacilityRiskPoint;
    activeUserCount: number;
    /** Users with `lastLogin` inside the configured recent window. */
    recentLogins: number;
    /** Resolved live logged-in count: summary value when present, else recentLogins. */
    liveLoggedIn: number;
    /** OrgUnit group memberships (Facility Type, Ownership, etc.). */
    groupIds: Set<string>;
}

type DisplayMode = "facilities" | "choropleth" | "both";

type ThematicKey =
    | "coverage"
    | "active"
    | "noData"
    | "risk"
    | "trackerGets"
    | "trackerPosts"
    | "slow"
    | "failed"
    | "oldSession";

interface ThematicSpec {
    key: ThematicKey;
    label: string;
    description: string;
    bin: (f: PlottedFacility) => { label: string; color: string } | null;
}

type ChoroplethMetric =
    | "enrolledCount"
    | "coverageRatio"
    | "activeUsers"
    | "loggedInUsers"
    | "trackerGets"
    | "trackerPosts"
    | "failedSyncs";

interface ChoroplethSpec {
    key: ChoroplethMetric;
    label: string;
    description: string;
    extract: (agg: PolygonAggregate) => number | undefined;
    /** When true, value is interpreted as a 0-100 % rather than a count. */
    isRatio?: boolean;
}

interface PolygonAggregate {
    polygonId: string;
    polygonName: string;
    enrolledCount: number;
    totalFacilities?: number;
    activeUsers: number;
    loggedInUsers: number;
    trackerGets: number;
    trackerPosts: number;
    failedSyncs: number;
}

const STATUS_COLOR: Record<HealthStatus, string> = {
    healthy: "#2c8c5f",
    watch: "#d9a72f",
    degraded: "#d97706",
    critical: "#b91c1c",
    unknown: "#9ca3af",
};

// ColorBrewer-style sequential palettes — modern, accessible contrast.
const PALETTES: Record<string, { label: string; ramp: string[] }> = {
    blue: {
        label: "Blue",
        ramp: [
            "#eff6ff",
            "#bfdbfe",
            "#93c5fd",
            "#60a5fa",
            "#3b82f6",
            "#1d4ed8",
            "#1e3a8a",
        ],
    },
    green: {
        label: "Green",
        ramp: [
            "#f0fdf4",
            "#bbf7d0",
            "#86efac",
            "#4ade80",
            "#22c55e",
            "#15803d",
            "#14532d",
        ],
    },
    purple: {
        label: "Purple",
        ramp: [
            "#faf5ff",
            "#e9d5ff",
            "#c4b5fd",
            "#a78bfa",
            "#8b5cf6",
            "#6d28d9",
            "#4c1d95",
        ],
    },
    diverging: {
        label: "Risk (red → green)",
        ramp: [
            "#b91c1c",
            "#dc2626",
            "#f59e0b",
            "#facc15",
            "#84cc16",
            "#16a34a",
            "#15803d",
        ],
    },
    warm: {
        label: "Warm",
        ramp: [
            "#fff7ed",
            "#fed7aa",
            "#fdba74",
            "#fb923c",
            "#f97316",
            "#c2410c",
            "#7c2d12",
        ],
    },
};
type PaletteKey = keyof typeof PALETTES;

function bandForCount(value: number, thresholds: [number, number, number]) {
    if (value === 0) return { label: "0", color: "#cbd5e1" };
    if (value <= thresholds[0]) return { label: `1–${thresholds[0]}`, color: "#86b6f7" };
    if (value <= thresholds[1])
        return {
            label: `${thresholds[0] + 1}–${thresholds[1]}`,
            color: "#4a90e2",
        };
    if (value <= thresholds[2])
        return {
            label: `${thresholds[1] + 1}–${thresholds[2]}`,
            color: "#d97706",
        };
    return { label: `> ${thresholds[2]}`, color: "#b91c1c" };
}

const THEMATIC_LAYERS: ThematicSpec[] = [
    {
        key: "coverage",
        label: "Coverage",
        description: "Every facility enrolled in the eRegisters program.",
        bin: () => ({ label: "Enrolled", color: "#1677ff" }),
    },
    {
        key: "active",
        label: "Active users (logged in now)",
        description:
            "Facilities with at least one user signed in recently. Falls back to DHIS2 lastLogin within the past hour when the summary doesn't include live session counts.",
        bin: (f) => {
            if (f.liveLoggedIn <= 0) return null;
            return bandForCount(f.liveLoggedIn, [3, 10, 25]);
        },
    },
    {
        key: "noData",
        label: "No recent activity",
        description: "Facilities with zero active users in the period.",
        bin: (f) =>
            f.risk && f.risk.activeUsers === 0
                ? { label: "No activity", color: "#94a3b8" }
                : null,
    },
    {
        key: "risk",
        label: "Risk severity",
        description: "Status from the operational summary.",
        bin: (f) =>
            f.risk
                ? {
                      label:
                          f.risk.status.charAt(0).toUpperCase() +
                          f.risk.status.slice(1),
                      color: STATUS_COLOR[f.risk.status],
                  }
                : { label: "No summary", color: "#9ca3af" },
    },
    {
        key: "trackerGets",
        label: "Tracker GETs",
        description: "Volume of tracker GET requests in the period.",
        bin: (f) =>
            f.risk
                ? bandForCount(f.risk.trackerGets, [100, 500, 1000])
                : null,
    },
    {
        key: "trackerPosts",
        label: "Tracker POSTs",
        description: "Volume of tracker POST requests in the period.",
        bin: (f) =>
            f.risk
                ? bandForCount(f.risk.trackerPosts, [50, 200, 500])
                : null,
    },
    {
        key: "slow",
        label: "Slow requests",
        description: "Facilities with slow requests above the threshold.",
        bin: (f) =>
            f.risk ? bandForCount(f.risk.slowRequests, [5, 15, 40]) : null,
    },
    {
        key: "failed",
        label: "Failed syncs",
        description: "Facilities with at least one failed sync.",
        bin: (f) =>
            f.risk && f.risk.failedSyncs > 0
                ? bandForCount(f.risk.failedSyncs, [1, 3, 5])
                : null,
    },
    {
        key: "oldSession",
        label: "Old app sessions",
        description: "Facilities still running an outdated app build.",
        bin: (f) =>
            f.risk && f.risk.oldAppSessions > 0
                ? bandForCount(f.risk.oldAppSessions, [1, 3, 5])
                : null,
    },
];

const CHOROPLETH_METRICS: ChoroplethSpec[] = [
    {
        key: "enrolledCount",
        label: "Enrolled facilities",
        description: "Number of program-enrolled facilities in each area.",
        extract: (a) => a.enrolledCount,
    },
    {
        key: "coverageRatio",
        label: "Coverage % (enrolled ÷ total)",
        description:
            "Share of facilities in each area enrolled in the program.",
        extract: (a) =>
            a.totalFacilities && a.totalFacilities > 0
                ? Math.round((a.enrolledCount / a.totalFacilities) * 100)
                : undefined,
        isRatio: true,
    },
    {
        key: "activeUsers",
        label: "Active users (period)",
        description: "Total users active in the period across each area.",
        extract: (a) => a.activeUsers,
    },
    {
        key: "loggedInUsers",
        label: "Logged in now",
        description: "Currently signed-in users aggregated by area.",
        extract: (a) => a.loggedInUsers,
    },
    {
        key: "trackerGets",
        label: "Tracker GETs",
        description: "Total tracker GET volume in the period.",
        extract: (a) => a.trackerGets,
    },
    {
        key: "trackerPosts",
        label: "Tracker POSTs",
        description: "Total tracker POST volume in the period.",
        extract: (a) => a.trackerPosts,
    },
    {
        key: "failedSyncs",
        label: "Failed syncs",
        description: "Sum of failed sync runs in the period.",
        extract: (a) => a.failedSyncs,
    },
];

const FitToBoundaries: React.FC<{
    geojson: GeoJSON.FeatureCollection | null;
}> = ({ geojson }) => {
    const map = useMap();
    useEffect(() => {
        if (!geojson || geojson.features.length === 0) return;
        try {
            const layer = L.geoJSON(geojson);
            const bounds = layer.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [20, 20] });
            }
        } catch {
            /* ignore */
        }
    }, [geojson, map]);
    return null;
};

/** Exposes a `reset()` callback that flies the map back to the full bounds. */
const ResetViewControl: React.FC<{
    geojson: GeoJSON.FeatureCollection | null;
    onReady: (resetFn: () => void) => void;
}> = ({ geojson, onReady }) => {
    const map = useMap();
    useEffect(() => {
        const reset = () => {
            try {
                if (!geojson || geojson.features.length === 0) return;
                const layer = L.geoJSON(geojson);
                const bounds = layer.getBounds();
                if (bounds.isValid()) {
                    map.flyToBounds(bounds, {
                        padding: [20, 20],
                        duration: 0.7,
                    });
                }
            } catch {
                /* ignore */
            }
        };
        onReady(reset);
    }, [geojson, map, onReady]);
    return null;
};

function rampColor(
    value: number,
    min: number,
    max: number,
    ramp: string[],
): string {
    if (!isFinite(value) || max === min) return ramp[0];
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const idx = Math.min(ramp.length - 1, Math.floor(t * ramp.length));
    return ramp[idx];
}

export const AdminFacilityCoverageMap: React.FC<{
    facilities: FacilityRiskPoint[];
}> = ({ facilities }) => {
    const { token } = theme.useToken();

    // Controls
    const [mode, setMode] = useState<DisplayMode>("both");
    const [thematic, setThematic] = useState<ThematicKey>("coverage");
    const [choroplethMetric, setChoroplethMetric] =
        useState<ChoroplethMetric>("enrolledCount");
    const [aggregationLevel, setAggregationLevel] = useState<number>(2);

    const [hoveredOu, setHoveredOu] = useState<string | undefined>();
    const resetViewRef = useRef<(() => void) | null>(null);
    const [palette, setPalette] = useState<PaletteKey>("blue");
    const [showValues, setShowValues] = useState(false);
    const [groupSetId, setGroupSetId] = useState<string | undefined>();
    const { groupSets } = useOrgUnitGroupSets();

    // Data
    const {
        facilities: programFacilities,
        loading: facLoading,
        error: facError,
    } = useProgramFacilities();
    const { levels: orgUnitLevels } = useOrgUnitLevels();
    const { boundaries, loading: boundariesLoading } = useOrgUnitBoundaries([
        aggregationLevel,
    ]);
    const { counts: userCounts } = useUsersByOrgUnit();
    // Derive the "facility level" from where the program is actually
    // assigned, not from the highest level in the metadata. Otherwise
    // an instance with 8 662 facilities at L4 and 89 admin areas at L6
    // ends up comparing apples to oranges.
    const facilityLevel = useMemo(() => {
        if (programFacilities.length === 0) return undefined;
        const tally = new Map<number, number>();
        for (const f of programFacilities) {
            if (typeof f.level === "number") {
                tally.set(f.level, (tally.get(f.level) ?? 0) + 1);
            }
        }
        if (tally.size === 0) return undefined;
        let best: number | undefined;
        let bestCount = -1;
        for (const [lvl, count] of tally) {
            if (count > bestCount) {
                best = lvl;
                bestCount = count;
            }
        }
        return best;
    }, [programFacilities]);
    const { totals: facilityTotals } =
        useTotalFacilitiesPerAncestor(facilityLevel);

    // Auto-pick the default aggregation level — second-from-root if
    // available (typical "Region" in DHIS2 hierarchies).
    useEffect(() => {
        if (orgUnitLevels.length === 0) return;
        const candidate =
            orgUnitLevels.find((l) => l.level === 2)?.level ??
            orgUnitLevels[Math.min(1, orgUnitLevels.length - 1)].level;
        setAggregationLevel((prev) => prev || candidate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgUnitLevels]);

    const riskById = useMemo(() => {
        const m = new Map<string, FacilityRiskPoint>();
        for (const r of facilities) m.set(r.orgUnit, r);
        return m;
    }, [facilities]);

    const plotted: PlottedFacility[] = useMemo(() => {
        return programFacilities
            .filter(
                (f): f is ProgramFacility & {
                    latitude: number;
                    longitude: number;
                } =>
                    typeof f.latitude === "number" &&
                    typeof f.longitude === "number",
            )
            .map((f) => {
                const recentLogins = userCounts.recentLoginsById.get(f.id) ?? 0;
                const risk = riskById.get(f.id);
                const summaryLive = risk?.loggedInUsers ?? 0;
                return {
                    id: f.id,
                    name: f.displayName,
                    districtName: f.parentName,
                    latitude: f.latitude,
                    longitude: f.longitude,
                    ancestors: f.ancestors,
                    risk,
                    activeUserCount: userCounts.activeById.get(f.id) ?? 0,
                    recentLogins,
                    // Real DHIS2 lastLogin wins when present — otherwise the
                    // summary's cached loggedInUsers value carries it.
                    liveLoggedIn: Math.max(summaryLive, recentLogins),
                    groupIds: new Set(f.groups.map((g) => g.id)),
                };
            });
    }, [programFacilities, riskById, userCounts]);

    // Aggregate per polygon (at the selected level).
    const aggregates = useMemo(() => {
        const map = new Map<string, PolygonAggregate>();
        for (const b of boundaries) {
            map.set(b.id, {
                polygonId: b.id,
                polygonName: b.name,
                enrolledCount: 0,
                totalFacilities: facilityTotals.countByAncestorId.get(b.id),
                activeUsers: 0,
                loggedInUsers: 0,
                trackerGets: 0,
                trackerPosts: 0,
                failedSyncs: 0,
            });
        }
        // Walk every enrolled facility once and tally on each matching ancestor.
        for (const f of programFacilities) {
            const ancestor = f.ancestors.find(
                (a) => a.level === aggregationLevel,
            );
            if (!ancestor) continue;
            const agg = map.get(ancestor.id);
            if (!agg) continue;
            agg.enrolledCount += 1;
            const risk = riskById.get(f.id);
            const recentLogins =
                userCounts.recentLoginsById.get(f.id) ?? 0;
            // Prefer the summary's loggedInUsers when present, fall back to
            // DHIS2 lastLogin so the count is never silently zero in prod.
            agg.loggedInUsers += Math.max(
                risk?.loggedInUsers ?? 0,
                recentLogins,
            );
            if (risk) {
                agg.activeUsers += risk.activeUsers;
                agg.trackerGets += risk.trackerGets;
                agg.trackerPosts += risk.trackerPosts;
                agg.failedSyncs += risk.failedSyncs;
            }
        }
        return map;
    }, [
        boundaries,
        programFacilities,
        riskById,
        userCounts,
        aggregationLevel,
        facilityTotals,
    ]);

    const choroplethSpec = useMemo(
        () => CHOROPLETH_METRICS.find((m) => m.key === choroplethMetric)!,
        [choroplethMetric],
    );

    const choroplethRange = useMemo(() => {
        let min = Infinity;
        let max = -Infinity;
        for (const a of aggregates.values()) {
            const v = choroplethSpec.extract(a);
            if (typeof v !== "number") continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        if (!isFinite(min)) return { min: 0, max: 0 };
        return { min, max };
    }, [aggregates, choroplethSpec]);

    const activeThematic = useMemo<ThematicSpec>(() => {
        // GroupSet picker overrides the thematic layer — colours
        // facilities by which group they belong to within the chosen
        // organisationUnitGroupSet (Facility Type, Ownership, etc.).
        if (groupSetId) {
            const gs = groupSets.find((s) => s.id === groupSetId);
            if (gs) {
                return {
                    key: "coverage" as ThematicKey,
                    label: gs.displayName,
                    description: `Coloured by ${gs.displayName} membership. Each group uses its DHIS2-defined colour.`,
                    bin: (f) => {
                        for (const g of gs.groups) {
                            if (f.groupIds.has(g.id)) {
                                return {
                                    label: g.displayName,
                                    color: g.color,
                                };
                            }
                        }
                        return {
                            label: "Not classified",
                            color: "#9ca3af",
                        };
                    },
                };
            }
        }
        return (
            THEMATIC_LAYERS.find((l) => l.key === thematic) ??
            THEMATIC_LAYERS[0]
        );
    }, [groupSetId, groupSets, thematic]);

    const legend = useMemo(() => {
        const buckets = new Map<string, { color: string; count: number }>();
        for (const f of plotted) {
            const bin = activeThematic.bin(f);
            if (!bin) continue;
            const existing = buckets.get(bin.label);
            if (existing) existing.count += 1;
            else buckets.set(bin.label, { color: bin.color, count: 1 });
        }
        return Array.from(buckets.entries()).map(([label, v]) => ({
            label,
            color: v.color,
            count: v.count,
        }));
    }, [plotted, activeThematic]);

    const featureCollection = useMemo<GeoJSON.FeatureCollection | null>(() => {
        if (boundaries.length === 0) return null;
        return {
            type: "FeatureCollection",
            features: boundaries.map((b) => ({
                type: "Feature",
                properties: { id: b.id, name: b.name, level: b.level },
                geometry: b.geometry,
            })),
        };
    }, [boundaries]);

    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const center: [number, number] = [1.3733, 32.2903];

    const totalEnrolled = programFacilities.length;
    const plottedCount = plotted.length;
    const showFacilities = mode === "facilities" || mode === "both";
    const showChoropleth = mode === "choropleth" || mode === "both";

    if (facLoading && totalEnrolled === 0) {
        return (
            <div
                style={{
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    padding: token.paddingLG,
                    minHeight: 480,
                }}
            >
                <Skeleton active />
            </div>
        );
    }

    if (facError) {
        return (
            <div
                style={{
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    padding: token.paddingLG,
                }}
            >
                <Title level={5} style={{ margin: 0 }}>
                    Coverage Map unavailable
                </Title>
                <Text type="secondary">{facError}</Text>
            </div>
        );
    }

    const aggregationLevelLabel =
        orgUnitLevels.find((l) => l.level === aggregationLevel)?.displayName ??
        `Level ${aggregationLevel}`;

    // Coverage at the facility level — comparing program-assigned
    // org units to total org units at the same level. The number is
    // only meaningful when we know the program's facility level.
    const grandTotal = facilityTotals.grandTotal;
    const facilityLevelLabel = facilityLevel
        ? orgUnitLevels.find((l) => l.level === facilityLevel)?.displayName
        : undefined;
    const coveragePct =
        facilityLevel !== undefined && grandTotal > 0
            ? Math.min(
                  100,
                  Math.round((totalEnrolled / grandTotal) * 1000) / 10,
              )
            : undefined;

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex align="center" justify="space-between" gap={token.marginSM} wrap>
                <Flex vertical gap={2}>
                    <Title level={5} style={{ margin: 0 }}>
                        Coverage Map
                    </Title>
                    <Text
                        type="secondary"
                        style={{ fontSize: token.fontSizeSM }}
                    >
                        Plotted at <Text strong>{aggregationLevelLabel}</Text>{" "}
                        level · {boundaries.length.toLocaleString()} boundaries ·{" "}
                        {plottedCount.toLocaleString()} of{" "}
                        {totalEnrolled.toLocaleString()} enrolled facilities
                        have coordinates
                    </Text>
                </Flex>
                <Flex gap={token.marginXS} wrap align="center">
                    <Tooltip title="Org units assigned to the eRegisters program (from /programs/{id}.organisationUnits).">
                        <Tag
                            color="blue"
                            style={{
                                margin: 0,
                                padding: "4px 10px",
                                fontSize: token.fontSize,
                            }}
                        >
                            <HomeOutlined />{" "}
                            <Text strong>{totalEnrolled.toLocaleString()}</Text>{" "}
                            program-assigned
                        </Tag>
                    </Tooltip>
                    {facilityLevelLabel && grandTotal > 0 && (
                        <Tooltip
                            title={`Total org units at ${facilityLevelLabel} level in this DHIS2 instance.`}
                        >
                            <Tag
                                style={{
                                    margin: 0,
                                    padding: "4px 10px",
                                    fontSize: token.fontSize,
                                }}
                            >
                                <TeamOutlined />{" "}
                                <Text strong>{grandTotal.toLocaleString()}</Text>{" "}
                                {facilityLevelLabel.toLowerCase()} in system
                            </Tag>
                        </Tooltip>
                    )}
                    {typeof coveragePct === "number" && (
                        <Tooltip
                            title={`Program-assigned ÷ total ${facilityLevelLabel?.toLowerCase()} org units.`}
                        >
                            <Tag
                                color={
                                    coveragePct >= 70
                                        ? "green"
                                        : coveragePct >= 40
                                          ? "gold"
                                          : "orange"
                                }
                                style={{
                                    margin: 0,
                                    padding: "4px 10px",
                                    fontSize: token.fontSize,
                                }}
                            >
                                <Text strong>{coveragePct}%</Text>{" "}
                                {facilityLevelLabel?.toLowerCase()} coverage
                            </Tag>
                        </Tooltip>
                    )}
                </Flex>
            </Flex>

            <div
                style={{
                    position: "relative",
                    background: "#f8fafc",
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 4,
                    height: "min(72vh, 720px)",
                    overflow: "hidden",
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.02)",
                }}
            >
                {plotted.length === 0 && boundaries.length === 0 ? (
                    <Flex
                        vertical
                        align="center"
                        justify="center"
                        gap={token.marginXS}
                        style={{ height: "100%", padding: token.paddingLG }}
                    >
                        <Text type="secondary" style={{ textAlign: "center" }}>
                            None of the {totalEnrolled.toLocaleString()}{" "}
                            program-enrolled facilities have coordinates, and no
                            org-unit boundaries are available.
                        </Text>
                    </Flex>
                ) : (
                    mounted && (
                        <MapContainer
                            center={center}
                            zoom={6}
                            scrollWheelZoom={false}
                            attributionControl={false}
                            zoomControl={false}
                            style={{
                                height: "100%",
                                width: "100%",
                                background: "#f5f7fa",
                            }}
                        >
                            <ZoomControl position="topright" />
                            {featureCollection && (
                                <>
                                    <FitToBoundaries
                                        geojson={featureCollection}
                                    />
                                    <ResetViewControl
                                        geojson={featureCollection}
                                        onReady={(fn) => {
                                            resetViewRef.current = fn;
                                        }}
                                    />
                                    <GeoJSON
                                        key={`${aggregationLevel}-${choroplethMetric}-${mode}-${palette}-${showValues}`}
                                        data={featureCollection}
                                        style={(feature) => {
                                            const id = feature?.properties
                                                ?.id as string | undefined;
                                            const agg = id
                                                ? aggregates.get(id)
                                                : undefined;
                                            const isHovered = id === hoveredOu;
                                            let fillColor = "#ffffff";
                                            let fillOpacity = isHovered ? 0.35 : 0.15;
                                            if (showChoropleth && agg) {
                                                const v = choroplethSpec.extract(agg);
                                                if (typeof v === "number") {
                                                    fillColor = rampColor(
                                                        v,
                                                        choroplethRange.min,
                                                        choroplethRange.max,
                                                        PALETTES[palette].ramp,
                                                    );
                                                    fillOpacity = isHovered
                                                        ? 0.85
                                                        : 0.7;
                                                }
                                            }
                                            return {
                                                color: isHovered
                                                    ? "#1677ff"
                                                    : "#6b7280",
                                                weight: isHovered ? 2.2 : 1.0,
                                                fillColor,
                                                fillOpacity,
                                            };
                                        }}
                                        onEachFeature={(feature, layer) => {
                                            const id = feature.properties
                                                ?.id as string | undefined;
                                            const name = feature.properties
                                                ?.name as string | undefined;
                                            const agg = id
                                                ? aggregates.get(id)
                                                : undefined;
                                            layer.on({
                                                mouseover: () => setHoveredOu(id),
                                                mouseout: () =>
                                                    setHoveredOu(undefined),
                                                click: (e) => {
                                                    const target = e.target as L.Layer & {
                                                        getBounds?: () => L.LatLngBounds;
                                                        _map?: L.Map;
                                                    };
                                                    if (target.getBounds) {
                                                        try {
                                                            const bounds = target.getBounds();
                                                            if (
                                                                target._map &&
                                                                bounds.isValid()
                                                            ) {
                                                                target._map.fitBounds(
                                                                    bounds,
                                                                    {
                                                                        padding: [20, 20],
                                                                    },
                                                                );
                                                            }
                                                        } catch {
                                                            /* ignore */
                                                        }
                                                    }
                                                },
                                            });
                                            if (name) {
                                                const v =
                                                    agg && showChoropleth
                                                        ? choroplethSpec.extract(
                                                              agg,
                                                          )
                                                        : undefined;

                                                if (
                                                    showValues &&
                                                    showChoropleth &&
                                                    typeof v === "number"
                                                ) {
                                                    // Permanent on-map label
                                                    // showing the metric value.
                                                    const labelText = `${v.toLocaleString()}${choroplethSpec.isRatio ? "%" : ""}`;
                                                    layer.bindTooltip(
                                                        `<div style="background:rgba(255,255,255,0.92);padding:2px 6px;border-radius:3px;font-weight:600;font-size:11px;color:#0f172a;box-shadow:0 1px 2px rgba(0,0,0,0.08);">${labelText}</div>`,
                                                        {
                                                            permanent: true,
                                                            direction: "center",
                                                            className:
                                                                "coverage-map-value-label",
                                                            opacity: 1,
                                                        },
                                                    );
                                                } else {
                                                    // Rich hover tooltip.
                                                    const enrolledLine = agg
                                                        ? `<div style="color:#4b5563;font-size:11px;margin-top:2px;">Enrolled: <strong>${agg.enrolledCount.toLocaleString()}</strong>${
                                                              agg.totalFacilities
                                                                  ? ` / ${agg.totalFacilities.toLocaleString()} <span style="color:#9ca3af;">(${Math.round((agg.enrolledCount / agg.totalFacilities) * 100)}%)</span>`
                                                                  : ""
                                                          }</div>`
                                                        : "";
                                                    const metricLine =
                                                        typeof v === "number"
                                                            ? `<div style="color:#1d4ed8;font-size:11px;margin-top:2px;">${choroplethSpec.label}: <strong>${v.toLocaleString()}${choroplethSpec.isRatio ? "%" : ""}</strong></div>`
                                                            : "";
                                                    layer.bindTooltip(
                                                        `<div style="font-weight:600;font-size:12px;">${name}</div>${enrolledLine}${metricLine}`,
                                                        {
                                                            sticky: true,
                                                            direction: "top",
                                                            opacity: 0.95,
                                                            className:
                                                                "coverage-map-tooltip",
                                                        },
                                                    );
                                                }
                                            }
                                        }}
                                    />
                                </>
                            )}

                            {showFacilities &&
                                plotted.map((f) => {
                                    const bin = activeThematic.bin(f);
                                    if (!bin) return null;
                                    return (
                                        <CircleMarker
                                            key={f.id}
                                            center={[f.latitude, f.longitude]}
                                            radius={7}
                                            pathOptions={{
                                                color: "#ffffff",
                                                weight: 1.2,
                                                fillColor: bin.color,
                                                fillOpacity: 0.9,
                                            }}
                                        >
                                            <Popup>
                                                <PopupBody
                                                    facility={f}
                                                    binLabel={bin.label}
                                                />
                                            </Popup>
                                        </CircleMarker>
                                    );
                                })}
                        </MapContainer>
                    )
                )}

                {/* Reset view button — floats top-right next to ZoomControl */}
                {featureCollection && (
                    <Tooltip title="Reset view to full extent">
                        <Button
                            size="small"
                            icon={<AimOutlined />}
                            onClick={() => resetViewRef.current?.()}
                            style={{
                                position: "absolute",
                                top: 96,
                                right: 12,
                                zIndex: 1000,
                                boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                            }}
                        />
                    </Tooltip>
                )}

                {/* DHIS2-Maps-style overlay control */}
                <div
                    style={{
                        position: "absolute",
                        top: 12,
                        left: 12,
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        borderRadius: 6,
                        padding: token.paddingSM,
                        maxWidth: 290,
                        maxHeight: "calc(100% - 24px)",
                        overflowY: "auto",
                        zIndex: 1000,
                    }}
                >
                    <Flex vertical gap={token.marginXS}>
                        <Text strong>Display mode</Text>
                        <Segmented
                            block
                            value={mode}
                            onChange={(v) => setMode(v as DisplayMode)}
                            options={[
                                { value: "facilities", label: "Facilities" },
                                { value: "choropleth", label: "Choropleth" },
                                { value: "both", label: "Both" },
                            ]}
                        />

                        <Text strong>Aggregate by</Text>
                        <Select
                            size="small"
                            value={aggregationLevel}
                            onChange={(v) => setAggregationLevel(v)}
                            options={orgUnitLevels
                                .filter(
                                    (l) =>
                                        l.level >= 2 &&
                                        l.level !== facilityLevel,
                                )
                                .map((l) => ({
                                    value: l.level,
                                    label: `${l.displayName} (level ${l.level})`,
                                }))}
                        />

                        {showChoropleth && (
                            <>
                                <Divider style={{ margin: "4px 0" }} />
                                <Text strong>Choropleth metric</Text>
                                <Select
                                    size="small"
                                    value={choroplethMetric}
                                    onChange={(v) => setChoroplethMetric(v)}
                                    options={CHOROPLETH_METRICS.map((c) => ({
                                        value: c.key,
                                        label: c.label,
                                    }))}
                                />
                                <Flex
                                    align="center"
                                    justify="space-between"
                                    gap={token.marginXS}
                                >
                                    <Text style={{ fontSize: token.fontSizeSM }}>
                                        Palette
                                    </Text>
                                    <Select
                                        size="small"
                                        value={palette}
                                        onChange={(v) => setPalette(v)}
                                        style={{ flex: 1 }}
                                        options={Object.entries(PALETTES).map(
                                            ([key, p]) => ({
                                                value: key,
                                                label: (
                                                    <Flex
                                                        align="center"
                                                        gap={6}
                                                    >
                                                        <span
                                                            style={{
                                                                display:
                                                                    "inline-block",
                                                                width: 60,
                                                                height: 8,
                                                                borderRadius: 2,
                                                                background: `linear-gradient(to right, ${p.ramp.join(
                                                                    ",",
                                                                )})`,
                                                            }}
                                                        />
                                                        <span>{p.label}</span>
                                                    </Flex>
                                                ),
                                            }),
                                        )}
                                    />
                                </Flex>
                                <Flex
                                    align="center"
                                    justify="space-between"
                                    gap={token.marginXS}
                                >
                                    <Text style={{ fontSize: token.fontSizeSM }}>
                                        Show values on map
                                    </Text>
                                    <Segmented
                                        size="small"
                                        value={showValues ? "on" : "off"}
                                        onChange={(v) =>
                                            setShowValues(v === "on")
                                        }
                                        options={[
                                            { value: "off", label: "Off" },
                                            { value: "on", label: "On" },
                                        ]}
                                    />
                                </Flex>
                                <Text
                                    type="secondary"
                                    style={{ fontSize: token.fontSizeSM }}
                                >
                                    {choroplethSpec.description}
                                </Text>
                                <Flex
                                    align="center"
                                    gap={token.marginXS}
                                    style={{ marginTop: token.marginXXS }}
                                >
                                    <Text style={{ fontSize: token.fontSizeSM }}>
                                        {choroplethRange.min}
                                        {choroplethSpec.isRatio ? "%" : ""}
                                    </Text>
                                    <div
                                        style={{
                                            flex: 1,
                                            height: 10,
                                            background: `linear-gradient(to right, ${PALETTES[palette].ramp.join(
                                                ",",
                                            )})`,
                                            borderRadius: 2,
                                        }}
                                    />
                                    <Text style={{ fontSize: token.fontSizeSM }}>
                                        {choroplethRange.max}
                                        {choroplethSpec.isRatio ? "%" : ""}
                                    </Text>
                                </Flex>
                            </>
                        )}

                        {showFacilities && (
                            <>
                                <Divider style={{ margin: "4px 0" }} />
                                <Text strong>Colour by group set</Text>
                                <Select
                                    size="small"
                                    value={groupSetId}
                                    onChange={(v) => setGroupSetId(v)}
                                    showSearch
                                    optionFilterProp="label"
                                    allowClear
                                    placeholder="None — use thematic below"
                                    options={groupSets.map((gs) => ({
                                        value: gs.id,
                                        label: `${gs.displayName} (${gs.groups.length})`,
                                    }))}
                                />
                                {groupSetId && (
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: token.fontSizeSM }}
                                    >
                                        Overrides the thematic — each
                                        group renders in its own DHIS2-
                                        defined colour.
                                    </Text>
                                )}

                                <Text strong>Facility thematic</Text>
                                <Radio.Group
                                    value={thematic}
                                    disabled={!!groupSetId}
                                    onChange={(e) => setThematic(e.target.value)}
                                >
                                    <Flex vertical gap={2}>
                                        {THEMATIC_LAYERS.map((l) => (
                                            <Radio key={l.key} value={l.key}>
                                                <Text
                                                    style={{
                                                        fontSize:
                                                            token.fontSizeSM,
                                                    }}
                                                >
                                                    {l.label}
                                                </Text>
                                            </Radio>
                                        ))}
                                    </Flex>
                                </Radio.Group>
                                <Text
                                    type="secondary"
                                    style={{ fontSize: token.fontSizeSM }}
                                >
                                    {activeThematic.description}
                                </Text>
                                {legend.length > 0 && (
                                    <Flex vertical gap={2}>
                                        <Text
                                            strong
                                            style={{
                                                fontSize: token.fontSizeSM,
                                            }}
                                        >
                                            Facility legend
                                        </Text>
                                        {legend.map((b) => (
                                            <Flex
                                                key={b.label}
                                                align="center"
                                                gap={token.marginXS}
                                            >
                                                <span
                                                    style={{
                                                        display: "inline-block",
                                                        width: 10,
                                                        height: 10,
                                                        borderRadius: "50%",
                                                        background: b.color,
                                                        border: "1px solid rgba(0,0,0,0.15)",
                                                    }}
                                                />
                                                <Text
                                                    style={{
                                                        fontSize:
                                                            token.fontSizeSM,
                                                        flex: 1,
                                                    }}
                                                >
                                                    {b.label}
                                                </Text>
                                                <Text
                                                    type="secondary"
                                                    style={{
                                                        fontSize:
                                                            token.fontSizeSM,
                                                    }}
                                                >
                                                    {b.count}
                                                </Text>
                                            </Flex>
                                        ))}
                                    </Flex>
                                )}
                            </>
                        )}

                        {(facLoading || boundariesLoading) && (
                            <Text
                                type="secondary"
                                style={{ fontSize: token.fontSizeSM }}
                            >
                                Loading data…
                            </Text>
                        )}
                    </Flex>
                </div>
            </div>
        </Flex>
    );
};

const PopupBody: React.FC<{
    facility: PlottedFacility;
    binLabel: string;
}> = ({ facility, binLabel }) => (
    <div style={{ minWidth: 220 }}>
        <strong style={{ fontSize: 13 }}>{facility.name}</strong>
        <div style={{ color: "#888", fontSize: 11, marginBottom: 6 }}>
            {facility.districtName ?? "—"}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            <div style={{ marginBottom: 4 }}>
                <strong>Layer value:</strong> {binLabel}
            </div>
            <div>Users (DHIS2): {facility.activeUserCount}</div>
            <div>
                Logged in (DHIS2 lastLogin): <strong>{facility.recentLogins}</strong>
            </div>
            {facility.risk ? (
                <>
                    <div>Status: {facility.risk.status}</div>
                    <div>
                        Active users (period): {facility.risk.activeUsers}
                    </div>
                    <div>
                        Logged in now: {facility.risk.loggedInUsers ?? 0}
                    </div>
                    <div>Tracker GETs: {facility.risk.trackerGets}</div>
                    <div>Tracker POSTs: {facility.risk.trackerPosts}</div>
                    <div>Slow requests: {facility.risk.slowRequests}</div>
                    <div>Failed syncs: {facility.risk.failedSyncs}</div>
                    <div>Old sessions: {facility.risk.oldAppSessions}</div>
                    {facility.risk.lastActivityAt && (
                        <div>
                            Last activity: {facility.risk.lastActivityAt}
                        </div>
                    )}
                </>
            ) : (
                <div style={{ color: "#888" }}>
                    No operational summary yet for this facility.
                </div>
            )}
        </div>
    </div>
);
