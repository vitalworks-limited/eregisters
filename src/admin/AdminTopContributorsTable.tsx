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
import { useOrgUnitLevels } from "./useOrgUnitLevels";
import {
    AncestorRef,
    useProgramFacilities,
} from "./useProgramFacilities";
import { useUsersByOrgUnit } from "./useUsersByOrgUnit";

const { Title, Text } = Typography;

interface ContributorRow {
    orgUnit: string;
    name: string;
    parentName?: string;
    ancestors: AncestorRef[];
    /** Map<level, ancestorId> — used for cascading filters. */
    ancestorByLevel: Map<number, AncestorRef>;
    hasCoords: boolean;
    /** Direct DHIS2 user assignment at this org unit only. */
    directActiveUsers: number;
    directTotalUsers: number;
    /**
     * Effective user reach — users assigned at this facility *or* at
     * any ancestor (region/district/etc.). This is what determines
     * who can actually log in and work at the facility in DHIS2.
     */
    activeUserCount: number;
    totalUserCount: number;
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
        "parent",
        "ancestors",
        "hasCoordinates",
        "hasSummary",
        "status",
        "users",
        "activeUsersInPeriod",
        "loggedInNow",
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
                r.parentName ?? "",
                r.ancestors.map((a) => a.displayName).join(" / "),
                r.hasCoords ? "yes" : "no",
                r.risk ? "yes" : "no",
                r.risk?.status ?? "",
                r.activeUserCount,
                r.risk?.activeUsers ?? "",
                r.risk?.loggedInUsers ?? "",
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
    const { facilities: programFacilities, loading: facLoading } =
        useProgramFacilities();
    const { levels: orgUnitLevels } = useOrgUnitLevels();
    const { counts: userCounts, loading: usersLoading } = useUsersByOrgUnit();

    const [statusFilter, setStatusFilter] = useState<HealthStatus | "all">("all");
    const [summaryFilter, setSummaryFilter] = useState<"all" | "yes" | "no">(
        "all",
    );
    const [coordsFilter, setCoordsFilter] = useState<"all" | "yes" | "no">(
        "all",
    );
    /** Map<level, selectedAncestorId> — drives the cascading filter selects. */
    const [hierarchy, setHierarchy] = useState<Map<number, string>>(
        new Map(),
    );
    const [search, setSearch] = useState("");
    const [showAll, setShowAll] = useState(false);

    const riskById = useMemo(() => {
        const m = new Map<string, FacilityRiskPoint>();
        for (const r of rows) m.set(r.orgUnit, r);
        return m;
    }, [rows]);

    const merged: ContributorRow[] = useMemo(() => {
        const seen = new Set<string>();
        const sumWithAncestors = (
            facId: string,
            ancestors: AncestorRef[],
            source: Map<string, number>,
        ) => {
            let total = source.get(facId) ?? 0;
            for (const a of ancestors) total += source.get(a.id) ?? 0;
            return total;
        };
        const out: ContributorRow[] = programFacilities.map((f) => {
            seen.add(f.id);
            const risk = riskById.get(f.id);
            const ancestorByLevel = new Map<number, AncestorRef>();
            for (const a of f.ancestors) ancestorByLevel.set(a.level, a);
            const directActive = userCounts.activeById.get(f.id) ?? 0;
            const directTotal = userCounts.totalById.get(f.id) ?? 0;
            return {
                orgUnit: f.id,
                name: f.displayName,
                parentName: f.parentName,
                ancestors: f.ancestors,
                ancestorByLevel,
                hasCoords:
                    typeof f.latitude === "number" &&
                    typeof f.longitude === "number",
                directActiveUsers: directActive,
                directTotalUsers: directTotal,
                activeUserCount: sumWithAncestors(
                    f.id,
                    f.ancestors,
                    userCounts.activeById,
                ),
                totalUserCount: sumWithAncestors(
                    f.id,
                    f.ancestors,
                    userCounts.totalById,
                ),
                risk,
            };
        });
        for (const r of rows) {
            if (seen.has(r.orgUnit)) continue;
            const directActive = userCounts.activeById.get(r.orgUnit) ?? 0;
            const directTotal = userCounts.totalById.get(r.orgUnit) ?? 0;
            out.push({
                orgUnit: r.orgUnit,
                name: r.name,
                parentName: r.districtName,
                ancestors: [],
                ancestorByLevel: new Map(),
                hasCoords:
                    typeof r.latitude === "number" &&
                    typeof r.longitude === "number",
                directActiveUsers: directActive,
                directTotalUsers: directTotal,
                activeUserCount: directActive,
                totalUserCount: directTotal,
                risk: r,
            });
        }
        return out;
    }, [programFacilities, rows, riskById, userCounts]);

    // Derive which hierarchy levels are present in the data so we don't
    // render filters for empty levels.
    const populatedLevels = useMemo(() => {
        const present = new Set<number>();
        for (const r of merged)
            for (const a of r.ancestors) present.add(a.level);
        return Array.from(present).sort((a, b) => a - b);
    }, [merged]);

    // Filter facilities by the cascading hierarchy first — each higher
    // level constrains the choices at lower levels.
    const ancestryFiltered = useMemo(() => {
        if (hierarchy.size === 0) return merged;
        return merged.filter((r) => {
            for (const [level, selectedId] of hierarchy) {
                const ancestor = r.ancestorByLevel.get(level);
                if (!ancestor || ancestor.id !== selectedId) return false;
            }
            return true;
        });
    }, [merged, hierarchy]);

