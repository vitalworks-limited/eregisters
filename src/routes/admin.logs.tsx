import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { useDataEngine } from "@dhis2/app-runtime";
import { createRoute } from "@tanstack/react-router";
import {
    Alert,
    Button,
    Flex,
    Segmented,
    Table,
    Tag,
    theme,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import React, { useEffect, useMemo, useState } from "react";
import { useMetadata } from "../hooks/useMetadata";
import {
    downloadSyncDiagnostics,
    listTelemetry,
    SyncTelemetry,
} from "../sync/telemetry";
import { AdminRoute } from "./admin";

const { Title, Text } = Typography;

export const AdminLogsRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "logs",
    component: AdminLogs,
});

type Source = "all" | "sync" | "audit";

interface Row {
    id: string;
    at: string;
    source: "Sync (local)" | "DHIS2 audit";
    kind: string;
    actor?: string;
    summary: string;
    detail?: string;
}

interface AuditQueryResult {
    audits: {
        audits?: Array<{
            uid?: string;
            createdAt?: string;
            createdBy?: string;
            auditType?: string;
            attributes?: string;
            klass?: string;
            data?: string;
        }>;
        pager?: { total?: number };
    };
}

function AdminLogs() {
    const { token } = theme.useToken();
    const engine = useDataEngine();
    const { orgUnit } = useMetadata();
    const [telemetry, setTelemetry] = useState<SyncTelemetry[]>([]);
    const [auditRows, setAuditRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [source, setSource] = useState<Source>("all");
    const [auditError, setAuditError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        const localTelem = await listTelemetry().catch(() => []);
        setTelemetry(localTelem);

        // DHIS2 audit endpoint. Not every deployment exposes this; we
        // catch and surface a soft error so the local stream still
        // renders.
        try {
            const auditParams: Record<string, string> = {
                program: "ueBhWkWll5v",
                pageSize: "100",
                order: "createdAt:desc",
            };
            if (orgUnit?.id) auditParams.ou = orgUnit.id;
            const result = (await engine.query({
                audits: {
                    resource: "audits/trackedEntity",
                    params: auditParams,
                },
            })) as unknown as AuditQueryResult;
            const list = result.audits.audits ?? [];
            setAuditRows(
                list.map((a, i) => ({
                    id: a.uid ?? `audit-${i}`,
                    at: a.createdAt ?? new Date().toISOString(),
                    source: "DHIS2 audit",
                    kind: a.auditType ?? "tracked entity",
                    actor: a.createdBy,
                    summary:
                        a.klass?.split(".").pop() ??
                        a.auditType ??
                        "Tracker change",
                    detail: a.data,
                })),
            );
            setAuditError(null);
        } catch (e) {
            setAuditError(
                e instanceof Error
                    ? e.message
                    : "DHIS2 audit endpoint not reachable on this instance",
            );
            setAuditRows([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, [orgUnit?.id]);

    const telemetryRows = useMemo<Row[]>(() => {
        const out: Row[] = [];
        for (const t of telemetry) {
            const summary = `${t.mode} sync${
                t.failures && t.failures.length > 0
                    ? ` · ${t.failures.length} failure${t.failures.length === 1 ? "" : "s"}`
                    : ""
            }`;
            out.push({
                id: t.syncId,
                at: t.startedAt,
                source: "Sync (local)",
                kind: t.mode,
                actor: t.username,
                summary,
                detail: (t.failures ?? [])
                    .map((f) => `${f.endpoint ?? ""}: ${f.message}`)
                    .join("\n"),
            });
        }
        return out;
    }, [telemetry]);

    const rows = useMemo<Row[]>(() => {
        const merged =
            source === "sync"
                ? telemetryRows
                : source === "audit"
                  ? auditRows
                  : [...telemetryRows, ...auditRows];
        return merged.sort((a, b) =>
            dayjs(b.at).valueOf() - dayjs(a.at).valueOf(),
        );
    }, [telemetryRows, auditRows, source]);

    const columns: ColumnsType<Row> = [
        {
            title: "When",
            dataIndex: "at",
            key: "at",
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
            title: "Source",
            dataIndex: "source",
            key: "source",
            width: 140,
            render: (v: string) => (
                <Tag color={v === "Sync (local)" ? "blue" : "geekblue"}>
                    {v}
                </Tag>
            ),
        },
        {
            title: "Kind",
            dataIndex: "kind",
            key: "kind",
            width: 140,
        },
        {
            title: "Actor",
            dataIndex: "actor",
            key: "actor",
            width: 140,
            render: (v?: string) =>
                v ? v : <Text type="secondary">—</Text>,
        },
        {
            title: "Summary",
            dataIndex: "summary",
            key: "summary",
            render: (v: string, r) => (
                <Flex vertical gap={0}>
                    <Text>{v}</Text>
                    {r.detail && (
                        <Text
                            type="secondary"
                            style={{
                                fontSize: token.fontSizeSM,
                                whiteSpace: "pre-wrap",
                            }}
                        >
                            {r.detail.length > 200
                                ? `${r.detail.slice(0, 200)}…`
                                : r.detail}
                        </Text>
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
                        Logs
                    </Title>
                    <Text type="secondary">
                        Local sync telemetry merged with the DHIS2
                        tracker-audit feed for this program. DHIS2 file logs
                        aren't reachable over REST; this is the closest
                        program-scoped equivalent.
                    </Text>
                </Flex>
                <Flex gap={token.marginXS} wrap align="center">
                    <Segmented
                        options={[
                            { value: "all", label: "All" },
                            { value: "sync", label: "Sync only" },
                            { value: "audit", label: "DHIS2 only" },
                        ]}
                        value={source}
                        onChange={(v) => setSource(v as Source)}
                    />
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={load}
                        loading={loading}
                    >
                        Reload
                    </Button>
                    <Button
                        icon={<DownloadOutlined />}
                        onClick={async () => {
                            const blob = await downloadSyncDiagnostics();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `eregisters-logs-${dayjs().format(
                                "YYYY-MM-DD",
                            )}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }}
                    >
                        Export
                    </Button>
                </Flex>
            </Flex>
            {auditError && source !== "sync" && (
                <Alert
                    type="warning"
                    showIcon
                    title="DHIS2 audit feed unavailable"
                    description={auditError}
                />
            )}
            <div
                style={{
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Table
                    columns={columns}
                    dataSource={rows}
                    rowKey="id"
                    size="middle"
                    loading={loading}
                    pagination={{ pageSize: 25, showSizeChanger: true }}
                />
            </div>
        </Flex>
    );
}
