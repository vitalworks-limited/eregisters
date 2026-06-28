import { ReloadOutlined, UserOutlined } from "@ant-design/icons";
import { useDataEngine } from "@dhis2/app-runtime";
import { createRoute } from "@tanstack/react-router";
import {
    Button,
    Col,
    Empty,
    Flex,
    Input,
    Row,
    Segmented,
    Table,
    Tag,
    theme,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import React, { useEffect, useMemo, useState } from "react";
import { MiniSparkline, StageBarChart } from "../components/charts";
import { useMetadata } from "../hooks/useMetadata";
import { AdminRoute } from "./admin";

const { Title, Text } = Typography;

export const AdminUsersRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "users",
    component: AdminUsers,
});

type RangeKey = "7d" | "30d" | "90d" | "all";

const RANGE_DAYS: Record<RangeKey, number | undefined> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    all: undefined,
};

interface UserRow {
    id: string;
    name: string;
    username: string;
    lastLogin?: string;
    organisationUnits: Array<{ id: string; name: string }>;
    userRoles: Array<{ id: string; name: string }>;
    disabled?: boolean;
}

interface UsersQueryResult {
    users: {
        users: UserRow[];
        pager?: { total: number; pageCount: number; pageSize: number };
    };
}

/**
 * Session state derived from `lastLogin`. DHIS2 doesn't expose a true
 * presence flag over REST, so we infer:
 *   ≤ 15 min            → Active (token used very recently)
 *   15 min – 1 h        → Idle (in session but no recent activity)
 *   1 h – 30 d          → Closed (session has timed out; we report
 *                          time-since-login as the time-logged-out)
 *   > 30 d              → Inactive (not seen in over a month)
 *   never               → Never logged in
 *   disabled flag       → Disabled (overrides everything else)
 */
type SessionLabel =
    | "Active"
    | "Idle"
    | "Closed"
    | "Inactive"
    | "Never"
    | "Disabled";

interface SessionState {
    label: SessionLabel;
    color: string;
    sub?: string;
}

function classifySession(u: { lastLogin?: string; disabled?: boolean }): SessionState {
    if (u.disabled) {
        return { label: "Disabled", color: "red" };
    }
    if (!u.lastLogin) {
        return { label: "Never", color: "default" };
    }
    const mins = dayjs().diff(dayjs(u.lastLogin), "minute");
    if (mins <= 15) {
        return { label: "Active", color: "green", sub: "Recent activity" };
    }
    if (mins <= 60) {
        return { label: "Idle", color: "gold", sub: `Idle for ${mins}m` };
    }
    const elapsed = dayjs(u.lastLogin).fromNow(true);
    if (mins <= 60 * 24 * 30) {
        return {
            label: "Closed",
            color: "default",
            sub: `Logged out ${elapsed} ago`,
        };
    }
    return {
        label: "Inactive",
        color: "orange",
        sub: `No login for ${elapsed}`,
    };
}

