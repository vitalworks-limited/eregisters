import { PrinterOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { useCurrentUserInfo, useDataEngine } from "@dhis2/app-runtime";
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
import { AdminCoverageBreakdown } from "./AdminCoverageBreakdown";
import { AdminFacilityCoverageMap } from "./AdminFacilityCoverageMap";
import { AdminSummaryCard } from "./AdminSummaryCard";
import { AdminTopContributorsTable } from "./AdminTopContributorsTable";
import {
    fetchOverviewSummary,
    MONITORING_NAMESPACE,
    OverviewQuery,
} from "./adminSummaryService";
import { downloadDashboardPdf } from "./dashboardPdf";
import { calculateAdminOverviewHealth } from "./overviewHealth";
import {
    AdminOverviewSummary,
    OverviewCards,
    PeriodType,
} from "./summaryTypes";
import { useProgramFacilities } from "./useProgramFacilities";
import { useProgramTotals } from "./useProgramTotals";
import { useUsersByOrgUnit } from "./useUsersByOrgUnit";

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

/** Print-only CSS — hides app chrome and lays out the dashboard for
 *  multi-page A4/Letter output via the browser's Print → Save as PDF. */
const PrintStyles: React.FC = () => (
    <style>{`
        /* Compact, professional table styling triggered while the PDF
         * exporter is capturing the dashboard. Drops cell padding so a
         * 1,000-row table actually fits, sharpens the borders, and
         * shrinks the type without making it unreadable. */
        .eregisters-print-table .ant-table-thead > tr > th,
        .eregisters-print-table .ant-table-tbody > tr > td {
            padding: 4px 8px !important;
            font-size: 11px !important;
            line-height: 1.35 !important;
            white-space: nowrap;
        }
        .eregisters-print-table .ant-table-thead > tr > th {
            background: #f1f5f9 !important;
            color: #0f172a !important;
            font-weight: 600 !important;
            border-bottom: 1px solid #cbd5e1 !important;
        }
        .eregisters-print-table .ant-table-tbody > tr:hover > td {
            background: transparent !important;
        }
        .eregisters-print-table .ant-table-tbody > tr > td {
            border-bottom: 1px solid #e2e8f0 !important;
        }
        .eregisters-print-table .ant-tag {
            font-size: 10px !important;
            padding: 0 6px !important;
            line-height: 16px !important;
            border-radius: 3px !important;
        }

        @media print {
            body { background: #fff !important; }
            header, [role="banner"], nav, .ant-layout-sider,
            .ant-pagination, .eregisters-print-hide,
            .leaflet-control-container { display: none !important; }
            .ant-layout-content,
            .ant-layout, .ant-layout-content > * {
                padding: 0 !important; margin: 0 !important;
                box-shadow: none !important;
            }
            .eregisters-print-root {
                width: 100% !important;
                max-width: 1100px;
                margin: 0 auto !important;
                font-size: 12px;
            }
            .eregisters-print-root .ant-card,
            .eregisters-print-root .ant-table-wrapper,
            .eregisters-print-root .ant-progress {
                page-break-inside: avoid;
                break-inside: avoid;
            }
            .eregisters-contributors-table .ant-pagination {
                display: none !important;
            }
            .leaflet-container { height: 320px !important; }
            a[href]:after { content: "" !important; }
        }
    `}</style>
);

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
    const [generatingPdf, setGeneratingPdf] = useState(false);
    // Fall back to the signed-in user's first org unit when no scope
    // is passed by the parent — otherwise the live tracker count
    // probes (clients + events) have nothing to anchor on and Total
    // Encounters stays blank.
    const userInfo = useCurrentUserInfo() as
        | { organisationUnits?: Array<{ id?: string }> }
        | undefined;
    const userRootOrgUnitId = userInfo?.organisationUnits?.[0]?.id;
    const { totals: liveTotals } = useProgramTotals(
        scopeRootOrgUnit?.id ?? userRootOrgUnitId,
    );
    const { facilities: programFacilities } = useProgramFacilities();
    const { counts: userCounts } = useUsersByOrgUnit();
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

    // Hydrate the four metadata-backed cards with live DHIS2 values
    // whenever they're available. This keeps the rest of the summary
    // (cache age, source labels, alerts, map) intact while ensuring the
    // numbers you care about — facilities, users, clients, encounters —
    // reflect the current instance, not last week's cache.
    const cards = useMemo(() => {
        if (!summary) return undefined;
        const next: typeof summary.cards = { ...summary.cards };
        if (programFacilities.length > 0) {
            next.facilitiesUsingERegistry = {
                ...next.facilitiesUsingERegistry,
                value: programFacilities.length,
                source: "datastore",
                status: "healthy",
            };
        }
        const distinctActiveUsers = userCounts.activeById.size;
        const distinctTotalUsers = userCounts.totalById.size;
        if (distinctTotalUsers > 0) {
            next.registeredUsers = {
                ...next.registeredUsers,
                value: distinctTotalUsers,
                source: "datastore",
                status: "healthy",
            };
            next.activeUsers = {
                ...next.activeUsers,
                value: distinctActiveUsers,
                source: "datastore",
                status: distinctActiveUsers > 0 ? "healthy" : "watch",
            };
        }
        if (typeof liveTotals.registeredClients === "number") {
            next.registeredClients = {
                ...next.registeredClients,
                value: liveTotals.registeredClients,
                source: "datastore",
                status: "healthy",
            };
        }
        if (typeof liveTotals.totalEvents === "number") {
            next.totalEncounters = {
                ...next.totalEncounters,
                value: liveTotals.totalEvents,
                source: "datastore",
                status: "healthy",
            };
        }
        return next;
    }, [summary, programFacilities, userCounts, liveTotals]);

    const health = useMemo(
        () =>
            cards
                ? calculateAdminOverviewHealth(cards)
                : { score: 0, band: "unknown" as const, penalties: [] },
        [cards],
    );

    return (
        <Flex
            vertical
            gap={token.marginSM}
            className="eregisters-print-root"
            data-pdf-root
        >
            <PrintStyles />
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
                    <Button
                        icon={<PrinterOutlined />}
                        loading={generatingPdf}
                        onClick={async () => {
                            setGeneratingPdf(true);
                            // Give React a beat to re-render the table
                            // in print mode (no pagination, no toolbar)
                            // before html2canvas snapshots the DOM.
                            await new Promise((r) => setTimeout(r, 200));
                            try {
                                await downloadDashboardPdf(
                                    "[data-pdf-root]",
                                    "eRegisters National Operational Overview",
                                    {
                                        periodLabel: PERIOD_OPTIONS.find(
                                            (p) => p.value === period,
                                        )?.label,
                                        scopeLabel: `Scope: ${orgUnit.name} · ${orgUnit.scope}`,
                                        healthBand: bandLabel(health.band),
                                    },
                                );
                            } catch (err) {
                                console.error("[pdf]", err);
                            } finally {
                                setGeneratingPdf(false);
                            }
                        }}
                    >
                        Download PDF
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

            {summary && deliveredBy === "datastore" && (
                <Flex align="center" gap={token.marginSM} wrap>
                    <AdminCacheStatusBadge cache={summary.cache} />
                    {summary.cache.isStale && (
                        <Tag color="orange">Stale cache</Tag>
                    )}
                </Flex>
            )}

            {summary &&
                (deliveredBy === "fixture" ||
                    deliveredBy === "no-data") && (
                    <Alert
                        type="info"
                        showIcon
                        title="Operational cards awaiting summary pipeline"
                        description={
                            <>
                                Sync Health, System Pressure, Tracker GETs /
                                POSTs, Slow Requests, Response Volume, Unsafe
                                Sync Patterns, App Version Status, Job Backlog
                                and Operational Alerts come from a server-side
                                summarizer that publishes JSON to{" "}
                                <Text code>
                                    dataStore/eregisters-admin-monitoring/overview/
                                    {`{period}/{orgUnit}/{scope}`}
                                </Text>
                                . Until that pipeline is enabled they will show{" "}
                                <Text strong>No data</Text>. The five
                                metadata-backed cards above (facilities, users,
                                clients, encounters) are read live from DHIS2 and
                                will populate automatically.
                            </>
                        }
                    />
                )}

            {!summary && loading && (
                <Skeleton active paragraph={{ rows: 6 }} />
            )}

            {summary && (
                <Row
                    gutter={[token.marginSM, token.marginSM]}
                    data-pdf-section="cards"
                >
                    {CARD_ORDER.map((key) => (
                        <Col key={key} xs={24} sm={12} md={8} lg={6} xl={6}>
                            <AdminSummaryCard
                                metric={(cards ?? summary.cards)[key]}
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

            <div data-pdf-section="breakdown">
                <AdminCoverageBreakdown />
            </div>

            {summary && (
                <div data-pdf-section="map">
                    <AdminFacilityCoverageMap
                        facilities={summary.facilityRiskMap}
                        printMode={generatingPdf}
                    />
                </div>
            )}

            {summary && (
                <div data-pdf-section="table">
                    <AdminTopContributorsTable
                        rows={
                            summary.facilityRiskMap.length > 0
                                ? summary.facilityRiskMap
                                : summary.topFacilities
                        }
                        printMode={generatingPdf}
                    />
                </div>
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
