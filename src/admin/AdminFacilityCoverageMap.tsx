import { Checkbox, Empty, Flex, theme, Tooltip, Typography } from "antd";
import L from "leaflet";
// @ts-expect-error — d2-app-scripts handles CSS via Vite; no TS types needed.
import "leaflet/dist/leaflet.css";
import React, { useEffect, useMemo, useState } from "react";
import {
    CircleMarker,
    LayerGroup,
    MapContainer,
    Marker,
    Popup,
    TileLayer,
} from "react-leaflet";
import { FacilityRiskPoint, HealthStatus } from "./summaryTypes";

const { Text, Title } = Typography;

interface Layer {
    key: string;
    label: string;
    color: string;
    description: string;
    test: (f: FacilityRiskPoint) => boolean;
}

function statusColor(status: HealthStatus, fallback: string): string {
    switch (status) {
        case "healthy":
            return "#52c41a";
        case "watch":
            return "#faad14";
        case "degraded":
            return "#fa8c16";
        case "critical":
            return "#f5222d";
        default:
            return fallback;
    }
}

const ICON = L.icon({
    iconUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
});

/**
 * Operational map for the Admin Dashboard. Renders facility points
 * from the cached summary's `facilityRiskMap` and exposes toggleable
 * layers (coverage, currently active users, high tracker volume,
 * failed syncs, etc).
 *
 * The map never fetches per-facility tracker data — every point comes
 * from the precomputed summary.
 */
