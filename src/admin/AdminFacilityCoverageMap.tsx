import { Flex, Radio, Skeleton, Spin, theme, Typography } from "antd";
// @ts-expect-error — d2-app-scripts handles CSS via Vite; no TS types needed.
import "leaflet/dist/leaflet.css";
import React, { useEffect, useMemo, useState } from "react";
import {
    CircleMarker,
    MapContainer,
    Popup,
    TileLayer,
} from "react-leaflet";
import { FacilityRiskPoint, HealthStatus } from "./summaryTypes";
import { ProgramFacility, useProgramFacilities } from "./useProgramFacilities";

const { Text, Title } = Typography;

/**
 * Plottable facility merged from program metadata + the cached
 * operational summary. Only facilities enrolled in the eRegisters
 * program are ever passed to the map.
 */
interface PlottedFacility {
    id: string;
    name: string;
    districtName?: string;
    regionName?: string;
    latitude: number;
    longitude: number;
    /** Operational data from the summary; absent when no summary yet. */
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
    /** Returns the categorical bin for the legend, or null to hide the marker. */
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
            "Facilities with one or more users signed in during the selected period.",
        bin: (f) =>
            f.risk
                ? bandForCount(f.risk.activeUsers, [3, 10, 25])
                : { label: "No summary", color: "#9ca3af" },
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
            f.risk
                ? bandForCount(f.risk.slowRequests, [5, 15, 40])
                : null,
    },
    {
        key: "failed",
        label: "Failed syncs",
        description: "Facilities with at least one failed sync in the period.",
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
 * Operational map for the Admin Dashboard, styled close to DHIS2 Maps:
 * one active categorical layer at a time, uniform circle markers, a
 * side legend listing the bins, and only program-enrolled facilities
 * plotted.
 */
export const AdminFacilityCoverageMap: React.FC<{
    facilities: FacilityRiskPoint[];
}> = ({ facilities }) => {
    const { token } = theme.useToken();
    const [layerKey, setLayerKey] = useState<LayerKey>("coverage");
    const {
        facilities: programFacilities,
        loading: facLoading,
        error: facError,
    } = useProgramFacilities();

    // Index the risk summary by org-unit for O(1) lookup as we merge.
    const riskById = useMemo(() => {
        const m = new Map<string, FacilityRiskPoint>();
        for (const r of facilities) m.set(r.orgUnit, r);
        return m;
    }, [facilities]);

    // Merge: program metadata is the authoritative list, summary
    // contributes operational counts when available. Plot only points
    // with real coordinates.
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
                const risk = riskById.get(f.id);
                return {
                    id: f.id,
                    name: f.displayName,
                    districtName: f.parentName,
                    latitude: f.latitude,
                    longitude: f.longitude,
                    risk,
                };
            });
    }, [programFacilities, riskById]);

    const activeLayer = LAYERS.find((l) => l.key === layerKey) ?? LAYERS[0];

    // Compute the unique legend bins for the active layer + count per bin.
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

    // Center on the centroid of plotted facilities; default to Uganda.
    const center: [number, number] = useMemo(() => {
        if (plotted.length === 0) return [1.3733, 32.2903];
        const lat =
            plotted.reduce((s, p) => s + p.latitude, 0) / plotted.length;
        const lng =
            plotted.reduce((s, p) => s + p.longitude, 0) / plotted.length;
        return [lat, lng];
    }, [plotted]);

    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const totalEnrolled = programFacilities.length;
    const plottedCount = plotted.length;

    if (facLoading && totalEnrolled === 0) {
        return (
            <div
                style={{
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    padding: token.paddingLG,
                    minHeight: 300,
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
            <Flex
                align="center"
                justify="space-between"
                gap={token.marginSM}
                wrap
            >
                <Title level={5} style={{ margin: 0 }}>
                    Facility coverage map
                </Title>
                <Text
                    type="secondary"
                    style={{ fontSize: token.fontSizeSM }}
                >
                    {plottedCount.toLocaleString()} of{" "}
                    {totalEnrolled.toLocaleString()} enrolled facilities
                    have coordinates
                </Text>
            </Flex>

            <div
                style={{
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 260px) 1fr",
                    minHeight: 460,
                }}
            >
                {/* Side panel — layer picker + legend, à la DHIS2 Maps */}
                <Flex
                    vertical
                    gap={token.marginSM}
                    style={{
                        padding: token.paddingSM,
                        borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
                        background: token.colorFillTertiary,
                    }}
                >
                    <Text strong>Thematic layer</Text>
                    <Radio.Group
                        value={layerKey}
                        onChange={(e) => setLayerKey(e.target.value)}
                    >
                        <Flex vertical gap={4}>
                            {LAYERS.map((l) => (
                                <Radio key={l.key} value={l.key}>
                                    <Text style={{ fontSize: token.fontSizeSM }}>
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
                        <Flex vertical gap={4}>
                            <Text strong style={{ fontSize: token.fontSizeSM }}>
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
                                        style={{ fontSize: token.fontSizeSM }}
                                    >
                                        {b.count}
                                    </Text>
                                </Flex>
                            ))}
                        </Flex>
                    )}
                </Flex>

                {/* Map canvas */}
                <div style={{ minHeight: 460, position: "relative" }}>
                    {plotted.length === 0 ? (
                        <Flex
                            vertical
                            align="center"
                            justify="center"
                            gap={token.marginXS}
                            style={{ height: "100%", padding: token.paddingLG }}
                        >
                            <Text type="secondary" style={{ textAlign: "center" }}>
                                None of the {totalEnrolled.toLocaleString()}{" "}
                                program-enrolled facilities have coordinates
                                set in their org-unit metadata.
                            </Text>
                            <Text
                                type="secondary"
                                style={{
                                    fontSize: token.fontSizeSM,
                                    textAlign: "center",
                                }}
                            >
                                Add geometry to the org units (in DHIS2
                                Maintenance) and refresh.
                            </Text>
                        </Flex>
                    ) : (
                        mounted && (
                            <MapContainer
                                center={center}
                                zoom={plotted.length > 1 ? 7 : 10}
                                style={{ height: 460, width: "100%" }}
                                scrollWheelZoom={false}
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
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
                                                fillOpacity: 0.85,
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
                                {facLoading && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: 8,
                                            right: 8,
                                            background:
                                                "rgba(255,255,255,0.85)",
                                            padding: "2px 8px",
                                            borderRadius: 12,
                                            fontSize: 12,
                                            zIndex: 1000,
                                        }}
                                    >
                                        <Spin size="small" /> loading…
                                    </div>
                                )}
                            </MapContainer>
                        )
                    )}
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
                    <div>Active users: {facility.risk.activeUsers}</div>
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
