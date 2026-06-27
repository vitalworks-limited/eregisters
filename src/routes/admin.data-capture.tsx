import {
    ApiOutlined,
    CalendarOutlined,
    ReloadOutlined,
    TeamOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { useDataEngine } from "@dhis2/app-runtime";
import { createRoute } from "@tanstack/react-router";
import {
    Alert,
    Col,
    Flex,
    Input,
    Row,
    Segmented,
    Table,
    theme,
    Typography,
    Button,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import React, { useEffect, useMemo, useState } from "react";
import { StageBarChart } from "../components/charts";
import { useMetadata } from "../hooks/useMetadata";
import {
    invalidateCache,
    withCache,
} from "../sync/trackerActivityCache";
import { AdminRoute } from "./admin";

const { Title, Text } = Typography;

export const AdminDataCaptureRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "data-capture",
    component: AdminDataCapture,
});

type RangeKey = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<RangeKey, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
};

const RANGE_LABEL: Record<RangeKey, string> = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
};

const PROGRAM_UID = "ueBhWkWll5v";

interface Actor {
    username?: string;
    displayName?: string;
}

interface RawEnrollment {
    enrollment?: string;
    createdAt?: string;
    createdBy?: Actor;
}

interface RawEvent {
    event?: string;
    createdAt?: string;
    programStage?: string;
    createdBy?: Actor;
}

interface CaptureSummary {
    enrollments: RawEnrollment[];
    events: RawEvent[];
}

async function fetchCapture(
    engine: ReturnType<typeof useDataEngine>,
    orgUnitId: string,
    range: RangeKey,
): Promise<CaptureSummary> {
    return withCache(`capture:${orgUnitId}:${range}`, async () => {
        const updatedAfter = new Date(
            Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000,
        ).toISOString();
        // Modest page caps so the admin tab can't generate huge payloads
        // against DHIS2. 1000 is the practical ceiling for a 90-day pull
        // on a busy facility; for that, we still want one request, not ten.
        const pageSize = range === "7d" ? "200" : range === "30d" ? "500" : "1000";

        // Param names match the existing sync code in src/sync/pullData.ts
        // (orgUnits plural + ouMode), which is what the DHIS2 2.42 tracker
        // API accepts. Earlier `orgUnit` / `orgUnitMode` produced 400s.
        const baseParams: Record<string, string> = {
            program: PROGRAM_UID,
            orgUnits: orgUnitId,
            ouMode: "SELECTED",
            updatedAfter,
            pageSize,
            page: "1",
        };

        // Issue the two calls in sequence so one failing doesn't abort
        // both — DHIS2 instances sometimes expose enrollments without
        // events on older builds, and we'd rather show partial than empty.
        let enrollments: RawEnrollment[] = [];
        let events: RawEvent[] = [];
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const enrRes = (await engine.query({
                enrollments: {
                    resource: "tracker/enrollments",
                    params: {
                        ...baseParams,
                        fields: "enrollment,createdAt,createdBy[username,displayName]",
                    },
                },
            } as any)) as unknown as {
                enrollments: { instances?: RawEnrollment[] };
            };
            enrollments = enrRes.enrollments.instances ?? [];
        } catch {
            // ignore — events still useful
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const evtRes = (await engine.query({
                events: {
                    resource: "tracker/events",
                    params: {
                        ...baseParams,
                        fields: "event,createdAt,programStage,createdBy[username,displayName]",
                    },
                },
            } as any)) as unknown as {
                events: { instances?: RawEvent[] };
            };
            events = evtRes.events.instances ?? [];
        } catch (e) {
            // If both calls failed, the caller surfaces the message.
            if (enrollments.length === 0) throw e;
        }
        return { enrollments, events };
    });
}

function actorKey(a?: Actor): string {
    return a?.username ?? a?.displayName ?? "unknown";
}

function actorLabel(a?: Actor): string {
    return a?.displayName ?? a?.username ?? "Unknown";
}

interface KpiProps {
    label: string;
    value: React.ReactNode;
    icon: React.ReactNode;
    accent: string;
    sublabel?: React.ReactNode;
}

function Kpi({ label, value, icon, accent, sublabel }: KpiProps) {
    const { token } = theme.useToken();
    return (
        <Flex
            vertical
            gap={token.marginXXS}
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                padding: token.padding,
                height: "100%",
            }}
        >
            <Flex align="center" justify="space-between">
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {label}
                </Text>
                <span style={{ color: accent, fontSize: 16 }}>{icon}</span>
            </Flex>
            <span
                style={{
                    color: accent,
                    fontWeight: 600,
                    fontSize: 22,
                    lineHeight: 1.1,
                }}
            >
                {value}
            </span>
            {sublabel && (
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {sublabel}
                </Text>
            )}
        </Flex>
    );
}

