import {
    AlertOutlined,
    ApiOutlined,
    DownloadOutlined,
    ReloadOutlined,
    ThunderboltOutlined,
} from "@ant-design/icons";
import { useDataEngine } from "@dhis2/app-runtime";
import { createRoute } from "@tanstack/react-router";
import {
    Alert,
    Button,
    Col,
    Flex,
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
import { AdminOperationalAlertsPanel } from "../admin/AdminOperationalAlertsPanel";
import { fetchOverviewSummary } from "../admin/adminSummaryService";
import { AdminAlert } from "../admin/summaryTypes";
import { MiniSparkline, StageBarChart } from "../components/charts";
import { useMetadata } from "../hooks/useMetadata";
import {
    downloadSyncDiagnostics,
    listTelemetry,
    SyncTelemetry,
} from "../sync/telemetry";
import {
    invalidateCache,
    withCache,
} from "../sync/trackerActivityCache";
import { AdminRoute } from "./admin";

const { Title, Text } = Typography;

export const AdminLogsRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "logs",
    component: AdminLogs,
});

type RangeKey = "24h" | "7d" | "30d";

const RANGE_LABEL: Record<RangeKey, string> = {
    "24h": "Last 24h",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
};

const RANGE_MS: Record<RangeKey, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
};

interface Row {
    id: string;
    at: string;
    source: "sync" | "tracker";
    kind: string;
    actor?: string;
    summary: string;
    detail?: string;
    failure?: boolean;
}

interface TrackerActivityResult {
    activity: {
        instances?: Array<{
            trackedEntity?: string;
            createdAt?: string;
            updatedAt?: string;
            createdBy?: { username?: string; displayName?: string };
            updatedBy?: { username?: string; displayName?: string };
            attributes?: Array<{ displayName?: string; value?: string }>;
        }>;
    };
}

const PROGRAM_UID = "ueBhWkWll5v";

async function fetchTrackerActivity(
    engine: ReturnType<typeof useDataEngine>,
    orgUnitId: string,
    range: RangeKey,
): Promise<Row[]> {
    return withCache(`tracker-activity:${orgUnitId}:${range}`, async () => {
        const updatedAfter = new Date(Date.now() - RANGE_MS[range]).toISOString();
        const params: Record<string, string> = {
            program: PROGRAM_UID,
            orgUnits: orgUnitId,
            ouMode: "SELECTED",
            order: "updatedAt:desc",
            page: "1",
            pageSize: range === "24h" ? "50" : range === "7d" ? "100" : "200",
            updatedAfter,
            fields:
                "trackedEntity,createdAt,updatedAt,createdBy[username,displayName],updatedBy[username,displayName],attributes[displayName,value]",
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (await engine.query({
            activity: {
                resource: "tracker/trackedEntities",
                params,
            },
        } as any)) as unknown as TrackerActivityResult;
        const list = result.activity.instances ?? [];
        return list.map<Row>((te, i) => {
            const updated = te.updatedAt ?? te.createdAt ?? new Date().toISOString();
            const isUpdate =
                te.updatedAt &&
                te.createdAt &&
                te.updatedAt !== te.createdAt;
            const actor =
                (isUpdate ? te.updatedBy : te.createdBy)?.displayName ??
                (isUpdate ? te.updatedBy : te.createdBy)?.username;
            const name = (te.attributes ?? [])
                .slice(0, 2)
                .map((a) => a.value)
                .filter(Boolean)
                .join(" ");
            return {
                id: `te-${te.trackedEntity ?? i}`,
                at: updated,
                source: "tracker",
                kind: isUpdate ? "update" : "create",
                actor,
                summary: `${isUpdate ? "Updated" : "Created"} tracked entity${
                    name ? ` (${name})` : ""
                }`,
                detail: te.trackedEntity ? `TEI ${te.trackedEntity}` : undefined,
                failure: false,
            };
        });
    });
}

function rowsFromTelemetry(telemetry: SyncTelemetry[], since: number): Row[] {
    return telemetry
        .filter((t) => dayjs(t.startedAt).valueOf() >= since)
        .map((t) => ({
            id: t.syncId,
            at: t.startedAt,
            source: "sync" as const,
            kind: t.mode,
            actor: t.username,
            summary: `${t.mode} sync${
                (t.failures?.length ?? 0) > 0
                    ? ` · ${t.failures!.length} failure${
                          t.failures!.length === 1 ? "" : "s"
                      }`
                    : ""
            }`,
            detail: (t.failures ?? [])
                .map((f) => `${f.endpoint ?? ""}: ${f.message}`)
                .join("\n"),
            failure: (t.failures?.length ?? 0) > 0,
        }));
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

function Card({
    icon,
    title,
    sub,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    sub?: string;
    children: React.ReactNode;
}) {
    const { token } = theme.useToken();
    return (
        <Flex
            vertical
            gap={token.marginXS}
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                padding: token.padding,
                height: "100%",
            }}
        >
            <Flex align="center" gap={token.marginXS}>
                <span style={{ color: token.colorPrimary }}>{icon}</span>
                <Title level={5} style={{ margin: 0 }}>
                    {title}
                </Title>
            </Flex>
            {sub && (
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {sub}
                </Text>
            )}
            {children}
        </Flex>
    );
}