    /** Options for each level select: only ancestors present after the
     *  upstream constraints are applied. */
    const levelOptions = useMemo(() => {
        const out = new Map<
            number,
            { value: string; label: string }[]
        >();
        for (const level of populatedLevels) {
            const seen = new Map<string, AncestorRef>();
            for (const r of ancestryFiltered) {
                const a = r.ancestorByLevel.get(level);
                if (a && !seen.has(a.id)) seen.set(a.id, a);
            }
            const opts = Array.from(seen.values())
                .sort((a, b) => a.displayName.localeCompare(b.displayName))
                .map((a) => ({ value: a.id, label: a.displayName }));
            out.set(level, opts);
        }
        return out;
    }, [populatedLevels, ancestryFiltered]);

    const filtered = useMemo(() => {
        const lc = search.trim().toLowerCase();
        return ancestryFiltered.filter((r) => {
            const status = r.risk?.status ?? "unknown";
            if (statusFilter !== "all" && status !== statusFilter)
                return false;
            if (summaryFilter === "yes" && !r.risk) return false;
            if (summaryFilter === "no" && r.risk) return false;
            if (coordsFilter === "yes" && !r.hasCoords) return false;
            if (coordsFilter === "no" && r.hasCoords) return false;
            if (lc && !`${r.name} ${r.orgUnit}`.toLowerCase().includes(lc))
                return false;
            return true;
        });
    }, [
        ancestryFiltered,
        statusFilter,
        summaryFilter,
        coordsFilter,
        search,
    ]);

    const setLevelFilter = (level: number, value?: string) => {
        setHierarchy((prev) => {
            const next = new Map(prev);
            if (!value) {
                next.delete(level);
                // Clearing an upstream level also clears all dependents.
                for (const l of populatedLevels)
                    if (l > level) next.delete(l);
            } else {
                next.set(level, value);
            }
            return next;
        });
    };

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
                    {r.ancestors.length > 0 && (
                        <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                        >
                            {r.ancestors
                                .slice(-3)
                                .map((a) => a.displayName)
                                .join(" / ")}
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
            key: "users",
            width: 110,
            sorter: (a, b) => a.activeUserCount - b.activeUserCount,
            render: (_, r) => {
                if (r.totalUserCount === 0)
                    return <Text type="secondary">—</Text>;
                const inheritedActive =
                    r.activeUserCount - r.directActiveUsers;
                const disabled = r.totalUserCount - r.activeUserCount;
                return (
                    <Tooltip
                        title={
                            <>
                                <div>
                                    Direct at this facility:{" "}
                                    <strong>{r.directActiveUsers}</strong>
                                </div>
                                <div>
                                    Inherited from ancestors:{" "}
                                    <strong>{inheritedActive}</strong>
                                </div>
                                {disabled > 0 && (
                                    <div>Disabled (incl. ancestors): {disabled}</div>
                                )}
                            </>
                        }
                    >
                        <Text>
                            {r.activeUserCount.toLocaleString()}
                            {inheritedActive > 0 && (
                                <Text
                                    type="secondary"
                                    style={{ fontSize: 11 }}
                                >
                                    {" "}
                                    ({r.directActiveUsers} direct)
                                </Text>
                            )}
                        </Text>
                    </Tooltip>
                );
            },
        },
        {
            title: "Logged in",
            key: "loggedIn",
            width: 90,
            sorter: (a, b) =>
                (a.risk?.loggedInUsers ?? -1) -
                (b.risk?.loggedInUsers ?? -1),
            render: (_, r) =>
                r.risk?.loggedInUsers !== undefined ? (
                    <Text>{r.risk.loggedInUsers}</Text>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: "Active (period)",
            key: "activeUsers",
            width: 110,
            sorter: (a, b) =>
                (a.risk?.activeUsers ?? -1) - (b.risk?.activeUsers ?? -1),
            render: (_, r) =>
                r.risk?.activeUsers ?? <Text type="secondary">—</Text>,
        },
        {
            title: "GETs",
            key: "trackerGets",
            width: 80,
            // Surface high-volume facilities first when the user hasn't
            // explicitly chosen a sort.
            defaultSortOrder: "descend",
            sorter: (a, b) =>
                (a.risk?.trackerGets ?? -1) - (b.risk?.trackerGets ?? -1),
            render: (_, r) =>
                r.risk?.trackerGets ?? <Text type="secondary">—</Text>,
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
                (a.risk?.oldAppSessions ?? -1) -
                (b.risk?.oldAppSessions ?? -1),
            render: (_, r) =>
                r.risk?.oldAppSessions ?? <Text type="secondary">—</Text>,
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
                    <Segmented
                        value={showAll ? "all" : "paged"}
                        onChange={(v) => setShowAll(v === "all")}
                        options={[
                            { value: "paged", label: "Paged" },
                            { value: "all", label: "Show all" },
                        ]}
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
                {populatedLevels.map((level) => {
                    const opts = levelOptions.get(level) ?? [];
                    if (opts.length === 0 && !hierarchy.has(level))
                        return null;
                    const levelMeta = orgUnitLevels.find(
                        (l) => l.level === level,
                    );
                    return (
                        <Select
                            key={`level-${level}`}
                            value={hierarchy.get(level)}
                            onChange={(v) => setLevelFilter(level, v)}
                            options={opts}
                            placeholder={
                                levelMeta?.displayName ?? `Level ${level}`
                            }
                            showSearch
                            optionFilterProp="label"
                            allowClear
                            style={{ minWidth: 180 }}
                        />
                    );
                })}
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
                            ? facLoading
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
                    loading={
                        (facLoading || usersLoading) && merged.length === 0
                    }
                    className="eregisters-contributors-table"
                    pagination={
                        showAll
                            ? false
                            : {
                                  pageSize: 20,
                                  showSizeChanger: true,
                                  pageSizeOptions: [
                                      "20",
                                      "50",
                                      "100",
                                      "500",
                                  ],
                              }
                    }
                />
            )}
        </Flex>
    );
};
