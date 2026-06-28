import {
    CloudUploadOutlined,
    HourglassOutlined,
    ThunderboltOutlined,
    WarningOutlined,
} from "@ant-design/icons";
import { and, eq, useLiveQuery } from "@tanstack/react-db";
import { createRoute } from "@tanstack/react-router";
import {
    Alert,
    Col,
    Flex,
    Row,
    Table,
    Tag,
    theme,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import React, { useMemo } from "react";
import { StageBarChart } from "../components/charts";
import {
    enrollmentsCollection,
    eventsCollection,
    trackedEntitiesCollection,
} from "../collections";
import { useMetadata } from "../hooks/useMetadata";
import { SyncContext } from "../machines/sync";
import { AdminRoute } from "./admin";

const { Title, Text } = Typography;

export const AdminQueueRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "queue",
    component: AdminQueue,
});

interface QueueRow {
    type: "tracked entity" | "enrollment" | "event";
    id: string;
    createdAt?: string;
    updatedAt?: string;
    age: number; // hours
    user?: string;
    stage?: string;
}

const STALE_HOURS = 24;

function statTile(
    label: string,
    value: React.ReactNode,
    icon: React.ReactNode,
    accent: string,
    sublabel?: React.ReactNode,
    token?: ReturnType<typeof theme.useToken>["token"],
) {
    if (!token) return null;
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

function AdminQueue() {
    const { token } = theme.useToken();
    const { orgUnit, program } = useMetadata();
    const orgId = orgUnit?.id;

    const { data: pendingTE = [] } = useLiveQuery(
        (q) =>
            q
                .from({ t: trackedEntitiesCollection })
                .where(({ t }) =>
                    and(eq(t.syncStatus, "pending"), eq(t.orgUnit, orgId ?? "")),
                ),
        [orgId],
    );
    const { data: pendingEN = [] } = useLiveQuery(
        (q) =>
            q
                .from({ e: enrollmentsCollection })
                .where(({ e }) =>
                    and(eq(e.syncStatus, "pending"), eq(e.orgUnit, orgId ?? "")),
                ),
        [orgId],
    );
    const { data: pendingEV = [] } = useLiveQuery(
        (q) =>
            q
                .from({ e: eventsCollection })
                .where(({ e }) =>
                    and(eq(e.syncStatus, "pending"), eq(e.orgUnit, orgId ?? "")),
                ),
        [orgId],
    );

    const lastDataPush = SyncContext.useSelector((s) => s.context.lastDataPush);

    const stageNames = useMemo(() => {
        const out = new Map<string, string>();
        for (const s of program?.programStages ?? []) {
            out.set(s.id, s.name);
        }
        return out;
    }, [program]);

    const rows = useMemo<QueueRow[]>(() => {
        const out: QueueRow[] = [];
        const now = dayjs();
        for (const t of pendingTE) {
            out.push({
                type: "tracked entity",
                id: t.trackedEntity,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
                age: now.diff(dayjs(t.updatedAt ?? t.createdAt), "hour"),
            });
        }
        for (const e of pendingEN) {
            out.push({
                type: "enrollment",
                id: e.enrollment,
                createdAt: e.createdAt,
                updatedAt: e.updatedAt,
                age: now.diff(dayjs(e.updatedAt ?? e.createdAt), "hour"),
            });
        }
        for (const e of pendingEV) {
            out.push({
                type: "event",
                id: e.event,
                createdAt: e.createdAt,
                updatedAt: e.updatedAt,
                age: now.diff(dayjs(e.updatedAt ?? e.createdAt), "hour"),
                stage: stageNames.get(e.programStage),
            });
        }
        return out.sort((a, b) => b.age - a.age);
    }, [pendingTE, pendingEN, pendingEV, stageNames]);

    // Peak hour distribution: bucket pending records by the hour of day
    // their createdAt landed. Helps admins see when the backlog builds —
    // and align the kill switch / allowed-window controls accordingly.
    const hourBuckets = useMemo(() => {
        const buckets = Array.from({ length: 24 }, (_, i) => ({
            label: `${i.toString().padStart(2, "0")}h`,
            value: 0,
        }));
        for (const r of rows) {
            const ts = dayjs(r.createdAt ?? r.updatedAt);
            if (!ts.isValid()) continue;
            const h = ts.hour();
            buckets[h] = { ...buckets[h], value: buckets[h].value + 1 };
        }
        return buckets;
    }, [rows]);

    const peakHour = useMemo(() => {
        let bestIdx = -1;
        let bestVal = 0;
        hourBuckets.forEach((b, i) => {
            if (b.value > bestVal) {
                bestVal = b.value;
                bestIdx = i;
            }
        });
        return bestIdx === -1
            ? { hour: undefined, count: 0 }
            : { hour: bestIdx, count: bestVal };
    }, [hourBuckets]);

    const stale = rows.filter((r) => r.age >= STALE_HOURS);
    const total = rows.length;

    // Pending by type breakdown.
    const byType = [
        { label: "Tracked entities", value: pendingTE.length },
        { label: "Enrollments", value: pendingEN.length },
        { label: "Events", value: pendingEV.length },
    ].filter((b) => b.value > 0);

    // Pending events by stage.
    const byStage = useMemo(() => {
        const counts = new Map<string, number>();
        for (const e of pendingEV) {
            const name = stageNames.get(e.programStage) ?? "Other";
            counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }, [pendingEV, stageNames]);

    const columns: ColumnsType<QueueRow> = [
        {
            title: "Type",
            dataIndex: "type",
            key: "type",
            width: 140,
            render: (v: string) => <Tag>{v}</Tag>,
        },
        {
            title: "Identifier",
            dataIndex: "id",
            key: "id",
            render: (v: string) => (
                <Text style={{ fontFamily: "monospace", fontSize: token.fontSizeSM }}>
                    {v}
                </Text>
            ),
        },
        {
            title: "Stage",
            dataIndex: "stage",
            key: "stage",
            render: (v?: string) =>
                v ? v : <Text type="secondary">—</Text>,
            width: 200,
        },
        {
            title: "Age",
            dataIndex: "age",
            key: "age",
            width: 140,
            sorter: (a, b) => a.age - b.age,
            defaultSortOrder: "descend",
            render: (h: number) => {
                if (h < 1) return <Tag color="green">&lt; 1h</Tag>;
                if (h < STALE_HOURS) return <Tag color="blue">{h}h</Tag>;
                if (h < 168) return <Tag color="orange">{h}h</Tag>;
                return <Tag color="red">{Math.round(h / 24)}d</Tag>;
            },
        },
        {
            title: "Created",
            dataIndex: "createdAt",
            key: "createdAt",
            width: 180,
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
                    <Text type="secondary">—</Text>
                ),
        },
    ];

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex vertical gap={token.marginXXS}>
                <Title level={5} style={{ margin: 0 }}>
                    Pending push queue
                </Title>
                <Text type="secondary">
                    Records sitting on this device with{" "}
                    <Text code style={{ fontSize: token.fontSizeSM }}>
                        syncStatus = pending
                    </Text>
                    . Reads from local Dexie — no network cost.
                </Text>
            </Flex>

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={12} sm={6}>
                    {statTile(
                        "Total pending",
                        total,
                        <CloudUploadOutlined />,
                        total > 0 ? token.colorWarning : token.colorSuccess,
                        lastDataPush
                            ? `Last push ${dayjs(lastDataPush).fromNow()}`
                            : "Never pushed",
                        token,
                    )}
                </Col>
                <Col xs={12} sm={6}>
                    {statTile(
                        "Stale (>24h)",
                        stale.length,
                        <WarningOutlined />,
                        stale.length > 0 ? token.colorError : token.colorTextTertiary,
                        stale.length > 0
                            ? "Investigate why these aren't pushing"
                            : "All recent",
                        token,
                    )}
                </Col>
                <Col xs={12} sm={6}>
                    {statTile(
                        "Peak hour",
                        peakHour.hour === undefined
                            ? "—"
                            : `${peakHour.hour.toString().padStart(2, "0")}:00`,
                        <ThunderboltOutlined />,
                        token.colorPrimary,
                        peakHour.count
                            ? `${peakHour.count} records created`
                            : undefined,
                        token,
                    )}
                </Col>
                <Col xs={12} sm={6}>
                    {statTile(
                        "Oldest pending",
                        rows[0]
                            ? rows[0].age < 24
                                ? `${rows[0].age}h`
                                : `${Math.round(rows[0].age / 24)}d`
                            : "—",
                        <HourglassOutlined />,
                        rows[0] && rows[0].age >= STALE_HOURS
                            ? token.colorError
                            : token.colorInfo,
                        rows[0]?.createdAt
                            ? dayjs(rows[0].createdAt).format("MMM D")
                            : "No pending records",
                        token,
                    )}
                </Col>
            </Row>

            {stale.length > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    title={`${stale.length} record${stale.length === 1 ? "" : "s"} pending for over ${STALE_HOURS} hours`}
                    description={
                        <>
                            Records stuck this long usually mean the device
                            has been offline, the kill switch is engaged, or
                            push attempts are failing silently. Open{" "}
                            <Text code>/admin/sync</Text> to inspect the most
                            recent push run, or trigger Push data from the
                            sync popover.
                        </>
                    }
                />
            )}

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
                            When the backlog accumulates
                        </Title>
                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                            Hour-of-day distribution of pending records'
                            creation time. Use this to spot peak capture
                            periods and align the allowed sync window in
                            Config.
                        </Text>
                        <StageBarChart items={hourBuckets} maxItems={24} />
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
                            Breakdown
                        </Title>
                        <StageBarChart items={byType} maxItems={3} />
                        {byStage.length > 0 && (
                            <>
                                <Text
                                    type="secondary"
                                    style={{
                                        fontSize: token.fontSizeSM,
                                        marginTop: token.marginSM,
                                    }}
                                >
                                    Pending events by stage
                                </Text>
                                <StageBarChart items={byStage} maxItems={6} />
                            </>
                        )}
                    </Flex>
                </Col>
            </Row>

            <div
                style={{
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Flex
                    align="center"
                    justify="space-between"
                    style={{
                        padding: `${token.paddingSM}px ${token.padding}px`,
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    <Title level={5} style={{ margin: 0 }}>
                        Pending records
                    </Title>
                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                        Showing oldest first
                    </Text>
                </Flex>
                <Table
                    columns={columns}
                    dataSource={rows}
                    rowKey={(r) => `${r.type}-${r.id}`}
                    size="small"
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        pageSizeOptions: ["20", "50", "100"],
                    }}
                />
            </div>
        </Flex>
    );
}
