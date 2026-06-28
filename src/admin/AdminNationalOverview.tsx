import { ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { useDataEngine } from "@dhis2/app-runtime";
import {
    Alert,
    Button,
    Col,
    Flex,
    Row,
    Segmented,
    Select,
    Skeleton,
    Tag,
    theme,
    Typography,
} from "antd";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AdminCacheStatusBadge } from "./AdminCacheStatusBadge";
import { AdminFacilityCoverageMap } from "./AdminFacilityCoverageMap";
import { AdminOperationalAlertsPanel } from "./AdminOperationalAlertsPanel";
import { AdminSummaryCard } from "./AdminSummaryCard";
import { AdminTopContributorsTable } from "./AdminTopContributorsTable";
import {
    fetchOverviewSummary,
    MONITORING_NAMESPACE,
    OverviewQuery,
} from "./adminSummaryService";
import { calculateAdminOverviewHealth } from "./overviewHealth";
import {
    AdminOverviewSummary,
    OverviewCards,
    PeriodType,
} from "./summaryTypes";

const { Title, Text, Paragraph } = Typography;

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
    { value: "TODAY", label: "Today" },
    { value: "YESTERDAY", label: "Yesterday" },
    { value: "LAST_7_DAYS", label: "Last 7 days" },
    { value: "LAST_30_DAYS", label: "Last 30 days" },
    { value: "THIS_MONTH", label: "This month" },
    { value: "LAST_MONTH", label: "Last month" },
    { value: "THIS_QUARTER", label: "This quarter" },
    { value: "THIS_YEAR", label: "This year" },
];

const MIN_REFRESH_INTERVAL_MS = 60_000;

const CARD_ORDER: (keyof OverviewCards)[] = [
    "facilitiesUsingERegistry",
    "registeredUsers",
    "activeUsers",
    "registeredClients",
    "totalEncounters",
    "syncHealth",
    "systemPressure",
    "trackerGets",
    "trackerPosts",
    "slowRequests",
    "responseVolumeMb",
    "unsafePatternCount",
    "appVersionStatus",
    "jobBacklog",
    "operationalAlerts",
];

function bandTagColor(band: string): string {
    switch (band) {
        case "healthy":
            return "green";
        case "watch":
            return "gold";
        case "degraded":
            return "orange";
        case "critical":
            return "red";
        default:
            return "default";
    }
}

function bandLabel(band: string): string {
    switch (band) {
        case "healthy":
            return "Healthy";
        case "watch":
            return "Watch";
        case "degraded":
            return "Degraded";
        case "critical":
            return "Critical";
        default:
            return "No data";
    }
}