interface UserSummaryRow {
    key: string;
    user: string;
    enrollments: number;
    events: number;
    lastActive?: string;
}

function AdminDataCapture() {
    const { token } = theme.useToken();
    const engine = useDataEngine();
    const { orgUnit, program } = useMetadata();
    const [range, setRange] = useState<RangeKey>("30d");
    const [data, setData] = useState<CaptureSummary>({
        enrollments: [],
        events: [],
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState("");

    const load = async (force = false) => {
        setLoading(true);
        setError(null);
        if (!orgUnit?.id) {
            setError("Facility context unavailable.");
            setLoading(false);
            return;
        }
        if (force) invalidateCache(`capture:${orgUnit.id}:${range}`);
        try {
            const result = await fetchCapture(engine, orgUnit.id, range);
            setData(result);
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Failed to load capture data from DHIS2",
            );
            setData({ enrollments: [], events: [] });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, [orgUnit?.id, range]);

    const stageNames = useMemo(() => {
        const map = new Map<string, string>();
        for (const s of program?.programStages ?? []) {
            map.set(s.id, s.name);
        }
        return map;
    }, [program]);

    const byUser = useMemo<UserSummaryRow[]>(() => {
        const map = new Map<
            string,
            { user: string; enrollments: number; events: number; lastActive?: string }
        >();
        const bump = (
            key: string,
            user: string,
            kind: "enrollments" | "events",
            at?: string,
        ) => {
            const row = map.get(key) ?? {
                user,
                enrollments: 0,
                events: 0,
                lastActive: undefined,
            };
            row[kind] += 1;
            if (at) {
                if (!row.lastActive || dayjs(at).isAfter(dayjs(row.lastActive))) {
                    row.lastActive = at;
                }
            }
            map.set(key, row);
        };
        for (const e of data.enrollments) {
            bump(
                actorKey(e.createdBy),
                actorLabel(e.createdBy),
                "enrollments",
                e.createdAt,
            );
        }
        for (const e of data.events) {
            bump(actorKey(e.createdBy), actorLabel(e.createdBy), "events", e.createdAt);
        }
        return Array.from(map.entries()).map(([key, v]) => ({
            key,
            user: v.user,
            enrollments: v.enrollments,
            events: v.events,
            lastActive: v.lastActive,
        }));
    }, [data]);

    const filteredUsers = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return byUser;
        return byUser.filter((u) => u.user.toLowerCase().includes(q));
    }, [byUser, filter]);

    const totals = useMemo(
        () => ({
            enrollments: data.enrollments.length,
            events: data.events.length,
            activeUsers: byUser.length,
            averagePerUser:
                byUser.length === 0
                    ? 0
                    : Math.round(
                          (data.enrollments.length + data.events.length) /
                              byUser.length,
                      ),
        }),
        [data, byUser],
    );

    // Per-stage event counts.
    const byStage = useMemo(() => {
        const counts = new Map<string, number>();
        for (const e of data.events) {
            const name = stageNames.get(e.programStage ?? "") ?? "Unknown stage";
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }, [data, stageNames]);

    // Per-user enrollments vs events (top 10) — fed as two parallel bars.
    const topUsersData = useMemo(() => {
        return [...byUser]
            .sort(
                (a, b) =>
                    b.enrollments + b.events - (a.enrollments + a.events),
            )
            .slice(0, 10)
            .map((u) => ({
                label: u.user,
                value: u.enrollments + u.events,
            }));
    }, [byUser]);

    const columns: ColumnsType<UserSummaryRow> = [
        {
            title: "User",
            dataIndex: "user",
            key: "user",
            render: (v: string) => <Text strong>{v}</Text>,
        },
        {
            title: "Enrollments",
            dataIndex: "enrollments",
            key: "enrollments",
            sorter: (a, b) => a.enrollments - b.enrollments,
            defaultSortOrder: "descend",
            width: 140,
        },
        {
            title: "Events",
            dataIndex: "events",
            key: "events",
            sorter: (a, b) => a.events - b.events,
            width: 100,
        },
        {
            title: "Total",
            key: "total",
            render: (_, r) => <Text strong>{r.enrollments + r.events}</Text>,
            sorter: (a, b) =>
                a.enrollments + a.events - (b.enrollments + b.events),
            width: 100,
        },
        {
            title: "Last activity",
            dataIndex: "lastActive",
            key: "lastActive",
            render: (v?: string) =>
                v ? (
                    <Flex vertical gap={0}>
                        <Text>{dayjs(v).format("MMM D, HH:mm")}</Text>
                        <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                        >
                            {dayjs(v).fromNow()}
                        </Text>
                    </Flex>
                ) : (
                    <Text type="secondary">—</Text>
                ),
            sorter: (a, b) =>
                (a.lastActive ? dayjs(a.lastActive).valueOf() : 0) -
                (b.lastActive ? dayjs(b.lastActive).valueOf() : 0),
            width: 180,
        },
    ];

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex align="center" justify="space-between" gap={token.marginSM} wrap>
                <Flex vertical gap={token.marginXXS}>
                    <Title level={5} style={{ margin: 0 }}>
                        Data capture
                    </Title>
                    <Text type="secondary">
                        Per-user enrollment and event counts for{" "}
                        {orgUnit?.name ?? "this facility"}. Cached for 5
                        minutes to keep load on DHIS2 modest.
                    </Text>
                </Flex>
                <Flex gap={token.marginXS} wrap align="center">
                    <Segmented
                        options={[
                            { value: "7d", label: "7d" },
                            { value: "30d", label: "30d" },
                            { value: "90d", label: "90d" },
                        ]}
                        value={range}
                        onChange={(v) => setRange(v as RangeKey)}
                    />
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => load(true)}
                        loading={loading}
                    >
                        Refresh
                    </Button>
                </Flex>
            </Flex>

            {error && (
                <Alert
                    type="error"
                    showIcon
                    title="Failed to load capture data"
                    description={error}
                />
            )}

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={12} sm={6}>
                    <Kpi
                        label="Enrollments"
                        value={totals.enrollments}
                        icon={<CalendarOutlined />}
                        accent={token.colorPrimary}
                        sublabel={RANGE_LABEL[range]}
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <Kpi
                        label="Events"
                        value={totals.events}
                        icon={<ApiOutlined />}
                        accent={token.colorInfo}
                        sublabel={RANGE_LABEL[range]}
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <Kpi
                        label="Active users"
                        value={totals.activeUsers}
                        icon={<TeamOutlined />}
                        accent={token.colorSuccess}
                        sublabel="Distinct capture actors"
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <Kpi
                        label="Avg per user"
                        value={totals.averagePerUser}
                        icon={<UserOutlined />}
                        accent={token.colorWarning}
                        sublabel="Records per active user"
                    />
                </Col>
            </Row>

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={24} lg={14}>
                    <Flex
                        vertical
                        gap={token.marginXS}
                        style={{
                            background: token.colorBgContainer,
                            border: `1px solid ${token.colorBorderSecondary}`,
                            padding: token.padding,
                        }}
                    >
                        <Title level={5} style={{ margin: 0 }}>
                            Top 10 users
                        </Title>
                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                            Combined enrollment + event counts, descending.
                        </Text>
                        <StageBarChart items={topUsersData} maxItems={10} />
                    </Flex>
                </Col>
                <Col xs={24} lg={10}>
                    <Flex
                        vertical
                        gap={token.marginXS}
                        style={{
                            background: token.colorBgContainer,
                            border: `1px solid ${token.colorBorderSecondary}`,
                            padding: token.padding,
                        }}
                    >
                        <Title level={5} style={{ margin: 0 }}>
                            Events by stage
                        </Title>
                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                            Where the visit volume is concentrated.
                        </Text>
                        <StageBarChart items={byStage} maxItems={8} />
                    </Flex>
                </Col>
            </Row>

            <Flex vertical gap={token.marginXS}>
                <Flex align="center" gap={token.marginSM} wrap>
                    <Input.Search
                        placeholder="Filter by user"
                        allowClear
                        onChange={(e) => setFilter(e.target.value)}
                        style={{ maxWidth: 320 }}
                    />
                    <Text type="secondary">
                        {filteredUsers.length === byUser.length
                            ? `${byUser.length} users`
                            : `${filteredUsers.length} of ${byUser.length}`}
                    </Text>
                </Flex>
                <div
                    style={{
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    <Table
                        columns={columns}
                        dataSource={filteredUsers}
                        rowKey="key"
                        size="middle"
                        loading={loading}
                        pagination={{ pageSize: 20, showSizeChanger: true }}
                    />
                </div>
            </Flex>
        </Flex>
    );
}
