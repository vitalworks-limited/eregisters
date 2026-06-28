import {
    BarChartOutlined,
    CheckCircleOutlined,
    EyeOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import { useDataEngine } from "@dhis2/app-runtime";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { createRoute } from "@tanstack/react-router";
import {
    Alert,
    Button,
    Col,
    Empty,
    Flex,
    Row,
    Tag,
    theme,
    Typography,
} from "antd";
import dayjs from "dayjs";
import React, { useEffect, useMemo, useState } from "react";
import { BundleDrawer } from "../admin/BundleDrawer";
import { bandColor, computeHealthScore } from "../admin/healthScore";
import {
    generateInsights,
    Insight,
    SEVERITY_COLOR,
    SEVERITY_LABEL,
} from "../admin/insightsEngine";
import {
    enrollmentsCollection,
    eventsCollection,
    trackedEntitiesCollection,
} from "../collections";
import { useMetadata } from "../hooks/useMetadata";
import { SyncContext } from "../machines/sync";
import {
    DEFAULT_KILL_SWITCH,
    DEFAULT_SYNC_CONFIG,
    KillSwitch,
    SyncConfig,
} from "../sync/adminConfig";
import { refreshAdminConfig } from "../sync/adminConfigCache";
import { listTelemetry, SyncTelemetry } from "../sync/telemetry";
import { AdminRoute } from "./admin";

const { Title, Text, Paragraph } = Typography;

export const AdminInsightsRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "insights",
    component: AdminInsights,
});

const OWNER_LABEL: Record<Insight["owner"], string> = {
    developer: "Developer",
    "dhis2-admin": "DHIS2 admin",
    facility: "Facility",
    support: "Support team",
};
const URGENCY_LABEL: Record<Insight["urgency"], string> = {
    now: "Now",
    today: "Today",
    "this-week": "This week",
    "next-release": "Next release",
};

function InsightCard({ insight }: { insight: Insight }) {
    const { token } = theme.useToken();
    const color = SEVERITY_COLOR[insight.severity];
    return (
        <Flex
            vertical
            gap={token.marginSM}
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderLeft: `4px solid ${color}`,
                padding: token.padding,
            }}
        >
            <Flex align="center" justify="space-between" gap={token.marginSM} wrap>
                <Flex align="center" gap={token.marginXS}>
                    <Tag color={color} style={{ borderColor: color }}>
                        {SEVERITY_LABEL[insight.severity]}
                    </Tag>
                    <Title level={5} style={{ margin: 0 }}>
                        {insight.title}
                    </Title>
                </Flex>
                <Flex gap={token.marginXS} wrap>
                    <Tag>{OWNER_LABEL[insight.owner]}</Tag>
                    <Tag>{URGENCY_LABEL[insight.urgency]}</Tag>
                    <Tag>{insight.confidence} confidence</Tag>
                </Flex>
            </Flex>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {insight.likelyCause}
            </Paragraph>
            <div>
                <Text strong style={{ fontSize: token.fontSizeSM }}>
                    Evidence
                </Text>
                <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
                    {insight.evidence.map((e, i) => (
                        <li key={i}>
                            <Text style={{ fontSize: token.fontSizeSM }}>{e}</Text>
                        </li>
                    ))}
                </ul>
            </div>
            <Alert
                type="info"
                showIcon
                title="Recommended action"
                description={insight.recommendation}
            />
        </Flex>
    );
}

