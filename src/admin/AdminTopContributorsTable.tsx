import {
    DownloadOutlined,
    EnvironmentOutlined,
    SearchOutlined,
} from "@ant-design/icons";
import {
    Button,
    Empty,
    Flex,
    Input,
    Segmented,
    Select,
    Table,
    Tag,
    theme,
    Tooltip,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import React, { useMemo, useState } from "react";
import { FacilityRiskPoint, HealthStatus } from "./summaryTypes";
import { useProgramFacilities } from "./useProgramFacilities";

const { Title, Text } = Typography;

/**
 * Merged row: one per program-enrolled facility, hydrated with summary
 * data when available. `risk === undefined` means the operational
 * summary has not been generated for this facility yet — its row still
 * appears so admins can see total coverage.
 */
interface ContributorRow {
    orgUnit: string;
    name: string;
    districtName?: string;
    regionName?: string;
    hasCoords: boolean;
    risk?: FacilityRiskPoint;
}

function statusTag(status: HealthStatus | "unknown"): React.ReactNode {
    const map: Record<HealthStatus, { color: string; label: string }> = {
        healthy: { color: "green", label: "Healthy" },
        watch: { color: "gold", label: "Watch" },
        degraded: { color: "orange", label: "Degraded" },
        critical: { color: "red", label: "Critical" },
        unknown: { color: "default", label: "No data" },
    };
    const entry = map[status];
    return <Tag color={entry.color}>{entry.label}</Tag>;
}

function downloadCsv(rows: ContributorRow[]): void {
    const headers = [
        "orgUnit",
        "name",
        "district",
        "region",
        "hasCoordinates",
        "hasSummary",
        "status",
        "activeUsers",
        "trackerGets",
        "trackerPosts",
        "slowRequests",
        "responseMb",
        "failedSyncs",
        "oldAppSessions",
        "primaryRiskReason",
        "lastActivityAt",
    ];
    const escape = (v: unknown) => {
        const s = v === undefined || v === null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    rows.forEach((r) => {
        lines.push(
            [
                r.orgUnit,
                r.name,
                r.districtName ?? "",
                r.regionName ?? "",
                r.hasCoords ? "yes" : "no",
                r.risk ? "yes" : "no",
                r.risk?.status ?? "",
                r.risk?.activeUsers ?? "",
                r.risk?.trackerGets ?? "",
                r.risk?.trackerPosts ?? "",
                r.risk?.slowRequests ?? "",
                r.risk?.responseMb ?? "",
                r.risk?.failedSyncs ?? "",
                r.risk?.oldAppSessions ?? "",
                r.risk?.riskReasons[0] ?? "",
                r.risk?.lastActivityAt ?? "",
            ]
                .map(escape)
                .join(","),
        );
    });
    const blob = new Blob([lines.join("\n")], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eregisters-program-facilities-${dayjs().format("YYYYMMDD-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export const AdminTopContributorsTable: React.FC<{
    rows: FacilityRiskPoint[];
}> = ({ rows }) => {
    const { token } = theme.useToken();
    const { facilities: programFacilities, loading } = useProgramFacilities();

    const [statusFilter, setStatusFilter] = useState<HealthStatus | "all">("all");
    const [districtFilter, setDistrictFilter] = useState<string | undefined>();
    const [regionFilter, setRegionFilter] = useState<string | undefined>();
    const [summaryFilter, setSummaryFilter] = useState<"all" | "yes" | "no">(
        "all",
    );
    const [coordsFilter, setCoordsFilter] = useState<"all" | "yes" | "no">(
        "all",
    );
    const [search, setSearch] = useState("");

    // Index summary rows by org-unit id for O(1) hydration.
    const riskById = useMemo(() => {
        const m = new Map<string, FacilityRiskPoint>();
        for (const r of rows) m.set(r.orgUnit, r);
        return m;
    }, [rows]);

    // Build the full list from program metadata; fall back to summary rows
    // for any contributors that aren't in the program list (rare, but keeps
    // the data honest).
    const merged: ContributorRow[] = useMemo(() => {
        const seen = new Set<string>();
        const out: ContributorRow[] = programFacilities.map((f) => {
            seen.add(f.id);
            const risk = riskById.get(f.id);
            return {
                orgUnit: f.id,
                name: f.displayName,
                districtName: f.parentName ?? risk?.districtName,
                regionName: risk?.regionName,
                hasCoords:
                    typeof f.latitude === "number" &&
                    typeof f.longitude === "number",
                risk,
            };
        });
        for (const r of rows) {
            if (seen.has(r.orgUnit)) continue;
            out.push({
                orgUnit: r.orgUnit,
                name: r.name,
                districtName: r.districtName,
                regionName: r.regionName,
                hasCoords:
                    typeof r.latitude === "number" &&
                    typeof r.longitude === "number",
                risk: r,
            });
        }
        return out;
    }, [programFacilities, rows, riskById]);

    const districts = useMemo(() => {
        const set = new Set<string>();
        for (const r of merged) if (r.districtName) set.add(r.districtName);
        return Array.from(set).sort();
    }, [merged]);

    const regions = useMemo(() => {
        const set = new Set<string>();
        for (const r of merged) if (r.regionName) set.add(r.regionName);
        return Array.from(set).sort();
    }, [merged]);

    const filtered = useMemo(() => {
        const lc = search.trim().toLowerCase();
        return merged.filter((r) => {
            const status = r.risk?.status ?? "unknown";
            if (statusFilter !== "all" && status !== statusFilter)
                return false;
            if (districtFilter && r.districtName !== districtFilter)
                return false;
            if (regionFilter && r.regionName !== regionFilter) return false;
            if (summaryFilter === "yes" && !r.risk) return false;
            if (summaryFilter === "no" && r.risk) return false;
            if (coordsFilter === "yes" && !r.hasCoords) return false;
            if (coordsFilter === "no" && r.hasCoords) return false;
            if (lc && !`${r.name} ${r.orgUnit}`.toLowerCase().includes(lc))
                return false;
            return true;
        });
    }, [
        merged,
        statusFilter,
        districtFilter,
        regionFilter,
        summaryFilter,
        coordsFilter,
        search,
    ]);

    const columns: ColumnsType<ContributorRow> = [
        {
            title: "#",
            key: "rank",
            width: 50,
            render: (_, __, i) => i + 1,
        },
        {
            title: "Facility",
            dataIndex: "name",
            key: "name",
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (name: string, r) => (
                <Flex vertical>
                    <Flex align="center" gap={6}>
                        <Text strong>{name}</Text>
                        {r.hasCoords && (
                            <Tooltip title="Coordinates available on org-unit metadata">
                                <EnvironmentOutlined
                                    style={{
                                        color: token.colorPrimary,
                                        fontSize: 12,
                                    }}
                                />
                            </Tooltip>
                        )}
                    </Flex>
                    {(r.districtName || r.regionName) && (
                        <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                        >
                            {[r.districtName, r.regionName]
                                .filter(Boolean)
                                .join(" · ")}
                        </Text>
                    )}
                </Flex>
            ),
        },
        {
            title: "Status",
            key: "status",
            width: 110,
            render: (_, r) => statusTag(r.risk?.status ?? "unknown"),
            sorter: (a, b) => {
                const order: Record<string, number> = {
                    critical: 0,
                    degraded: 1,
                    watch: 2,
                    healthy: 3,
                    unknown: 4,
                };
                return (
                    (order[a.risk?.status ?? "unknown"] ?? 9) -
                    (order[b.risk?.status ?? "unknown"] ?? 9)
                );
            },
        },
        {
            title: "Users",
            key: "activeUsers",
            width: 70,
            sorter: (a, b) =>
                (a.risk?.activeUsers ?? -1) - (b.risk?.activeUsers ?? -1),
            render: (_, r) => r.risk?.activeUsers ?? <Text type="secondary">—</Text>,
        },
        {
            title: "GETs",
            key: "trackerGets",
            width: 80,
            sorter: (a, b) =>
                (a.risk?.trackerGets ?? -1) - (b.risk?.trackerGets ?? -1),
            render: (_, r) => r.risk?.trackerGets ?? <Text type="secondary">—</Text>,
        },
        {
            title: "POSTs",
            key: "trackerPosts",
            width: 80,
            sorter: (a, b) =>
                (a.risk?.trackerPosts ?? -1) - (b.risk?.trackerPosts ?? -1),
            render: (_, r) =>
                r.risk?.trackerPosts ?? <Text type="secondary">—</Text>,
        },
        {
            title: "Slow",
            key: "slowRequests",
            width: 70,
            sorter: (a, b) =>
                (a.risk?.slowRequests ?? -1) - (b.risk?.slowRequests ?? -1),
            render: (_, r) =>
                r.risk?.slowRequests ?? <Text type="secondary">—</Text>,
        },
        {
            title: "MB",
            key: "responseMb",
            width: 70,
            sorter: (a, b) =>
                (a.risk?.responseMb ?? -1) - (b.risk?.responseMb ?? -1),
            render: (_, r) => r.risk?.responseMb ?? <Text type="secondary">—</Text>,
        },
        {
            title: "Failed",
            key: "failedSyncs",
            width: 80,
            sorter: (a, b) =>
                (a.risk?.failedSyncs ?? -1) - (b.risk?.failedSyncs ?? -1),
            render: (_, r) =>
                r.risk?.failedSyncs ?? <Text type="secondary">—</Text>,
        },
        {
            title: "Old sessions",
            key: "oldAppSessions",
            width: 110,
            sorter: (a, b) =>
                (a.risk?.oldAppSessions ?? -1) - (b.risk?.oldAppSessions ?? -1),
            render: (_, r) =>
                r.risk?.oldAppSessions ?? <Text type="secondary">—</Text>,
        },
        {
            title: "Primary risk",
            key: "risk",
            render: (_, r) =>
                r.risk?.riskReasons[0] ? (
                    <Text>{r.risk.riskReasons[0]}</Text>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: "Last activity",
            key: "lastActivityAt",
            width: 150,
            render: (_, r) =>
                r.risk?.lastActivityAt ? (
                    <Text style={{ whiteSpace: "nowrap" }}>
                        {dayjs(r.risk.lastActivityAt).format("MMM D, HH:mm")}
                    </Text>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
    ];

    const summarised = merged.filter((m) => m.risk).length;

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex align="center" justify="space-between" gap={token.marginSM} wrap>
                <Flex vertical gap={token.marginXXS}>
                    <Title level={5} style={{ margin: 0 }}>
                        Contributing facilities
                    </Title>
                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                        {merged.length.toLocaleString()} program-enrolled ·{" "}
                        {summarised.toLocaleString()} with operational summary ·{" "}
                        {filtered.length.toLocaleString()} shown
                    </Text>
                </Flex>
                <Flex gap={token.marginXS} wrap>
                    <Input
                        placeholder="Search facility"
                        prefix={<SearchOutlined />}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        allowClear
                        style={{ width: 200 }}
                    />
                    <Button
                        icon={<DownloadOutlined />}
                        disabled={filtered.length === 0}
                        onClick={() => downloadCsv(filtered)}
                    >
                        Export CSV
                    </Button>
                </Flex>
            </Flex>

            <Flex gap={token.marginXS} wrap>
                <Select
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v)}
                    options={[
                        { value: "all", label: "All statuses" },
                        { value: "critical", label: "Critical" },
                        { value: "degraded", label: "Degraded" },
                        { value: "watch", label: "Watch" },
                        { value: "healthy", label: "Healthy" },
                        { value: "unknown", label: "No data" },
                    ]}
                    style={{ width: 160 }}
                />
                {regions.length > 0 && (
                    <Select
                        value={regionFilter}
                        onChange={setRegionFilter}
                        options={[
                            { value: undefined, label: "All regions" },
                            ...regions.map((r) => ({ value: r, label: r })),
                        ]}
                        style={{ minWidth: 160 }}
                        allowClear
                        placeholder="Region"
                    />
                )}
                {districts.length > 0 && (
                    <Select
                        value={districtFilter}
                        onChange={setDistrictFilter}
                        options={[
                            { value: undefined, label: "All districts" },
                            ...districts.map((d) => ({ value: d, label: d })),
                        ]}
                        style={{ minWidth: 160 }}
                        allowClear
                        placeholder="District"
                    />
                )}
                <Segmented
                    value={summaryFilter}
                    onChange={(v) => setSummaryFilter(v as typeof summaryFilter)}
                    options={[
                        { value: "all", label: "Any data" },
                        { value: "yes", label: "With summary" },
                        { value: "no", label: "No summary" },
                    ]}
                />
                <Segmented
                    value={coordsFilter}
                    onChange={(v) => setCoordsFilter(v as typeof coordsFilter)}
                    options={[
                        { value: "all", label: "Any coords" },
                        { value: "yes", label: "Geo-located" },
                        { value: "no", label: "Missing coords" },
                    ]}
                />
            </Flex>

            {filtered.length === 0 ? (
                <Empty
                    description={
                        merged.length === 0
                            ? loading
                                ? "Loading program facilities…"
                                : "No facilities enrolled in this program."
                            : "No facilities match the current filters."
                    }
                    style={{
                        background: token.colorBgContainer,
                        padding: token.paddingLG,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                />
            ) : (
                <Table
                    columns={columns}
                    dataSource={filtered}
                    rowKey="orgUnit"
                    size="small"
                    loading={loading && merged.length === 0}
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        pageSizeOptions: ["20", "50", "100", "500"],
                    }}
                />
            )}
        </Flex>
    );
};
