import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { createRoute } from "@tanstack/react-router";
import { Button, Empty, Flex, Table, Tag, theme, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import React, { useEffect, useState } from "react";
import { listTelemetry, SyncTelemetry } from "../sync/telemetry";
import { AdminRoute } from "./admin";

const { Title, Text } = Typography;

export const AdminSyncRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "sync",
    component: AdminSyncMonitor,
});

function durationLabel(start: string, end?: string): string {
    if (!end) return "running";
    const ms = dayjs(end).diff(dayjs(start));
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)} min`;
}

function AdminSyncMonitor() {
    const { token } = theme.useToken();
    const [rows, setRows] = useState<SyncTelemetry[]>([]);
    const [loading, setLoading] = useState(false);

    const load = () => {
        setLoading(true);
        listTelemetry()
            .then((data) => setRows(data))
            .catch(() => setRows([]))
            .finally(() => setLoading(false));
    };
    useEffect(load, []);

    const columns: ColumnsType<SyncTelemetry> = [
        {
            title: "Started",
            dataIndex: "startedAt",
            key: "startedAt",
            width: 180,
            render: (v: string) => (
                <Flex vertical gap={0}>
                    <Text>{dayjs(v).format("MMM D, HH:mm:ss")}</Text>
                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                        {dayjs(v).fromNow()}
                    </Text>
                </Flex>
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
                const failures = r.failures?.length ?? 0;
                if (failures === 0) {
                    return (
                        <Flex align="center" gap={token.marginXXS}>
                            <CheckCircleOutlined style={{ color: token.colorSuccess }} />
                            <Text>OK</Text>
                        </Flex>
                    );
                }
                return (
                    <Flex align="center" gap={token.marginXXS}>
                        <CloseCircleOutlined style={{ color: token.colorError }} />
                        <Text>{failures} fail{failures === 1 ? "" : "s"}</Text>
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
                        pagination={{ pageSize: 20, hideOnSinglePage: false }}
                        size="middle"
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