function AdminLogs() {
    const { token } = theme.useToken();
    const engine = useDataEngine();
    const { orgUnit } = useMetadata();
    const [range, setRange] = useState<RangeKey>("24h");
    const [telemetry, setTelemetry] = useState<SyncTelemetry[]>([]);
    const [trackerRows, setTrackerRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [trackerError, setTrackerError] = useState<string | null>(null);
    const [alerts, setAlerts] = useState<AdminAlert[]>([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const r = await fetchOverviewSummary(engine, {
                    period: "THIS_YEAR",
                    orgUnit: {
                        id: "NATIONAL",
                        name: "National",
                        scope: "NATIONAL",
                    },
                });
                if (!cancelled) setAlerts(r.summary.alerts);
            } catch {
                if (!cancelled) setAlerts([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [engine]);

    const load = async (force = false) => {
        setLoading(true);
        if (force && orgUnit?.id) {
            invalidateCache(`tracker-activity:${orgUnit.id}:${range}`);
        }
        const localTelem = await listTelemetry().catch(() => []);
        setTelemetry(localTelem);
        if (!orgUnit?.id) {
            setTrackerError("Facility context unavailable.");
            setTrackerRows([]);
            setLoading(false);
            return;
        }
        try {
            const activity = await fetchTrackerActivity(
                engine,
                orgUnit.id,
                range,
            );
            setTrackerRows(activity);
            setTrackerError(null);
        } catch (e) {
            setTrackerError(
                e instanceof Error
                    ? e.message
                    : "DHIS2 tracker endpoint not reachable",
            );
            setTrackerRows([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, [orgUnit?.id, range]);

    const since = Date.now() - RANGE_MS[range];

    const syncRows = useMemo(
        () => rowsFromTelemetry(telemetry, since),
        [telemetry, since],
    );
    const allRows = useMemo(
        () =>
            [...syncRows, ...trackerRows].sort(
                (a, b) => dayjs(b.at).valueOf() - dayjs(a.at).valueOf(),
            ),
        [syncRows, trackerRows],
    );

    // Build per-hour-of-day activity counts (0-23). Lets us spot peaks.
    const hourBuckets = useMemo(() => {
        const buckets = new Array<{ label: string; value: number }>(24)
            .fill({ label: "00", value: 0 })
            .map((_, i) => ({
                label: `${i.toString().padStart(2, "0")}h`,
                value: 0,
            }));
        for (const r of allRows) {
            const h = dayjs(r.at).hour();
            buckets[h] = { ...buckets[h], value: buckets[h].value + 1 };
        }
        return buckets;
    }, [allRows]);

    const peakHour = useMemo(() => {
        let bestIdx = -1;
        let bestVal = 0;
        hourBuckets.forEach((b, i) => {
            if (b.value > bestVal) {
                bestVal = b.value;
                bestIdx = i;
            }
        });
        if (bestIdx === -1)
            return { hour: undefined as number | undefined, count: 0 };
        return { hour: bestIdx, count: bestVal };
    }, [hourBuckets]);

    // Trend over the range — counts per day for the chart sparkline.
    const daysInRange = range === "24h" ? 1 : range === "7d" ? 7 : 30;
    const dailyCounts = useMemo(() => {
        const start = dayjs().subtract(daysInRange - 1, "day").startOf("day");
        const out = new Array(daysInRange).fill(0);
        for (const r of allRows) {
            const idx = dayjs(r.at).diff(start, "day");
            if (idx >= 0 && idx < daysInRange) out[idx] += 1;
        }
        return out;
    }, [allRows, daysInRange]);

    const kindBreakdown = useMemo(() => {
        const counts = new Map<string, number>();
        for (const r of allRows) {
            counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }, [allRows]);

    const failures = syncRows.filter((r) => r.failure);
    const failureRate =
        syncRows.length === 0
            ? 0
            : Math.round((failures.length / syncRows.length) * 100);

    const reason = useMemo(() => {
        if (allRows.length === 0) {
            return "No activity in this range. The app and DHIS2 are idle for this facility.";
        }
        const total = allRows.length;
        const trackerPct = Math.round(
            (trackerRows.length / Math.max(total, 1)) * 100,
        );
        const peakLabel =
            peakHour.hour === undefined
                ? "n/a"
                : `${peakHour.hour.toString().padStart(2, "0")}:00–${(
                      peakHour.hour + 1
                  )
                      .toString()
                      .padStart(2, "0")}:00`;
        const hints: string[] = [
            `Most activity around ${peakLabel}, consistent with morning / clinic hours when staff are actively capturing.`,
        ];
        if (trackerPct > 60) {
            hints.push(
                `Tracker writes dominate (${trackerPct}% of records) — points to active data capture rather than background pulls.`,
            );
        } else if (trackerPct < 20) {
            hints.push(
                "Most activity is sync-related (pull / push) rather than user-driven capture — could indicate background polling load.",
            );
        }
        if (failureRate >= 10) {
            hints.push(
                `${failureRate}% of sync runs failed — investigate via Sync activity for endpoints / status codes.`,
            );
        }
        return hints.join(" ");
    }, [allRows, trackerRows, peakHour, failureRate]);

    const columns: ColumnsType<Row> = [
        {
            title: "When",
            dataIndex: "at",
            key: "at",
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
            title: "Source",
            dataIndex: "source",
            key: "source",
            width: 110,
            render: (v: string) => (
                <Tag color={v === "sync" ? "blue" : "geekblue"}>
                    {v === "sync" ? "Sync" : "Tracker"}
                </Tag>
            ),
        },
        {
            title: "Kind",
            dataIndex: "kind",
            key: "kind",
            width: 130,
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
        },
    ];

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex vertical gap={token.marginXS}>
                <Title level={5} style={{ margin: 0 }}>
                    Operational alerts
                </Title>
                <AdminOperationalAlertsPanel alerts={alerts} />
            </Flex>

            <Flex align="center" justify="space-between" gap={token.marginSM} wrap>
                <Flex vertical gap={token.marginXXS}>
                    <Title level={5} style={{ margin: 0 }}>
                        Logs & load
                    </Title>
                    <Text type="secondary">
                        Activity for {orgUnit?.name ?? "this facility"}. Cached
                        for 5 minutes so opening this tab doesn't add load.
                    </Text>
                </Flex>
                <Flex gap={token.marginXS} wrap align="center">
                    <Segmented
                        options={[
                            { value: "24h", label: "24h" },
                            { value: "7d", label: "7d" },
                            { value: "30d", label: "30d" },
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

            {trackerError && (
                <Alert
                    type="warning"
                    showIcon
                    title="DHIS2 tracker activity unavailable"
                    description={trackerError}
                />
            )}

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={12} sm={6}>
                    <Kpi
                        label={`Total events · ${RANGE_LABEL[range]}`}
                        value={allRows.length}
                        icon={<ThunderboltOutlined />}
                        accent={token.colorPrimary}
                        sublabel={`${syncRows.length} sync · ${trackerRows.length} tracker`}
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <Kpi
                        label="Peak hour"
                        value={
                            peakHour.hour === undefined
                                ? "—"
                                : `${peakHour.hour.toString().padStart(2, "0")}:00`
                        }
                        icon={<AlertOutlined />}
                        accent={token.colorWarning}
                        sublabel={
                            peakHour.count
                                ? `${peakHour.count} events`
                                : "No data"
                        }
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <Kpi
                        label="Sync failure rate"
                        value={`${failureRate}%`}
                        icon={<ApiOutlined />}
                        accent={
                            failureRate >= 10
                                ? token.colorError
                                : token.colorSuccess
                        }
                        sublabel={`${failures.length} of ${syncRows.length} sync runs`}
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <Kpi
                        label="Active actors"
                        value={
                            new Set(
                                allRows
                                    .map((r) => r.actor)
                                    .filter(Boolean),
                            ).size
                        }
                        icon={<ThunderboltOutlined />}
                        accent={token.colorInfo}
                        sublabel="Distinct users seen"
                    />
                </Col>
            </Row>

            <Alert
                type="info"
                showIcon
                title="What this tells us"
                description={reason}
            />

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={24} lg={14}>
                    <Card
                        icon={<AlertOutlined />}
                        title="Activity by hour of day"
                        sub="Helps spot peak load and align sync windows."
                    >
                        <StageBarChart items={hourBuckets} maxItems={24} />
                    </Card>
                </Col>
                <Col xs={24} lg={10}>
                    <Card
                        icon={<ApiOutlined />}
                        title="Breakdown by kind"
                        sub="Shows which event types dominate the load."
                    >
                        <StageBarChart items={kindBreakdown} maxItems={8} />
                    </Card>
                </Col>
            </Row>

            <Card
                icon={<ThunderboltOutlined />}
                title={`Volume per day · ${RANGE_LABEL[range]}`}
                sub="Track load over time. Sustained increases warrant a Config window review."
            >
                <MiniSparkline
                    values={dailyCounts}
                    color={token.colorPrimary}
                    height={110}
                    fillWidth
                />
            </Card>

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
                        Recent activity
                    </Title>
                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                        {allRows.length} rows
                    </Text>
                </Flex>
                <Table
                    columns={columns}
                    dataSource={allRows}
                    rowKey="id"
                    size="small"
                    loading={loading}
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
