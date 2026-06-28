import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    MinusCircleOutlined,
    PauseCircleOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import { createRoute } from "@tanstack/react-router";
import {
    Button,
    Col,
    Empty,
    Flex,
    Row,
    Table,
    Tag,
    theme,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import React, { useEffect, useMemo, useState } from "react";
import { MiniSparkline } from "../components/charts";
import { listTelemetry, SyncTelemetry } from "../sync/telemetry";
import { AdminRoute } from "./admin";

const { Title, Text } = Typography;

export const AdminSyncRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "sync",
    component: AdminSyncMonitor,
});

function KpiCard({
    label,
    value,
    sub,
    accent,
}: {
    label: string;
    value: React.ReactNode;
    sub?: string;
    accent: string;
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
            <Typography.Text
                type="secondary"
                style={{ fontSize: token.fontSizeSM }}
            >
                {label}
            </Typography.Text>
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
            {sub && (
                <Typography.Text
                    type="secondary"
                    style={{ fontSize: token.fontSizeSM }}
                >
                    {sub}
                </Typography.Text>
            )}
        </Flex>
    );
}

function durationLabel(start: string, end?: string): string {
    if (!end) return "running";
    const ms = dayjs(end).diff(dayjs(start));
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)} min`;
}

type SyncStatus = "running" | "failure" | "skipped" | "no-op" | "success";

interface SyncStatusInfo {
    kind: SyncStatus;
    label: string;
    color: string;
    icon: React.ReactNode;
}

function classifySync(t: SyncTelemetry, accent: {
    success: string;
    error: string;
    warning: string;
    muted: string;
}): SyncStatusInfo {
    if (!t.finishedAt) {
        return {
            kind: "running",
            label: "Running",
            color: "processing",
            icon: <CheckCircleOutlined style={{ color: accent.success }} />,
        };
    }
    if ((t.failures?.length ?? 0) > 0) {
        return {
            kind: "failure",
            label: "Failure",
            color: "red",
            icon: <CloseCircleOutlined style={{ color: accent.error }} />,
        };
    }
    const durationMs = dayjs(t.finishedAt).diff(dayjs(t.startedAt));
    const pulledNothing =
        (t.trackedEntitiesPulled ?? 0) === 0 &&
        (t.eventsPulled ?? 0) === 0 &&
        (t.trackerPosts ?? 0) === 0;
    // Sub-second sync runs that pulled / pushed nothing are almost
    // certainly bails (lock held by another tab, kill switch engaged,
    // outside an allowed window, or the version-gated probe short-
    // circuit). Surface them as "Skipped" so admins can spot them.
    if (pulledNothing && durationMs < 1500) {
        return {
            kind: "skipped",
            label: "Skipped",
            color: "default",
            icon: <PauseCircleOutlined style={{ color: accent.muted }} />,
        };
    }
    if (pulledNothing) {
        return {
            kind: "no-op",
            label: "No-op",
            color: "default",
            icon: <MinusCircleOutlined style={{ color: accent.muted }} />,
        };
    }
    return {
        kind: "success",
        label: "Success",
        color: "green",
        icon: <CheckCircleOutlined style={{ color: accent.success }} />,
    };
}

function AdminSyncMonitor() {
    const { token } = theme.useToken();
    const [rows, setRows] = useState<SyncTelemetry[]>([]);
    const [loading, setLoading] = useState(false);
    const accent = {
        success: token.colorSuccess,
        error: token.colorError,
        warning: token.colorWarning,
        muted: token.colorTextTertiary,
    };

    const load = () => {
        setLoading(true);
        listTelemetry()
            .then((data) => setRows(data))
            .catch(() => setRows([]))
            .finally(() => setLoading(false));
    };
    useEffect(load, []);

    const annotated = useMemo(
        () => rows.map((r) => ({ ...r, status: classifySync(r, accent) })),
        [rows, accent],
    );

    const counts = useMemo(() => {
        const out: Record<SyncStatus, number> = {
            success: 0,
            failure: 0,
            skipped: 0,
            "no-op": 0,
            running: 0,
        };
        for (const r of annotated) out[r.status.kind] += 1;
        return out;
    }, [annotated]);

    const durationSeries = useMemo(() => {
        return [...annotated]
            .reverse()
            .map((r) =>
                r.finishedAt
                    ? dayjs(r.finishedAt).diff(dayjs(r.startedAt)) / 1000
                    : 0,
            )
            .slice(-30);
    }, [annotated]);

    const failureRate =
        annotated.length === 0
            ? 0
            : Math.round((counts.failure / annotated.length) * 100);

    const successRate =
        annotated.length === 0
            ? 0
            : Math.round((counts.success / annotated.length) * 100);

    const avgDuration =
        annotated.length === 0
            ? 0
            : Math.round(
                  annotated.reduce(
                      (acc, r) =>
                          r.finishedAt
                              ? acc +
                                dayjs(r.finishedAt).diff(dayjs(r.startedAt))
                              : acc,
                      0,
                  ) / annotated.length,
              );

    const lastError = annotated.find((r) => r.status.kind === "failure")
        ?.failures?.[0]?.message;

    const columns: ColumnsType<SyncTelemetry> = [
        {
            title: "Started",
            dataIndex: "startedAt",
            key: "startedAt",
            width: 170,
            render: (v: string) => (
                <Text style={{ whiteSpace: "nowrap" }}>
                    {dayjs(v).format("MMM D, HH:mm")}
                    <Text
                        type="secondary"
                        style={{ marginLeft: 6, fontSize: token.fontSizeSM }}
                    >
                        · {dayjs(v).fromNow(true)} ago
                    </Text>
                </Text>
            ),
        },
        {
            title: "Mode",
            dataIndex: "mode",
            key: "mode",
            width: 130,
            render: (m: string) => <Tag>{m}</Tag>,
        },
        {
            title: "Trigger",
            dataIndex: "trigger",
            key: "trigger",
            width: 110,
            // Rows captured before the trigger field shipped have no
            // value — assume the scheduler (the dominant source) rather
            // than rendering a useless dash.
            render: (t?: string) =>
                t === "manual" ? (
                    <Tag color="purple">Manual</Tag>
                ) : (
                    <Tag color="blue">Scheduled</Tag>
                ),
            filters: [
                { text: "Manual", value: "manual" },
                { text: "Scheduled", value: "scheduled" },
            ],
            onFilter: (value, record) =>
                value === "manual"
                    ? record.trigger === "manual"
                    : record.trigger !== "manual",
        },
        {
            title: "Duration",
            key: "duration",
            width: 110,
            render: (_, r) => (
                <Text>{durationLabel(r.startedAt, r.finishedAt)}</Text>
            ),
        },
        {
            title: "Records",
            key: "records",
            width: 180,
            render: (_, r) => {
                const parts: string[] = [];
                if (r.trackedEntitiesPulled !== undefined)
                    parts.push(`${r.trackedEntitiesPulled} TE`);
                if (r.eventsPulled !== undefined)
                    parts.push(`${r.eventsPulled} events`);
                if (r.trackerPosts !== undefined)
                    parts.push(`${r.trackerPosts} pushes`);
                return parts.length ? (
                    <Text>{parts.join(" · ")}</Text>
                ) : (
                    <Text type="secondary">—</Text>
                );
            },
        },
        {
            title: "Pages",
            dataIndex: "pagesPulled",
            key: "pagesPulled",
            width: 80,
            render: (v?: number) =>
                v === undefined ? <Text type="secondary">—</Text> : v,
        },
        {
            title: "User",
            dataIndex: "username",
            key: "username",
            width: 140,
            render: (v?: string) =>
                v ? v : <Text type="secondary">—</Text>,
        },
        {
            title: "Status",
            key: "status",
            width: 140,
            render: (_, r) => {
                const status = classifySync(r, accent);
                return (
                    <Flex align="center" gap={token.marginXXS}>
                        {status.icon}
                        <Text>{status.label}</Text>
                    </Flex>
                );
            },
        },
    ];

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex align="center" justify="space-between" gap={token.marginSM} wrap>
                <Flex vertical gap={token.marginXXS}>
                    <Title level={5} style={{ margin: 0 }}>
                        Sync activity
                    </Title>
                    <Text type="secondary">
                        Latest {rows.length} sync runs on this device. Older
                        records are evicted from the local ring buffer.
                    </Text>
                </Flex>
                <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
                    Reload
                </Button>
            </Flex>

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={12} sm={6} lg={3}>
                    <KpiCard
                        label="Success"
                        value={counts.success}
                        sub={`${successRate}%`}
                        accent={token.colorSuccess}
                    />
                </Col>
                <Col xs={12} sm={6} lg={3}>
                    <KpiCard
                        label="Failures"
                        value={counts.failure}
                        sub={`${failureRate}%`}
                        accent={
                            counts.failure > 0
                                ? token.colorError
                                : token.colorTextTertiary
                        }
                    />
                </Col>
                <Col xs={12} sm={6} lg={3}>
                    <KpiCard
                        label="Skipped"
                        value={counts.skipped}
                        sub="Bailed early"
                        accent={token.colorWarning}
                    />
                </Col>
                <Col xs={12} sm={6} lg={3}>
                    <KpiCard
                        label="No-op"
                        value={counts["no-op"]}
                        sub="Nothing to do"
                        accent={token.colorInfo}
                    />
                </Col>
                <Col xs={12} sm={6} lg={3}>
                    <KpiCard
                        label="Avg duration"
                        value={
                            avgDuration < 1000
                                ? `${avgDuration}ms`
                                : `${(avgDuration / 1000).toFixed(1)}s`
                        }
                        sub="Mean wall-time"
                        accent={token.colorPrimary}
                    />
                </Col>
                <Col xs={24} sm={12} lg={9}>
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
                            Duration trend (last {durationSeries.length} runs)
                        </Text>
                        <MiniSparkline
                            values={durationSeries.length > 1 ? durationSeries : [0, 0]}
                            color={token.colorPrimary}
                            height={36}
                            fillWidth
                        />
                        {lastError && (
                            <Text
                                type="secondary"
                                style={{ fontSize: token.fontSizeSM }}
                            >
                                Last error: {lastError.slice(0, 80)}
                                {lastError.length > 80 ? "…" : ""}
                            </Text>
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
                {rows.length === 0 ? (
                    <div style={{ padding: token.paddingXL, textAlign: "center" }}>
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="No sync runs recorded yet."
                        />
                    </div>
                ) : (
                    <Table
                        columns={columns}
                        dataSource={rows}
                        rowKey="syncId"
                        pagination={{
                            pageSize: 20,
                            showSizeChanger: true,
                            pageSizeOptions: ["20", "50", "100"],
                            hideOnSinglePage: false,
                        }}
                        size="small"
                        expandable={{
                            expandedRowRender: (record) => (
                                <Flex vertical gap={token.marginXS}>
                                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                        sync id {record.syncId} · orgUnit {record.orgUnitUid ?? "—"}
                                    </Text>
                                    {record.failures?.map((f, i) => (
                                        <Flex key={i} vertical gap={0}>
                                            <Text strong style={{ color: token.colorError }}>
                                                {f.endpoint ?? "Unknown endpoint"}
                                                {f.status ? ` · HTTP ${f.status}` : ""}
                                            </Text>
                                            <Text style={{ fontSize: token.fontSizeSM }}>
                                                {f.message}
                                            </Text>
                                            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                                {dayjs(f.at).format("MMM D, HH:mm:ss")}
                                            </Text>
                                        </Flex>
                                    ))}
                                </Flex>
                            ),
                            rowExpandable: (r) => (r.failures?.length ?? 0) > 0,
                        }}
                    />
                )}
            </div>
        </Flex>
    );
}