export const AdminNationalOverview: React.FC<{
    /** When provided, restricts the org unit selector to this subtree id. */
    scopeRootOrgUnit?: { id: string; name: string };
}> = ({ scopeRootOrgUnit }) => {
    const { token } = theme.useToken();
    const engine = useDataEngine();
    const [period, setPeriod] = useState<PeriodType>("THIS_YEAR");
    const [scope, setScope] = useState<OverviewQuery["orgUnit"]["scope"]>(
        scopeRootOrgUnit ? "DESCENDANTS" : "NATIONAL",
    );
    const [summary, setSummary] = useState<AdminOverviewSummary | undefined>();
    const [loading, setLoading] = useState(false);
    const [deliveredBy, setDeliveredBy] = useState<
        "datastore" | "fixture" | "no-data" | undefined
    >();
    const [error, setError] = useState<string | undefined>();
    const [lastFetchAt, setLastFetchAt] = useState(0);

    const orgUnit = useMemo(
        () =>
            scopeRootOrgUnit
                ? {
                      id: scopeRootOrgUnit.id,
                      name: scopeRootOrgUnit.name,
                      scope,
                  }
                : { id: "NATIONAL", name: "National", scope },
        [scope, scopeRootOrgUnit],
    );

    const load = useCallback(
        async (opts: { force?: boolean } = {}) => {
            const now = Date.now();
            if (
                !opts.force &&
                now - lastFetchAt < MIN_REFRESH_INTERVAL_MS &&
                summary
            ) {
                return;
            }
            setLoading(true);
            setError(undefined);
            try {
                const r = await fetchOverviewSummary(engine, {
                    period,
                    orgUnit,
                });
                setSummary(r.summary);
                setDeliveredBy(r.deliveredBy);
                setLastFetchAt(Date.now());
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to read summary",
                );
            } finally {
                setLoading(false);
            }
        },
        [engine, period, orgUnit, lastFetchAt, summary],
    );

    useEffect(() => {
        // Reset cooldown when filters change so the user gets fresh data.
        setLastFetchAt(0);
        // Reload on filter change.
        load({ force: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period, orgUnit.id, orgUnit.scope]);

    const health = useMemo(
        () =>
            summary
                ? calculateAdminOverviewHealth(summary.cards)
                : { score: 0, band: "unknown" as const, penalties: [] },
        [summary],
    );

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex
                align="center"
                justify="space-between"
                gap={token.marginSM}
                wrap
            >
                <Flex vertical gap={token.marginXXS}>
                    <Flex align="center" gap={token.marginXS}>
                        <Title level={5} style={{ margin: 0 }}>
                            National operational overview
                        </Title>
                        <Tag color={bandTagColor(health.band)}>
                            {bandLabel(health.band)}
                        </Tag>
                    </Flex>
                    <Text type="secondary">
                        Cached summaries only — no tracker queries run from
                        this dashboard.
                    </Text>
                </Flex>
                <Flex align="center" gap={token.marginXS} wrap>
                    <Select
                        value={period}
                        options={PERIOD_OPTIONS}
                        onChange={(v) => setPeriod(v)}
                        style={{ minWidth: 160 }}
                        size="middle"
                    />
                    <Segmented
                        value={scope}
                        onChange={(v) =>
                            setScope(v as OverviewQuery["orgUnit"]["scope"])
                        }
                        options={[
                            { value: "NATIONAL", label: "National" },
                            { value: "DESCENDANTS", label: "Subtree" },
                            { value: "SELECTED", label: "Selected" },
                        ]}
                    />
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => load({ force: true })}
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
                    icon={<WarningOutlined />}
                    title="Summary read failed"
                    description={error}
                />
            )}

            {summary && (
                <Flex align="center" gap={token.marginSM} wrap>
                    <AdminCacheStatusBadge cache={summary.cache} />
                    {deliveredBy === "fixture" && (
                        <Tag color="purple">Development fixture</Tag>
                    )}
                    {deliveredBy === "no-data" && (
                        <Tag color="default">No summary data</Tag>
                    )}
                    {summary.cache.isStale && (
                        <Tag color="orange">Stale cache</Tag>
                    )}
                </Flex>
            )}

            {!summary && loading && (
                <Skeleton active paragraph={{ rows: 6 }} />
            )}

            {summary && (
                <Row gutter={[token.marginSM, token.marginSM]}>
                    {CARD_ORDER.map((key) => (
                        <Col key={key} xs={24} sm={12} md={8} lg={6} xl={6}>
                            <AdminSummaryCard
                                metric={summary.cards[key]}
                            />
                        </Col>
                    ))}
                </Row>
            )}

            {summary && deliveredBy === "no-data" && (
                <Alert
                    type="info"
                    showIcon
                    title="No Admin Summary Data Available"
                    description={
                        <>
                            <Paragraph style={{ marginBottom: 0 }}>
                                The dashboard is configured to use safe
                                cached summaries only. No live tracker
                                scan will be run from this page.
                            </Paragraph>
                            <Paragraph
                                style={{
                                    marginBottom: 0,
                                    marginTop: token.marginXS,
                                }}
                                type="secondary"
                            >
                                Configure the summary generator to publish
                                JSON into{" "}
                                <Text code>
                                    dataStore/{MONITORING_NAMESPACE}/overview/
                                    {`{period}/{orgUnit}/{scope}`}
                                </Text>{" "}
                                and refresh.
                            </Paragraph>
                        </>
                    }
                />
            )}

            {summary && (
                <Flex vertical gap={token.marginXS}>
                    <Title level={5} style={{ margin: 0 }}>
                        Operational alerts
                    </Title>
                    <AdminOperationalAlertsPanel alerts={summary.alerts} />
                </Flex>
            )}

            {summary && (
                <AdminFacilityCoverageMap
                    facilities={summary.facilityRiskMap}
                />
            )}

            {summary && (
                <AdminTopContributorsTable rows={summary.topFacilities} />
            )}

            {summary && health.penalties.length > 0 && (
                <Flex
                    vertical
                    gap={token.marginXXS}
                    style={{
                        background: token.colorFillTertiary,
                        padding: token.paddingSM,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    <Text strong>Why the score is {health.score}/100</Text>
                    <ul
                        style={{
                            margin: 0,
                            paddingInlineStart: 18,
                            color: token.colorTextSecondary,
                        }}
                    >
                        {health.penalties.map((p, i) => (
                            <li key={i}>
                                <Text
                                    type="secondary"
                                    style={{ fontSize: token.fontSizeSM }}
                                >
                                    {p.reason} ({p.delta})
                                </Text>
                            </li>
                        ))}
                    </ul>
                </Flex>
            )}
        </Flex>
    );
};
