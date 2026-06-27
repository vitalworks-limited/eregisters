import {
    ArrowDownOutlined,
    ArrowUpOutlined,
    AreaChartOutlined,
    CalendarOutlined,
    CloudUploadOutlined,
    DownloadOutlined,
    ExperimentOutlined,
    PieChartOutlined,
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
import {
    DistributionDonut,
    MiniSparkline,
    StageBarChart,
    VisitsAreaChart,
} from "../components/charts";
import { Spinner } from "../components/spinner";
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

// DHIS2 attribute IDs from the eRegisters program.
const ATTR_SEX = "bqliZKdUGMX";
const ATTR_DOB = "Y3DE5CZWySr";

const AGE_BANDS: Array<{ label: string; lo: number; hi: number }> = [
    { label: "Under 1", lo: 0, hi: 1 },
    { label: "1–4", lo: 1, hi: 5 },
    { label: "5–14", lo: 5, hi: 15 },
    { label: "15–24", lo: 15, hi: 25 },
    { label: "25–44", lo: 25, hi: 45 },
    { label: "45–64", lo: 45, hi: 65 },
    { label: "65+", lo: 65, hi: 200 },
];

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
                    <MiniSparkline
                        values={trend}
                        color={accent}
                        height={32}
                        width={112}
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

function ChartCard({
    icon,
    title,
    children,
    minHeight,
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
    minHeight?: number | string;
}) {
    const { token } = theme.useToken();
    return (
        <Flex
            vertical
            gap={token.marginSM}
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                padding: token.padding,
                height: "100%",
                minHeight,
            }}
        >
            <Flex align="center" gap={token.marginXS}>
                <span style={{ color: token.colorPrimary }}>{icon}</span>
                <Title level={5} style={{ margin: 0 }}>
                    {title}
                </Title>
            </Flex>
            <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
        </Flex>
    );
}

function buildDailyVisits(
    events: Array<{ occurredAt?: string; createdAt?: string }>,
    days: number,
) {
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

function downloadCSV(
    rows: Array<Record<string, string | number>>,
    filename: string,
) {
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
                    and(eq(t.orgUnit, id), not(eq(t.syncStatus, "draft"))),
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
                    and(eq(en.orgUnit, id), not(eq(en.syncStatus, "draft"))),
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
            pending(trackedEntities) + pending(enrollments) + pending(events)
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

    const sexDistribution = useMemo(() => {
        const counts = new Map<string, number>();
        for (const t of trackedEntities) {
            const raw = t.attributes?.[ATTR_SEX];
            const label =
                typeof raw === "string" && raw.trim() ? raw : "Unspecified";
            counts.set(label, (counts.get(label) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }, [trackedEntities]);

    const ageDistribution = useMemo(() => {
        const counts = new Map<string, number>();
        AGE_BANDS.forEach((b) => counts.set(b.label, 0));
        for (const t of trackedEntities) {
            const dob = t.attributes?.[ATTR_DOB];
            if (typeof dob !== "string") continue;
            const d = dayjs(dob);
            if (!d.isValid()) continue;
            const years = dayjs().diff(d, "year");
            const band = AGE_BANDS.find(
                (b) => years >= b.lo && years < b.hi,
            );
            if (band) counts.set(band.label, (counts.get(band.label) ?? 0) + 1);
        }
        // Drop empty leading/trailing bands for a cleaner chart.
        const entries = Array.from(counts.entries());
        const firstNonZero = entries.findIndex(([, v]) => v > 0);
        const lastNonZero = entries
            .map(([, v]) => v)
            .lastIndexOf(
                entries
                    .map(([, v]) => v)
                    .reduce((max, v) => (v > 0 ? v : max), 0),
            );
        const trimmed =
            firstNonZero === -1
                ? entries
                : entries.slice(
                      firstNonZero,
                      Math.max(lastNonZero, firstNonZero) + 1,
                  );
        return trimmed.map(([label, value]) => ({ label, value }));
    }, [trackedEntities]);

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
                <Row gutter={[token.marginSM, token.marginSM]}>
                    <Col xs={24} xl={16}>
                        <ChartCard
                            icon={<AreaChartOutlined />}
                            title={`Visits over ${RANGE_LABEL[range].toLowerCase()}`}
                            minHeight={300}
                        >
                            <VisitsAreaChart
                                points={dailyVisits}
                                accent={token.colorPrimary}
                                height={240}
                            />
                        </ChartCard>
                    </Col>
                    <Col xs={24} xl={8}>
                        <ChartCard
                            icon={<PieChartOutlined />}
                            title="Sex distribution"
                            minHeight={300}
                        >
                            <DistributionDonut
                                items={sexDistribution}
                                totalLabel="Total clients"
                                palette={[
                                    token.colorPrimary,
                                    "#A855F7",
                                    token.colorTextTertiary,
                                ]}
                            />
                        </ChartCard>
                    </Col>
                </Row>
            </div>

            <div style={{ marginTop: token.margin }}>
                <Row gutter={[token.marginSM, token.marginSM]}>
                    <Col xs={24} lg={12}>
                        <ChartCard
                            icon={<AreaChartOutlined />}
                            title="Visits by stage"
                            minHeight={260}
                        >
                            <StageBarChart
                                items={visitsByStage}
                                accent={token.colorPrimary}
                            />
                        </ChartCard>
                    </Col>
                    <Col xs={24} lg={12}>
                        <ChartCard
                            icon={<PieChartOutlined />}
                            title="Age distribution"
                            minHeight={260}
                        >
                            <DistributionDonut
                                items={ageDistribution}
                                totalLabel="Clients with DOB"
                            />
                        </ChartCard>
                    </Col>
                </Row>
            </div>
        </Content>
    );
}