function AdminUsers() {
    const { token } = theme.useToken();
    const engine = useDataEngine();
    const { orgUnit } = useMetadata();
    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [range, setRange] = useState<RangeKey>("30d");
    const [scope, setScope] = useState<"facility" | "all">("facility");

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string> = {
                fields: "id,name,username,disabled,lastLogin,organisationUnits[id,name],userRoles[id,name]",
                paging: "true",
                pageSize: "500",
            };
            if (scope === "facility" && orgUnit?.id) {
                params.filter = `organisationUnits.id:eq:${orgUnit.id}`;
            }
            const result = (await engine.query({
                users: {
                    resource: "users",
                    params,
                },
            })) as unknown as UsersQueryResult;
            setUsers(result.users.users ?? []);
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Failed to load users from DHIS2",
            );
            setUsers([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, [scope, orgUnit?.id]);

    const filtered = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return users;
        return users.filter(
            (u) =>
                u.name?.toLowerCase().includes(q) ||
                u.username?.toLowerCase().includes(q),
        );
    }, [users, filter]);

    const days = RANGE_DAYS[range];
    const cutoff = days ? dayjs().subtract(days, "day") : undefined;

    const totals = useMemo(() => {
        const counts: Record<SessionLabel, number> = {
            Active: 0,
            Idle: 0,
            Closed: 0,
            Inactive: 0,
            Never: 0,
            Disabled: 0,
        };
        let activeInRange = 0;
        for (const u of filtered) {
            counts[classifySession(u).label] += 1;
            if (u.lastLogin && (!cutoff || dayjs(u.lastLogin).isAfter(cutoff))) {
                activeInRange += 1;
            }
        }
        return { ...counts, activeInRange };
    }, [filtered, cutoff]);

    // Logins-per-day trend over the selected range. DHIS2 doesn't expose
    // a per-login event stream, but the lastLogin timestamps still let
    // us draw a rough "users active per day" picture by bucketing each
    // user into the day of their most recent login.
    const dailyLogins = useMemo(() => {
        const days = RANGE_DAYS[range] ?? 30;
        const buckets = new Map<string, number>();
        const start = dayjs().subtract(days - 1, "day").startOf("day");
        for (let i = 0; i < days; i += 1) {
            buckets.set(start.add(i, "day").format("YYYY-MM-DD"), 0);
        }
        for (const u of filtered) {
            if (!u.lastLogin) continue;
            const key = dayjs(u.lastLogin).format("YYYY-MM-DD");
            if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        return Array.from(buckets.values());
    }, [filtered, range]);

    // Active counts per role bar chart.
    const usersByRole = useMemo(() => {
        const counts = new Map<string, number>();
        for (const u of filtered) {
            for (const r of u.userRoles ?? []) {
                const k = r.name || "Unnamed role";
                counts.set(k, (counts.get(k) ?? 0) + 1);
            }
            if ((u.userRoles ?? []).length === 0) {
                counts.set("(no role)", (counts.get("(no role)") ?? 0) + 1);
            }
        }
        return Array.from(counts.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }, [filtered]);

    const columns: ColumnsType<UserRow> = [
        {
            title: "Name",
            dataIndex: "name",
            key: "name",
            render: (v: string, r) => (
                <Flex vertical gap={0}>
                    <Text strong>{v}</Text>
                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                        {r.username}
                    </Text>
                </Flex>
            ),
        },
        {
            title: "Last login",
            dataIndex: "lastLogin",
            key: "lastLogin",
            sorter: (a, b) =>
                (a.lastLogin
                    ? dayjs(a.lastLogin).valueOf()
                    : 0) -
                (b.lastLogin ? dayjs(b.lastLogin).valueOf() : 0),
            render: (v?: string) =>
                v ? (
                    <Text style={{ whiteSpace: "nowrap" }}>
                        {dayjs(v).format("MMM D, HH:mm")}
                        <Text
                            type="secondary"
                            style={{ marginLeft: 6, fontSize: token.fontSizeSM }}
                        >
                            · {dayjs(v).fromNow(true)} ago
                        </Text>
                    </Text>
                ) : (
                    <Tag color="default">Never</Tag>
                ),
        },
        {
            title: range === "all" ? "Ever logged in" : `In ${range}`,
            key: "inRange",
            width: 120,
            render: (_, r) => {
                if (!r.lastLogin) return <Tag color="default">No</Tag>;
                if (cutoff && dayjs(r.lastLogin).isBefore(cutoff)) {
                    return <Tag color="default">No</Tag>;
                }
                return <Tag color="green">Yes</Tag>;
            },
        },
        {
            title: "Session",
            key: "session",
            width: 180,
            render: (_, r) => {
                const status = classifySession(r);
                return (
                    <Flex vertical gap={0}>
                        <Tag color={status.color} style={{ alignSelf: "flex-start" }}>
                            {status.label}
                        </Tag>
                        {status.sub && (
                            <Text
                                type="secondary"
                                style={{ fontSize: token.fontSizeSM }}
                            >
                                {status.sub}
                            </Text>
                        )}
                    </Flex>
                );
            },
        },
        {
            title: "Org units",
            key: "ou",
            render: (_, r) => (
                <Text style={{ fontSize: token.fontSizeSM }}>
                    {(r.organisationUnits ?? [])
                        .map((o) => o.name)
                        .slice(0, 2)
                        .join(", ")}
                    {(r.organisationUnits ?? []).length > 2 &&
                        ` +${(r.organisationUnits ?? []).length - 2}`}
                </Text>
            ),
        },
        {
            title: "Roles",
            key: "roles",
            render: (_, r) => (
                <Flex gap={token.marginXXS} wrap>
                    {(r.userRoles ?? []).slice(0, 2).map((role) => (
                        <Tag key={role.id} style={{ margin: 0 }}>
                            {role.name}
                        </Tag>
                    ))}
                    {(r.userRoles ?? []).length > 2 && (
                        <Tag style={{ margin: 0 }}>
                            +{(r.userRoles ?? []).length - 2}
                        </Tag>
                    )}
                </Flex>
            ),
        },
    ];

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex align="center" justify="space-between" gap={token.marginSM} wrap>
                <Flex vertical gap={token.marginXXS}>
                    <Title level={5} style={{ margin: 0 }}>
                        Users
                    </Title>
                    <Text type="secondary">
                        {scope === "facility"
                            ? `Users assigned to ${orgUnit?.name ?? "this facility"}`
                            : "All DHIS2 users this admin can read"}
                    </Text>
                </Flex>
                <Flex gap={token.marginXS} wrap align="center">
                    <Segmented
                        options={[
                            { value: "facility", label: "This facility" },
                            { value: "all", label: "All users" },
                        ]}
                        value={scope}
                        onChange={(v) => setScope(v as "facility" | "all")}
                    />
                    <Segmented
                        options={[
                            { value: "7d", label: "7d" },
                            { value: "30d", label: "30d" },
                            { value: "90d", label: "90d" },
                            { value: "all", label: "All" },
                        ]}
                        value={range}
                        onChange={(v) => setRange(v as RangeKey)}
                    />
                    <Button icon={<ReloadOutlined />} loading={loading} onClick={load}>
                        Reload
                    </Button>
                </Flex>
            </Flex>

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={12} sm={6} lg={4}>
                    <MetricCard
                        label="Total"
                        value={filtered.length}
                        accent={token.colorPrimary}
                    />
                </Col>
                <Col xs={12} sm={6} lg={4}>
                    <MetricCard
                        label="Active"
                        value={totals.Active}
                        accent={token.colorSuccess}
                        sublabel="Token used in last 15 min"
                    />
                </Col>
                <Col xs={12} sm={6} lg={4}>
                    <MetricCard
                        label="Idle"
                        value={totals.Idle}
                        accent={token.colorWarning}
                        sublabel="In session, 15 min – 1 h"
                    />
                </Col>
                <Col xs={12} sm={6} lg={4}>
                    <MetricCard
                        label="Closed"
                        value={totals.Closed}
                        accent={token.colorInfo}
                        sublabel="Session expired (1 h – 30 d)"
                    />
                </Col>
                <Col xs={12} sm={6} lg={4}>
                    <MetricCard
                        label="Inactive"
                        value={totals.Inactive}
                        accent={token.colorWarning}
                        sublabel="No login in over 30 days"
                    />
                </Col>
                <Col xs={12} sm={6} lg={4}>
                    <MetricCard
                        label="Never / Disabled"
                        value={totals.Never + totals.Disabled}
                        accent={token.colorTextTertiary}
                        sublabel={
                            totals.Disabled > 0
                                ? `${totals.Disabled} disabled in DHIS2`
                                : "No prior login"
                        }
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
                            Most recent logins over time
                        </Title>
                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                            Each bucket counts users whose most recent login
                            falls on that day — a coarse "active per day"
                            signal derived from DHIS2 lastLogin timestamps.
                        </Text>
                        <MiniSparkline
                            values={dailyLogins}
                            color={token.colorPrimary}
                            height={120}
                            fillWidth
                        />
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
                            Users per role
                        </Title>
                        <StageBarChart items={usersByRole} maxItems={8} />
                    </Flex>
                </Col>
            </Row>

            <Flex vertical gap={token.marginXS}>
                <Flex align="center" gap={token.marginSM} wrap>
                    <Input.Search
                        placeholder="Filter by name or username"
                        allowClear
                        onChange={(e) => setFilter(e.target.value)}
                        style={{ maxWidth: 360 }}
                    />
                    <Text type="secondary">
                        {filtered.length === users.length
                            ? `${users.length} users`
                            : `${filtered.length} of ${users.length}`}
                    </Text>
                </Flex>
                <div
                    style={{
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    {error ? (
                        <div style={{ padding: token.paddingXL }}>
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={
                                    <Flex vertical align="center" gap={token.marginXS}>
                                        <Text strong>Couldn't load users</Text>
                                        <Text
                                            type="secondary"
                                            style={{ fontSize: token.fontSizeSM }}
                                        >
                                            {error}
                                        </Text>
                                    </Flex>
                                }
                            />
                        </div>
                    ) : (
                        <Table
                            columns={columns}
                            dataSource={filtered}
                            rowKey="id"
                            size="small"
                            loading={loading}
                            pagination={{
                                pageSize: 20,
                                showSizeChanger: true,
                                pageSizeOptions: ["20", "50", "100"],
                            }}
                            locale={{
                                emptyText: (
                                    <Flex
                                        vertical
                                        align="center"
                                        gap={token.marginXS}
                                        style={{ padding: token.paddingLG }}
                                    >
                                        <UserOutlined
                                            style={{ fontSize: 24, color: token.colorTextTertiary }}
                                        />
                                        <Text type="secondary">
                                            No users to show.
                                        </Text>
                                    </Flex>
                                ),
                            }}
                        />
                    )}
                </div>
            </Flex>
        </Flex>
    );
}

function MetricCard({
    label,
    value,
    accent,
    sublabel,
}: {
    label: string;
    value: React.ReactNode;
    accent: string;
    sublabel?: string;
}) {
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
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {label}
            </Text>
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
