import {
    ArrowDownOutlined,
    ArrowUpOutlined,
    BarChartOutlined,
    CalendarOutlined,
    CloudUploadOutlined,
    DownloadOutlined,
    ExperimentOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
import { createRoute } from "@tanstack/react-router";
import {
    Button,
    Col,
    Flex,
    Layout,
    Row,
    Segmented,
    theme,
    Typography,
} from "antd";
import dayjs from "dayjs";
import React, { useMemo, useState } from "react";
import {
    enrollmentsCollection,
    eventsCollection,
    trackedEntitiesCollection,
} from "../collections";
import { Sparkline } from "../components/sparkline";
import { Spinner } from "../components/spinner";
import { TrendChart } from "../components/trend-chart";
import { useMetadata } from "../hooks/useMetadata";
import { RootRoute } from "./__root";

const { Content } = Layout;
const { Title, Text } = Typography;

export const ReportsRoute = createRoute({
    getParentRoute: () => RootRoute,
    path: "/reports",
    component: Reports,
    pendingComponent: Spinner,
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

interface MetricCardProps {
    label: string;
    value: React.ReactNode;
    icon: React.ReactNode;
    accent: string;
    trend?: number[];
    delta?: number | null;
    sublabel?: string;
}

function MetricCard({
    label,
    value,
    icon,
    accent,
    trend,
    delta,
    sublabel,
}: MetricCardProps) {
    const { token } = theme.useToken();
    const deltaColor =
        delta === null || delta === undefined
            ? token.colorTextTertiary
            : delta > 0
              ? token.colorSuccess
              : delta < 0
                ? token.colorError
                : token.colorTextTertiary;
    return (
        <Flex
            vertical
            gap={token.marginSM}
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
                <span style={{ color: accent, fontSize: 18 }}>{icon}</span>
            </Flex>
            <Flex align="flex-end" justify="space-between" gap={token.marginSM}>
                <Flex vertical gap={0}>
                    <span
                        style={{
                            margin: 0,
                            color: accent,
                            fontWeight: 600,
                            lineHeight: 1.1,
                            fontSize: 28,
                        }}
                    >
                        {value}
                    </span>
                    {sublabel && (
                        <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                        >
                            {sublabel}
                        </Text>
                    )}
                </Flex>
                {trend && trend.length > 1 && (
                    <Sparkline
                        values={trend}
                        accent={accent}
                        width={104}
                        height={32}
                    />
                )}
            </Flex>
            {delta !== undefined && delta !== null && (
                <Flex
                    align="center"
                    gap={token.marginXXS}
                    style={{ color: deltaColor, fontSize: token.fontSizeSM }}
                >
                    {delta > 0 ? (
                        <ArrowUpOutlined />
                    ) : delta < 0 ? (
                        <ArrowDownOutlined />
                    ) : null}
                    <span>
                        {delta === 0
                            ? "No change"
                            : `${Math.abs(delta)} vs prior period`}
                    </span>
                </Flex>
            )}
        </Flex>
    );
}

interface BreakdownProps {
    title: string;
    items: Array<{ label: string; value: number }>;
    accent: string;
}

function Breakdown({ title, items, accent }: BreakdownProps) {
    const { token } = theme.useToken();
    const max = Math.max(1, ...items.map((i) => i.value));
    return (
        <Flex
            vertical
            gap={token.marginSM}
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                padding: token.padding,
            }}
        >
            <Title level={5} style={{ margin: 0 }}>
                {title}
            </Title>
            {items.length === 0 ? (
                <Text type="secondary">No data yet.</Text>
            ) : (
                <Flex vertical gap={token.marginSM}>
                    {items.map((it) => (
                        <Flex key={it.label} vertical gap={token.marginXXS}>
                            <Flex justify="space-between">
                                <Text>{it.label}</Text>
                                <Text strong>{it.value}</Text>
                            </Flex>
                            <div
                                style={{
                                    background: token.colorFillTertiary,
                                    height: 6,
                                    width: "100%",
                                }}
                            >
                                <div
                                    style={{
                                        background: accent,
                                        height: "100%",
                                        width: `${(it.value / max) * 100}%`,
                                    }}
                                />
                            </div>
                        </Flex>
                    ))}
                </Flex>
            )}
        </Flex>
    );
}

function buildDailyVisits(events: Array<{ occurredAt?: string; createdAt?: string }>, days: number) {
    const buckets = new Map<string, number>();
    const start = dayjs().subtract(days - 1, "day").startOf("day");
    for (let i = 0; i < days; i += 1) {
        buckets.set(start.add(i, "day").format("YYYY-MM-DD"), 0);
    }
    for (const e of events) {
        const d = dayjs(e.occurredAt ?? e.createdAt);
        if (!d.isValid()) continue;
        const key = d.format("YYYY-MM-DD");
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([date, value]) => ({
        date,
        value,
    }));
}

function downloadCSV(rows: Array<Record<string, string | number>>, filename: string) {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const escape = (v: string | number) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
        headers.join(","),
        ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function Reports() {
    const { token } = theme.useToken();
    const {
        orgUnit: { id, name },
        program,
    } = useMetadata();
    const [range, setRange] = useState<RangeKey>("30d");

    const { data: trackedEntities } = useLiveSuspenseQuery(
        (q) =>
            q
                .from({ t: trackedEntitiesCollection })
                .where(({ t }) =>
                    and(
                        eq(t.orgUnit, id),
                        not(eq(t.syncStatus, "draft")),
                    ),
                ),
        [id],
    );

    const { data: events } = useLiveSuspenseQuery(
        (q) =>
            q
                .from({ e: eventsCollection })
                .where(({ e }) =>
                    and(
                        eq(e.orgUnit, id),
                        not(eq(e.syncStatus, "deleted")),
                        not(eq(e.syncStatus, "draft")),
                    ),
                ),
        [id],
    );

    const { data: enrollments } = useLiveSuspenseQuery(
        (q) =>
            q
                .from({ en: enrollmentsCollection })
                .where(({ en }) =>
                    and(
                        eq(en.orgUnit, id),
                        not(eq(en.syncStatus, "draft")),
                    ),
                ),
        [id],
    );

    const today = dayjs().format("YYYY-MM-DD");
    const days = RANGE_DAYS[range];
    const periodStart = dayjs().subtract(days - 1, "day").startOf("day");
    const priorStart = periodStart.subtract(days, "day");

    const dailyVisits = useMemo(
        () => buildDailyVisits(events, days),
        [events, days],
    );

    const registrationsInRange = useMemo(
        () =>
            trackedEntities.filter((t) =>
                dayjs(t.createdAt).isAfter(periodStart),
            ).length,
        [trackedEntities, periodStart],
    );
    const registrationsPrior = useMemo(
        () =>
            trackedEntities.filter(
                (t) =>
                    dayjs(t.createdAt).isAfter(priorStart) &&
                    dayjs(t.createdAt).isBefore(periodStart),
            ).length,
        [trackedEntities, priorStart, periodStart],
    );
    const visitsInRange = useMemo(
        () =>
            events.filter((e) =>
                dayjs(e.occurredAt ?? e.createdAt).isAfter(periodStart),
            ).length,
        [events, periodStart],
    );
    const visitsPrior = useMemo(
        () =>
            events.filter(
                (e) =>
                    dayjs(e.occurredAt ?? e.createdAt).isAfter(priorStart) &&
                    dayjs(e.occurredAt ?? e.createdAt).isBefore(periodStart),
            ).length,
        [events, priorStart, periodStart],
    );
    const registeredToday = useMemo(
        () =>
            trackedEntities.filter(
                (t) => dayjs(t.createdAt).format("YYYY-MM-DD") === today,
            ).length,
        [trackedEntities, today],
    );
    const pendingSync = useMemo(() => {
        const pending = (list: Array<{ syncStatus?: string }>) =>
            list.filter((x) => x.syncStatus === "pending").length;
        return (
            pending(trackedEntities) +
            pending(enrollments) +
            pending(events)
        );
    }, [trackedEntities, enrollments, events]);

    const registrationsTrend = useMemo(() => {
        const buckets = new Map<string, number>();
        const start = dayjs().subtract(days - 1, "day").startOf("day");
        for (let i = 0; i < days; i += 1) {
            buckets.set(start.add(i, "day").format("YYYY-MM-DD"), 0);
        }
        for (const t of trackedEntities) {
            const key = dayjs(t.createdAt).format("YYYY-MM-DD");
            if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        return Array.from(buckets.values());
    }, [trackedEntities, days]);

    const visitsByStage = useMemo(() => {
        const stageNames = new Map(
            program?.programStages.map((s) => [s.id, s.name]) ?? [],
        );
        const counts: Record<string, number> = {};
        for (const e of events) {
            if (dayjs(e.occurredAt ?? e.createdAt).isBefore(periodStart)) {
                continue;
            }
            const key = stageNames.get(e.programStage) ?? e.programStage;
            counts[key] = (counts[key] ?? 0) + 1;
        }
        return Object.entries(counts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }, [events, program, periodStart]);

    const exportRegistrations = () => {
        const rows = trackedEntities.map((t) => ({
            id: t.trackedEntity,
            createdAt: t.createdAt ?? "",
            syncStatus: t.syncStatus ?? "",
        }));
        downloadCSV(
            rows,
            `eregisters-registrations-${dayjs().format("YYYY-MM-DD")}.csv`,
        );
    };

    return (
        <Content
            style={{ padding: token.padding, paddingBottom: token.paddingXL }}
        >
            <Flex
                align="center"
                justify="space-between"
                gap={token.marginSM}
                wrap
                style={{ marginBottom: token.margin }}
            >
                <Flex vertical gap={token.marginXXS}>
                    <Title level={4} style={{ margin: 0, lineHeight: 1.2 }}>
                        Reports
                    </Title>
                    <Text type="secondary">
                        Local summary for {name}. {RANGE_LABEL[range]}.
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
                        icon={<DownloadOutlined />}
                        onClick={exportRegistrations}
                    >
                        Export CSV
                    </Button>
                </Flex>
            </Flex>

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={24} sm={12} lg={6}>
                    <MetricCard
                        label="Total clients"
                        value={trackedEntities.length}
                        icon={<UserOutlined />}
                        accent={token.colorPrimary}
                        trend={registrationsTrend}
                        sublabel={`${registrationsInRange} in this range`}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <MetricCard
                        label="Registered today"
                        value={registeredToday}
                        icon={<CalendarOutlined />}
                        accent={token.colorSuccess}
                        delta={registrationsInRange - registrationsPrior}
                        sublabel={`${registrationsInRange} in ${RANGE_LABEL[range].toLowerCase()}`}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <MetricCard
                        label="Visits in range"
                        value={visitsInRange}
                        icon={<ExperimentOutlined />}
                        accent={token.colorInfo}
                        trend={dailyVisits.map((d) => d.value)}
                        delta={visitsInRange - visitsPrior}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <MetricCard
                        label="Pending sync"
                        value={pendingSync}
                        icon={<CloudUploadOutlined />}
                        accent={token.colorWarning}
                        sublabel="Records waiting to push"
                    />
                </Col>
            </Row>

            <div style={{ marginTop: token.margin }}>
                <Flex
                    vertical
                    gap={token.marginSM}
                    style={{
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        padding: token.padding,
                    }}
                >
                    <Flex align="center" gap={token.marginXS}>
                        <BarChartOutlined
                            style={{ color: token.colorPrimary }}
                        />
                        <Title level={5} style={{ margin: 0 }}>
                            Visits over {RANGE_LABEL[range].toLowerCase()}
                        </Title>
                    </Flex>
                    <TrendChart points={dailyVisits} accent={token.colorPrimary} />
                </Flex>
            </div>

            <div style={{ marginTop: token.margin }}>
                <Row gutter={[token.marginSM, token.marginSM]}>
                    <Col xs={24} lg={12}>
                        <Breakdown
                            title="Visits by stage"
                            items={visitsByStage}
                            accent={token.colorPrimary}
                        />
                    </Col>
                    <Col xs={24} lg={12}>
                        <Flex
                            vertical
                            gap={token.marginSM}
                            style={{
                                background: token.colorBgContainer,
                                border: `1px solid ${token.colorBorderSecondary}`,
                                padding: token.padding,
                                height: "100%",
                            }}
                        >
                            <Flex align="center" gap={token.marginXS}>
                                <BarChartOutlined
                                    style={{ color: token.colorPrimary }}
                                />
                                <Title level={5} style={{ margin: 0 }}>
                                    Coming next
                                </Title>
                            </Flex>
                            <Text type="secondary">
                                Per-facility breakdowns, vaccination coverage,
                                and printable summaries are planned. Open the
                                sync popover to download a local backup any
                                time.
                            </Text>
                        </Flex>
                    </Col>
                </Row>
            </div>
        </Content>
    );
}
