import {
    DownloadOutlined,
    SearchOutlined,
} from "@ant-design/icons";
import {
    Button,
    Empty,
    Flex,
    Input,
    Select,
    Table,
    Tag,
    theme,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import React, { useMemo, useState } from "react";
import { FacilityRiskPoint, HealthStatus } from "./summaryTypes";

const { Title, Text } = Typography;

function statusTag(status: HealthStatus): React.ReactNode {
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

function downloadCsv(rows: FacilityRiskPoint[]): void {
    const headers = [
        "rank",
        "orgUnit",
        "name",
        "district",
        "region",
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
    rows.forEach((r, i) => {
        lines.push(
            [
                i + 1,
                r.orgUnit,
                r.name,
                r.districtName ?? "",
                r.regionName ?? "",
                r.status,
                r.activeUsers,
                r.trackerGets,
                r.trackerPosts,
                r.slowRequests,
                r.responseMb,
                r.failedSyncs,
                r.oldAppSessions,
                r.riskReasons[0] ?? "",
                r.lastActivityAt ?? "",
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
    a.download = `eregisters-top-facilities-${dayjs().format("YYYYMMDD-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export const AdminTopContributorsTable: React.FC<{
    rows: FacilityRiskPoint[];
}> = ({ rows }) => {
    const { token } = theme.useToken();
    const [statusFilter, setStatusFilter] = useState<HealthStatus | "all">(
        "all",
    );
    const [districtFilter, setDistrictFilter] = useState<string | undefined>();
    const [search, setSearch] = useState("");

    const districts = useMemo(() => {
        const set = new Set<string>();
        for (const r of rows) if (r.districtName) set.add(r.districtName);
        return Array.from(set).sort();
    }, [rows]);

    const filtered = useMemo(() => {
        const lc = search.trim().toLowerCase();
        return rows.filter((r) => {
            if (statusFilter !== "all" && r.status !== statusFilter)
                return false;
            if (districtFilter && r.districtName !== districtFilter)
                return false;
            if (lc && !`${r.name} ${r.orgUnit}`.toLowerCase().includes(lc))
                return false;
            return true;
        });
    }, [rows, statusFilter, districtFilter, search]);

    const columns: ColumnsType<FacilityRiskPoint> = [
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
                    <Text strong>{name}</Text>
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
            dataIndex: "status",
            key: "status",
            width: 110,
            render: (s: HealthStatus) => statusTag(s),
        },
        {
            title: "Users",
            dataIndex: "activeUsers",
            key: "activeUsers",
            width: 70,
            sorter: (a, b) => a.activeUsers - b.activeUsers,
        },
        {
            title: "GETs",
            dataIndex: "trackerGets",
            key: "trackerGets",
            width: 80,
            sorter: (a, b) => a.trackerGets - b.trackerGets,
        },
        {
            title: "POSTs",
            dataIndex: "trackerPosts",
            key: "trackerPosts",
            width: 80,
            sorter: (a, b) => a.trackerPosts - b.trackerPosts,
        },
        {
            title: "Slow",
            dataIndex: "slowRequests",
            key: "slowRequests",
            width: 70,
            sorter: (a, b) => a.slowRequests - b.slowRequests,
        },
        {
            title: "MB",
            dataIndex: "responseMb",
            key: "responseMb",
            width: 70,
            sorter: (a, b) => a.responseMb - b.responseMb,
        },
        {
            title: "Failed",
            dataIndex: "failedSyncs",
            key: "failedSyncs",
            width: 80,
            sorter: (a, b) => a.failedSyncs - b.failedSyncs,
        },
        {
            title: "Old sessions",
            dataIndex: "oldAppSessions",
            key: "oldAppSessions",
            width: 110,
            sorter: (a, b) => a.oldAppSessions - b.oldAppSessions,
        },
        {
            title: "Primary risk",
            key: "risk",
            render: (_, r) =>
                r.riskReasons[0] ? (
                    <Text>{r.riskReasons[0]}</Text>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: "Last activity",
            dataIndex: "lastActivityAt",
            key: "lastActivityAt",
            width: 150,
            render: (v?: string) =>
                v ? (
                    <Text style={{ whiteSpace: "nowrap" }}>
                        {dayjs(v).format("MMM D, HH:mm")}
                    </Text>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
    ];

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex align="center" justify="space-between" gap={token.marginSM} wrap>
                <Title level={5} style={{ margin: 0 }}>
                    Top contributing facilities
                </Title>
                <Flex gap={token.marginXS} wrap>
                    <Input
                        placeholder="Search facility"
                        prefix={<SearchOutlined />}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        allowClear
                        style={{ width: 200 }}
                    />
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
                    {districts.length > 0 && (
                        <Select
                            value={districtFilter}
                            onChange={setDistrictFilter}
                            options={[
                                { value: undefined, label: "All districts" },
                                ...districts.map((d) => ({
                                    value: d,
                                    label: d,
                                })),
                            ]}
                            style={{ minWidth: 160 }}
                            allowClear
                        />
                    )}
                    <Button
                        icon={<DownloadOutlined />}
                        disabled={filtered.length === 0}
                        onClick={() => downloadCsv(filtered)}
                    >
                        Export CSV
                    </Button>
                </Flex>
            </Flex>
            {filtered.length === 0 ? (
                <Empty
                    description={
                        rows.length === 0
                            ? "No facility risk data in the current summary."
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
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        pageSizeOptions: ["20", "50", "100"],
                    }}
                />
            )}
        </Flex>
    );
};