export const AdminFacilityCoverageMap: React.FC<{
    facilities: FacilityRiskPoint[];
}> = ({ facilities }) => {
    const { token } = theme.useToken();

    const layers: Layer[] = useMemo(
        () => [
            {
                key: "all",
                label: "All facilities using eRegistry",
                color: "#1677ff",
                description: "Every facility in the cached summary.",
                test: () => true,
            },
            {
                key: "active",
                label: "Currently active users",
                color: "#52c41a",
                description:
                    "Facilities with at least one user signed in during the selected period.",
                test: (f: FacilityRiskPoint) => f.activeUsers > 0,
            },
            {
                key: "noActivity",
                label: "No recent activity",
                color: "#bfbfbf",
                description: "Facilities with no user activity in the selected period.",
                test: (f: FacilityRiskPoint) => f.activeUsers === 0,
            },
            {
                key: "highGets",
                label: "High tracker GET volume",
                color: "#fa8c16",
                description:
                    "Facilities whose summary flagged tracker GET volume above the safe threshold.",
                test: (f: FacilityRiskPoint) => f.trackerGets > 500,
            },
            {
                key: "highPosts",
                label: "High tracker POST volume",
                color: "#fa541c",
                description: "Facilities exceeding the tracker POST volume threshold.",
                test: (f: FacilityRiskPoint) => f.trackerPosts > 500,
            },
            {
                key: "slow",
                label: "Slow request hotspots",
                color: "#722ed1",
                description: "Facilities reporting slow requests above the threshold.",
                test: (f: FacilityRiskPoint) => f.slowRequests > 10,
            },
            {
                key: "failed",
                label: "Failed syncs",
                color: "#f5222d",
                description: "Facilities with one or more failed sync runs in the period.",
                test: (f: FacilityRiskPoint) => f.failedSyncs > 0,
            },
            {
                key: "oldSession",
                label: "Old app sessions",
                color: "#13c2c2",
                description:
                    "Facilities with at least one user still running an outdated build.",
                test: (f: FacilityRiskPoint) => f.oldAppSessions > 0,
            },
        ],
        [],
    );

    const [enabled, setEnabled] = useState<Record<string, boolean>>(() => ({
        all: true,
        active: true,
        failed: true,
        slow: false,
        highGets: false,
        highPosts: false,
        noActivity: false,
        oldSession: false,
    }));

    const points = useMemo(
        () =>
            facilities.filter(
                (f) =>
                    typeof f.latitude === "number" &&
                    typeof f.longitude === "number",
            ),
        [facilities],
    );

    // Center on Uganda by default; widen bounds if we have data.
    const center: [number, number] = useMemo(() => {
        if (points.length === 0) return [1.3733, 32.2903];
        const avgLat =
            points.reduce((s, p) => s + (p.latitude ?? 0), 0) / points.length;
        const avgLng =
            points.reduce((s, p) => s + (p.longitude ?? 0), 0) / points.length;
        return [avgLat, avgLng];
    }, [points]);

    // Leaflet needs window to be defined; we render an empty state
    // server-side / in tests where it isn't.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (facilities.length === 0) {
        return (
            <Flex
                vertical
                align="center"
                justify="center"
                gap={token.marginXS}
                style={{
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    padding: token.paddingLG,
                    minHeight: 320,
                }}
            >
                <Empty
                    description={
                        <Text type="secondary">
                            No facility coordinates in the current summary.
                            When the operational pipeline publishes
                            facility risk points with latitude/longitude,
                            the map will render here.
                        </Text>
                    }
                />
            </Flex>
        );
    }

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex align="center" justify="space-between" gap={token.marginSM} wrap>
                <Title level={5} style={{ margin: 0 }}>
                    Facility coverage map
                </Title>
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {points.length} of {facilities.length} facilities have
                    coordinates
                </Text>
            </Flex>
            <Flex
                wrap
                gap={token.marginSM}
                style={{
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    padding: token.paddingSM,
                }}
            >
                {layers.map((layer) => (
                    <Tooltip key={layer.key} title={layer.description}>
                        <Checkbox
                            checked={!!enabled[layer.key]}
                            onChange={(e) =>
                                setEnabled((s) => ({
                                    ...s,
                                    [layer.key]: e.target.checked,
                                }))
                            }
                        >
                            <Text
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                }}
                            >
                                <span
                                    style={{
                                        display: "inline-block",
                                        width: 10,
                                        height: 10,
                                        borderRadius: "50%",
                                        background: layer.color,
                                    }}
                                />
                                {layer.label}
                            </Text>
                        </Checkbox>
                    </Tooltip>
                ))}
            </Flex>
            <div
                style={{
                    height: 460,
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    position: "relative",
                }}
            >
                {mounted && (
                    <MapContainer
                        center={center}
                        zoom={points.length > 1 ? 7 : 10}
                        style={{ height: "100%", width: "100%" }}
                        scrollWheelZoom={false}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />

                        {layers.map((layer) => {
                            if (!enabled[layer.key]) return null;
                            const matching = points.filter(layer.test);
                            return (
                                <LayerGroup key={layer.key}>
                                    {matching.map((f) =>
                                        layer.key === "all" ? (
                                            <Marker
                                                key={`m-${f.orgUnit}`}
                                                icon={ICON}
                                                position={[f.latitude!, f.longitude!]}
                                            >
                                                <Popup>
                                                    <PopupBody facility={f} />
                                                </Popup>
                                            </Marker>
                                        ) : (
                                            <CircleMarker
                                                key={`${layer.key}-${f.orgUnit}`}
                                                center={[f.latitude!, f.longitude!]}
                                                radius={
                                                    layer.key === "active"
                                                        ? Math.min(
                                                              4 + f.activeUsers,
                                                              16,
                                                          )
                                                        : 8
                                                }
                                                pathOptions={{
                                                    color: layer.color,
                                                    fillColor: layer.color,
                                                    fillOpacity: 0.6,
                                                    weight: 1,
                                                }}
                                            >
                                                <Popup>
                                                    <PopupBody facility={f} />
                                                </Popup>
                                            </CircleMarker>
                                        ),
                                    )}
                                </LayerGroup>
                            );
                        })}
                    </MapContainer>
                )}
            </div>
        </Flex>
    );
};

const PopupBody: React.FC<{ facility: FacilityRiskPoint }> = ({ facility }) => (
    <div style={{ minWidth: 200 }}>
        <strong>{facility.name}</strong>
        <div style={{ color: "#888", fontSize: 12, marginBottom: 6 }}>
            {[facility.districtName, facility.regionName]
                .filter(Boolean)
                .join(" · ") || "—"}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.4 }}>
            <div>
                Status:{" "}
                <span
                    style={{
                        color: statusColor(facility.status, "#333"),
                        fontWeight: 600,
                    }}
                >
                    {facility.status}
                </span>
            </div>
            <div>Active users: {facility.activeUsers}</div>
            <div>Tracker GETs: {facility.trackerGets}</div>
            <div>Tracker POSTs: {facility.trackerPosts}</div>
            <div>Slow requests: {facility.slowRequests}</div>
            <div>Failed syncs: {facility.failedSyncs}</div>
            <div>Old sessions: {facility.oldAppSessions}</div>
            {facility.lastActivityAt && (
                <div>Last activity: {facility.lastActivityAt}</div>
            )}
            {facility.riskReasons.length > 0 && (
                <div style={{ marginTop: 4 }}>
                    <strong>Top risks:</strong>{" "}
                    {facility.riskReasons.slice(0, 2).join("; ")}
                </div>
            )}
        </div>
    </div>
);