function AdminInsights() {
    const { token } = theme.useToken();
    const engine = useDataEngine();
    const { orgUnit } = useMetadata();
    const [bundleOpen, setBundleOpen] = useState(false);

    const [telemetry, setTelemetry] = useState<SyncTelemetry[]>([]);
    const [syncConfig, setSyncConfig] = useState<SyncConfig>(DEFAULT_SYNC_CONFIG);
    const [killSwitch, setKillSwitch] = useState<KillSwitch>(DEFAULT_KILL_SWITCH);
    const [loading, setLoading] = useState(false);

    const lastDataPull = SyncContext.useSelector((s) => s.context.lastDataPull);
    const lastDataPush = SyncContext.useSelector((s) => s.context.lastDataPush);
    const lastMetadataPull = SyncContext.useSelector(
        (s) => s.context.lastMetadataPull,
    );

    const { data: pendingTrackedEntities = [] } = useLiveQuery((q) =>
        q
            .from({ t: trackedEntitiesCollection })
            .where(({ t }) => eq(t.syncStatus, "pending")),
    );
    const { data: pendingEnrollments = [] } = useLiveQuery((q) =>
        q
            .from({ e: enrollmentsCollection })
            .where(({ e }) => eq(e.syncStatus, "pending")),
    );
    const { data: pendingEvents = [] } = useLiveQuery((q) =>
        q
            .from({ e: eventsCollection })
            .where(({ e }) => eq(e.syncStatus, "pending")),
    );

    const load = async () => {
        setLoading(true);
        try {
            const [t, cfg] = await Promise.all([
                listTelemetry().catch(() => []),
                refreshAdminConfig(engine).catch(() => ({
                    syncConfig: DEFAULT_SYNC_CONFIG,
                    killSwitch: DEFAULT_KILL_SWITCH,
                    loadedAt: 0,
                })),
            ]);
            setTelemetry(t);
            setSyncConfig(cfg.syncConfig);
            setKillSwitch(cfg.killSwitch);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const health = useMemo(
        () =>
            computeHealthScore({
                telemetry,
                pendingTrackedEntities: pendingTrackedEntities.length,
                pendingEnrollments: pendingEnrollments.length,
                pendingEvents: pendingEvents.length,
                lastDataPull,
                lastMetadataPull,
            }),
        [
            telemetry,
            pendingTrackedEntities,
            pendingEnrollments,
            pendingEvents,
            lastDataPull,
            lastMetadataPull,
        ],
    );

    const insights = useMemo(
        () =>
            generateInsights({
                telemetry,
                pendingTrackedEntities: pendingTrackedEntities.length,
                pendingEnrollments: pendingEnrollments.length,
                pendingEvents: pendingEvents.length,
                lastDataPull,
                lastMetadataPull,
            }),
        [
            telemetry,
            pendingTrackedEntities,
            pendingEnrollments,
            pendingEvents,
            lastDataPull,
            lastMetadataPull,
        ],
    );

    const bySeverity = useMemo(() => {
        const out: Record<Insight["severity"], Insight[]> = {
            critical: [],
            high: [],
            warning: [],
            info: [],
        };
        for (const i of insights) out[i.severity].push(i);
        return out;
    }, [insights]);

    const bundleInputs = useMemo(
        () => ({
            syncConfig,
            killSwitch,
            facility: { id: orgUnit?.id, name: orgUnit?.name },
            pending: {
                trackedEntities: pendingTrackedEntities.length,
                enrollments: pendingEnrollments.length,
                events: pendingEvents.length,
            },
            lastDataPull,
            lastDataPush,
            lastMetadataPull,
        }),
        [
            syncConfig,
            killSwitch,
            orgUnit?.id,
            orgUnit?.name,
            pendingTrackedEntities.length,
            pendingEnrollments.length,
            pendingEvents.length,
            lastDataPull,
            lastDataPush,
            lastMetadataPull,
        ],
    );

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex align="center" justify="space-between" gap={token.marginSM} wrap>
                <Flex vertical gap={token.marginXXS}>
                    <Title level={5} style={{ margin: 0 }}>
                        Insights
                    </Title>
                    <Text type="secondary">
                        Rules-based root-cause analysis over local sync
                        telemetry. Updated when you click Refresh.
                    </Text>
                </Flex>
                <Flex gap={token.marginXS} wrap>
                    <Button
                        icon={<EyeOutlined />}
                        onClick={() => setBundleOpen(true)}
                        type="primary"
                    >
                        View bundle
                    </Button>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={load}
                        loading={loading}
                    >
                        Refresh
                    </Button>
                </Flex>
            </Flex>

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={24} md={10} lg={8}>
                    <Flex
                        vertical
                        gap={token.marginSM}
                        style={{
                            background: token.colorBgContainer,
                            border: `1px solid ${token.colorBorderSecondary}`,
                            borderLeft: `4px solid ${bandColor(health.band)}`,
                            padding: token.padding,
                            height: "100%",
                        }}
                    >
                        <Flex align="center" gap={token.marginXS}>
                            <BarChartOutlined
                                style={{ color: bandColor(health.band) }}
                            />
                            <Title level={5} style={{ margin: 0 }}>
                                Health score
                            </Title>
                        </Flex>
                        <Flex align="baseline" gap={token.marginSM}>
                            <span
                                style={{
                                    fontSize: 38,
                                    fontWeight: 600,
                                    color: bandColor(health.band),
                                    lineHeight: 1,
                                }}
                            >
                                {health.score}
                            </span>
                            <Text style={{ color: bandColor(health.band), fontSize: token.fontSizeLG, fontWeight: 600 }}>
                                {health.band}
                            </Text>
                            <Text type="secondary">/ 100</Text>
                        </Flex>
                        {health.evidence.length === 0 ? (
                            <Flex align="center" gap={token.marginXS}>
                                <CheckCircleOutlined
                                    style={{ color: token.colorSuccess }}
                                />
                                <Text type="secondary">
                                    No penalties applied — this device looks
                                    healthy.
                                </Text>
                            </Flex>
                        ) : (
                            <Flex vertical gap={token.marginXXS}>
                                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                    Penalties contributing to score
                                </Text>
                                {health.evidence.map((e, i) => (
                                    <Flex
                                        key={i}
                                        align="center"
                                        justify="space-between"
                                        gap={token.marginXS}
                                    >
                                        <Text>{e.label}</Text>
                                        <Text style={{ color: token.colorError }}>
                                            {e.delta}
                                        </Text>
                                    </Flex>
                                ))}
                            </Flex>
                        )}
                    </Flex>
                </Col>
                <Col xs={24} md={14} lg={16}>
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
                        <Title level={5} style={{ margin: 0 }}>
                            Findings summary
                        </Title>
                        <Row gutter={[token.marginSM, token.marginSM]}>
                            {(["critical", "high", "warning", "info"] as const).map(
                                (sev) => (
                                    <Col xs={12} sm={6} key={sev}>
                                        <Flex
                                            vertical
                                            gap={token.marginXXS}
                                            style={{
                                                padding: token.paddingSM,
                                                background: `${SEVERITY_COLOR[sev]}10`,
                                                borderLeft: `3px solid ${SEVERITY_COLOR[sev]}`,
                                            }}
                                        >
                                            <Text
                                                type="secondary"
                                                style={{ fontSize: token.fontSizeSM }}
                                            >
                                                {SEVERITY_LABEL[sev]}
                                            </Text>
                                            <span
                                                style={{
                                                    fontSize: 22,
                                                    fontWeight: 600,
                                                    color: SEVERITY_COLOR[sev],
                                                }}
                                            >
                                                {bySeverity[sev].length}
                                            </span>
                                        </Flex>
                                    </Col>
                                ),
                            )}
                        </Row>
                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                            Generated from {telemetry.length} recent sync runs
                            and {pendingTrackedEntities.length +
                                pendingEnrollments.length +
                                pendingEvents.length}{" "}
                            pending records.{" "}
                            {lastDataPull && (
                                <>
                                    Last data pull{" "}
                                    {dayjs(lastDataPull).fromNow()}.
                                </>
                            )}
                        </Text>
                    </Flex>
                </Col>
            </Row>

            {insights.length === 0 ? (
                <Flex
                    vertical
                    align="center"
                    gap={token.marginSM}
                    style={{
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        padding: token.paddingXL,
                    }}
                >
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <Flex vertical align="center" gap={token.marginXS}>
                                <Title level={5} style={{ margin: 0 }}>
                                    Nothing flagged
                                </Title>
                                <Text type="secondary">
                                    Sync is behaving normally on this device.
                                    Re-run the analysis after the next sync
                                    cycle if you want a fresher view.
                                </Text>
                            </Flex>
                        }
                    />
                </Flex>
            ) : (
                <Flex vertical gap={token.marginSM}>
                    {insights.map((i) => (
                        <InsightCard key={i.id} insight={i} />
                    ))}
                </Flex>
            )}
            <BundleDrawer
                open={bundleOpen}
                onClose={() => setBundleOpen(false)}
                inputs={bundleInputs}
            />
        </Flex>
    );
}
