import { Flex, Radio, Skeleton, theme, Typography } from "antd";
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
import { ProgramFacility, useProgramFacilities } from "./useProgramFacilities";

const { Text, Title } = Typography;

interface PlottedFacility {
    id: string;
    name: string;
    districtName?: string;
    regionName?: string;
    latitude: number;
    longitude: number;
    risk?: FacilityRiskPoint;
}

type LayerKey =
    | "coverage"
    | "active"
    | "noData"
    | "risk"
    | "trackerGets"
    | "trackerPosts"
    | "slow"
    | "failed"
    | "oldSession";

interface LayerSpec {
    key: LayerKey;
    label: string;
    description: string;
    bin: (f: PlottedFacility) => { label: string; color: string } | null;
}

const STATUS_COLOR: Record<HealthStatus, string> = {
    healthy: "#2c8c5f",
    watch: "#d9a72f",
    degraded: "#d97706",
    critical: "#b91c1c",
    unknown: "#9ca3af",
};

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

const LAYERS: LayerSpec[] = [
    {
        key: "coverage",
        label: "Coverage",
        description: "Every facility enrolled in the eRegisters program.",
        bin: () => ({ label: "Enrolled", color: "#1677ff" }),
    },
    {
        key: "active",
        label: "Active users",
        description:
            "Facilities with users signed in right now (currently logged-in sessions).",
        bin: (f) => {
            const live = f.risk?.loggedInUsers ?? 0;
            if (live <= 0) return null;
            return bandForCount(live, [3, 10, 25]);
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

/**
 * Fits the map viewport to the GeoJSON bounding box once boundaries
 * load. Re-running on level changes keeps the view tidy when the user
 * toggles regions vs. districts later.
 */
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
            // ignore — keep current viewport
        }
    }, [geojson, map]);
    return null;
};

/**
 * Operational map for the Admin Dashboard styled like DHIS2 Maps:
 * GeoJSON polygons replace the OpenStreetMap tile basemap, the layer
 * picker + legend float as an overlay control, attribution is hidden,
 * and only program-enrolled facilities are plotted.
 */
export const AdminFacilityCoverageMap: React.FC<{
    facilities: FacilityRiskPoint[];
}> = ({ facilities }) => {
    const { token } = theme.useToken();
    const [layerKey, setLayerKey] = useState<LayerKey>("coverage");
    const [hoveredOu, setHoveredOu] = useState<string | undefined>();
    const {
        facilities: programFacilities,
        loading: facLoading,
        error: facError,
    } = useProgramFacilities();
    const { boundaries, loading: boundariesLoading } = useOrgUnitBoundaries();

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
            .map((f) => ({
                id: f.id,
                name: f.displayName,
                districtName: f.parentName,
                latitude: f.latitude,
                longitude: f.longitude,
                risk: riskById.get(f.id),
            }));
    }, [programFacilities, riskById]);

    const activeLayer = LAYERS.find((l) => l.key === layerKey) ?? LAYERS[0];

    const legend = useMemo(() => {
        const buckets = new Map<string, { color: string; count: number }>();
        for (const f of plotted) {
            const bin = activeLayer.bin(f);
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
    }, [plotted, activeLayer]);

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
                    Facility map unavailable
                </Title>
                <Text type="secondary">{facError}</Text>
            </div>
        );
    }

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex align="center" justify="space-between" gap={token.marginSM} wrap>
                <Title level={5} style={{ margin: 0 }}>
                    Facility coverage map
                </Title>
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {plottedCount.toLocaleString()} of{" "}
                    {totalEnrolled.toLocaleString()} enrolled facilities have
                    coordinates · {boundaries.length.toLocaleString()} boundaries
                </Text>
            </Flex>

            <div
                style={{
                    position: "relative",
                    background: "#f5f7fa",
                    border: `1px solid ${token.colorBorderSecondary}`,
                    height: "min(72vh, 720px)",
                    overflow: "hidden",
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
                            scrollWheelZoom
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
                                    <GeoJSON
                                        data={featureCollection}
                                        style={(feature) => {
                                            const id = feature?.properties
                                                ?.id as string | undefined;
                                            const level = feature?.properties
                                                ?.level as number | undefined;
                                            const isHovered = id === hoveredOu;
                                            return {
                                                color: isHovered
                                                    ? "#1677ff"
                                                    : "#6b7280",
                                                weight:
                                                    isHovered
                                                        ? 2.2
                                                        : level && level <= 2
                                                          ? 1.2
                                                          : 0.7,
                                                fillColor: "#ffffff",
                                                fillOpacity: isHovered
                                                    ? 0.35
                                                    : 0.15,
                                            };
                                        }}
                                        onEachFeature={(feature, layer) => {
                                            const id = feature.properties
                                                ?.id as string | undefined;
                                            const name = feature.properties
                                                ?.name as string | undefined;
                                            layer.on({
                                                mouseover: () => setHoveredOu(id),
                                                mouseout: () =>
                                                    setHoveredOu(undefined),
                                                click: (e) => {
                                                    const target = e.target as L.Layer & {
                                                        getBounds?: () => L.LatLngBounds;
                                                    };
                                                    if (target.getBounds) {
                                                        try {
                                                            (
                                                                e.target as L.Layer
                                                            ).addTo;
                                                            const map = (
                                                                e.target as L.Layer & {
                                                                    _map?: L.Map;
                                                                }
                                                            )._map;
                                                            const bounds = target.getBounds();
                                                            if (
                                                                map &&
                                                                bounds.isValid()
                                                            ) {
                                                                map.fitBounds(
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
                                                layer.bindTooltip(name, {
                                                    sticky: true,
                                                    direction: "top",
                                                    opacity: 0.9,
                                                });
                                            }
                                        }}
                                    />
                                </>
                            )}

                            {plotted.map((f) => {
                                const bin = activeLayer.bin(f);
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

                {/* DHIS2-Maps-style overlay control: layer picker + legend */}
                <div
                    style={{
                        position: "absolute",
                        top: 12,
                        left: 12,
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                        padding: token.paddingSM,
                        maxWidth: 260,
                        zIndex: 1000,
                    }}
                >
                    <Flex vertical gap={token.marginXS}>
                        <Text strong>Thematic layer</Text>
                        <Radio.Group
                            value={layerKey}
                            onChange={(e) => setLayerKey(e.target.value)}
                        >
                            <Flex vertical gap={2}>
                                {LAYERS.map((l) => (
                                    <Radio key={l.key} value={l.key}>
                                        <Text
                                            style={{
                                                fontSize: token.fontSizeSM,
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
                            {activeLayer.description}
                        </Text>
                        {legend.length > 0 && (
                            <Flex vertical gap={2}>
                                <Text
                                    strong
                                    style={{ fontSize: token.fontSizeSM }}
                                >
                                    Legend
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
                                                fontSize: token.fontSizeSM,
                                                flex: 1,
                                            }}
                                        >
                                            {b.label}
                                        </Text>
                                        <Text
                                            type="secondary"
                                            style={{
                                                fontSize: token.fontSizeSM,
                                            }}
                                        >
                                            {b.count}
                                        </Text>
                                    </Flex>
                                ))}
                            </Flex>
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
