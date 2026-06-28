import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    DatabaseOutlined,
    StopOutlined,
    SyncOutlined,
    TeamOutlined,
} from "@ant-design/icons";
import { useDataEngine } from "@dhis2/app-runtime";
import { createRoute, Link } from "@tanstack/react-router";
import { Alert, Col, Flex, Row, theme, Typography } from "antd";
import dayjs from "dayjs";
import React, { useEffect, useState } from "react";
import { useMetadata } from "../hooks/useMetadata";
import { SyncContext } from "../machines/sync";
import { getStorageEstimate } from "../sync/persistentStorage";
import {
    DEFAULT_KILL_SWITCH,
    DEFAULT_SYNC_CONFIG,
    KillSwitch,
    SyncConfig,
} from "../sync/adminConfig";
import { refreshAdminConfig } from "../sync/adminConfigCache";
import { listTelemetry, SyncTelemetry } from "../sync/telemetry";
import { AdminRoute } from "./admin";

const { Title, Text } = Typography;

export const AdminIndexRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "/",
    component: AdminOverview,
});

interface StatusCardProps {
    title: string;
    value: React.ReactNode;
    icon: React.ReactNode;
    accent: string;
    sublabel?: React.ReactNode;
}

function StatusCard({ title, value, icon, accent, sublabel }: StatusCardProps) {
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
                    {title}
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

function AdminOverview() {
    const { token } = theme.useToken();
    const engine = useDataEngine();
    const { orgUnit } = useMetadata();
    const [syncConfig, setSyncConfig] = useState<SyncConfig>(DEFAULT_SYNC_CONFIG);
    const [killSwitch, setKillSwitch] = useState<KillSwitch>(DEFAULT_KILL_SWITCH);
    const [telemetry, setTelemetry] = useState<SyncTelemetry[]>([]);
    const [storage, setStorage] = useState<{ quotaBytes?: number; usageBytes?: number }>({});
    const [online, setOnline] = useState(
        typeof navigator !== "undefined" ? navigator.onLine : true,
    );

    const lastDataPull = SyncContext.useSelector((s) => s.context.lastDataPull);
    const lastDataPush = SyncContext.useSelector((s) => s.context.lastDataPush);
    const lastMetadataPull = SyncContext.useSelector(
        (s) => s.context.lastMetadataPull,
    );

    useEffect(() => {
        refreshAdminConfig(engine)
            .then((snap) => {
                setSyncConfig(snap.syncConfig);
                setKillSwitch(snap.killSwitch);
            })
            .catch(() => undefined);
        listTelemetry().then(setTelemetry).catch(() => undefined);
        getStorageEstimate().then(setStorage).catch(() => undefined);
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, [engine]);

    const recentFailures = telemetry.filter(
        (t) => (t.failures?.length ?? 0) > 0,
    );
    const totalSyncs = telemetry.length;
    const recentSync = telemetry[0];
    const successCount = telemetry.filter(
        (t) =>
            (t.failures?.length ?? 0) === 0 &&
            ((t.trackedEntitiesPulled ?? 0) +
                (t.eventsPulled ?? 0) +
                (t.trackerPosts ?? 0)) >
                0,
    ).length;
    const successRate =
        totalSyncs === 0
            ? 0
            : Math.round(((totalSyncs - recentFailures.length) / totalSyncs) * 100);
    const avgPullSize =
        telemetry.length === 0
            ? 0
            : Math.round(
                  telemetry.reduce(
                      (s, t) =>
                          s +
                          (t.trackedEntitiesPulled ?? 0) +
                          (t.eventsPulled ?? 0),
                      0,
                  ) / telemetry.length,
              );
    const pendingTotal = telemetry.reduce(
        (s, t) => s + (t.trackerPosts ?? 0),
        0,
    );

    const storagePct =
        storage.usageBytes && storage.quotaBytes
            ? Math.min(
                  100,
                  Math.round(
                      (storage.usageBytes / storage.quotaBytes) * 100,
                  ),
              )
            : undefined;
    const mb = (b?: number) =>
        b === undefined ? "—" : `${(b / (1024 * 1024)).toFixed(1)} MB`;

    const allowedCount = syncConfig.allowedWindows.length;
    const blockedCount = syncConfig.blockedWindows.length;

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex vertical gap={token.marginXXS}>
                <Title level={5} style={{ margin: 0 }}>
                    This device & facility
                </Title>
                <Text type="secondary">
                    Local snapshot for the signed-in user. For
                    cluster-wide indicators see{" "}
                    <Link to="/admin/dashboard">National dashboard</Link>.
                </Text>
            </Flex>

            {killSwitch.pauseAllSync && (
                <Alert
                    type="error"
                    showIcon
                    title="Sync is paused for everyone"
                    description={
                        <>
                            Reason: {killSwitch.reason ?? "Not provided"}
                            {killSwitch.setBy && (
                                <>
                                    {" "}
                                    · Set by {killSwitch.setBy}
                                </>
                            )}
                            {killSwitch.setAt && (
                                <>
                                    {" "}
                                    ·{" "}
                                    {dayjs(killSwitch.setAt).format(
                                        "MMM D, HH:mm",
                                    )}
                                </>
                            )}
                            . Lift this from{" "}
                            <Link to="/admin/config">Config</Link>.
                        </>
                    }
                />
            )}

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={12} sm={6}>
                    <StatusCard
                        title="Kill switch"
                        value={
                            killSwitch.pauseAllSync ? "Engaged" : "Disengaged"
                        }
                        icon={
                            killSwitch.pauseAllSync ? (
                                <StopOutlined />
                            ) : (
                                <CheckCircleOutlined />
                            )
                        }
                        accent={
                            killSwitch.pauseAllSync
                                ? token.colorError
                                : token.colorSuccess
                        }
                        sublabel={
                            killSwitch.pauseAllSync
                                ? "All sync paused"
                                : "Sync flowing"
                        }
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <StatusCard
                        title="Sync windows"
                        value={
                            allowedCount + blockedCount === 0
                                ? "Default"
                                : `${allowedCount} allowed · ${blockedCount} blocked`
                        }
                        icon={<SyncOutlined />}
                        accent={token.colorPrimary}
                        sublabel={
                            allowedCount + blockedCount === 0
                                ? "No window restrictions"
                                : "Edit from Config"
                        }
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <StatusCard
                        title="Jitter window"
                        value={`±${syncConfig.jitterMinutes} min`}
                        icon={<DatabaseOutlined />}
                        accent={token.colorInfo}
                        sublabel="Random spread on background pulls"
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <StatusCard
                        title="This device"
                        value={orgUnit?.name ?? "—"}
                        icon={<TeamOutlined />}
                        accent={token.colorPrimary}
                        sublabel="Facility scope"
                    />
                </Col>
            </Row>

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={12} sm={6}>
                    <StatusCard
                        title="Network"
                        value={online ? "Online" : "Offline"}
                        icon={
                            online ? <CheckCircleOutlined /> : <CloseCircleOutlined />
                        }
                        accent={online ? token.colorSuccess : token.colorError}
                        sublabel={online ? "Sync flowing" : "Queueing locally"}
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <StatusCard
                        title="Sync success rate"
                        value={`${successRate}%`}
                        icon={<SyncOutlined />}
                        accent={
                            successRate >= 95
                                ? token.colorSuccess
                                : successRate >= 80
                                  ? token.colorWarning
                                  : token.colorError
                        }
                        sublabel={`${recentFailures.length} of ${totalSyncs} failed`}
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <StatusCard
                        title="Avg pull size"
                        value={avgPullSize}
                        icon={<DatabaseOutlined />}
                        accent={token.colorInfo}
                        sublabel="TE + events per run"
                    />
                </Col>
                <Col xs={12} sm={6}>
                    <StatusCard
                        title="Local storage"
                        value={
                            storagePct === undefined ? "—" : `${storagePct}%`
                        }
                        icon={<DatabaseOutlined />}
                        accent={
                            storagePct !== undefined && storagePct > 75
                                ? token.colorWarning
                                : token.colorPrimary
                        }
                        sublabel={`${mb(storage.usageBytes)} of ${mb(storage.quotaBytes)}`}
                    />
                </Col>
            </Row>

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={24} lg={12}>
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
                            Sync activity (this device)
                        </Title>
                        <Flex justify="space-between" wrap gap={token.marginSM}>
                            <Field
                                label="Last metadata sync"
                                value={
                                    lastMetadataPull
                                        ? dayjs(lastMetadataPull).fromNow()
                                        : "Never"
                                }
                            />
                            <Field
                                label="Last data pull"
                                value={
                                    lastDataPull
                                        ? dayjs(lastDataPull).fromNow()
                                        : "Never"
                                }
                            />
                            <Field
                                label="Last data push"
                                value={
                                    lastDataPush
                                        ? dayjs(lastDataPush).fromNow()
                                        : "Never"
                                }
                            />
                            <Field
                                label="Recent failures"
                                value={`${recentFailures.length} of ${totalSyncs}`}
                                accent={
                                    recentFailures.length > 0
                                        ? token.colorError
                                        : undefined
                                }
                            />
                        </Flex>
                        {recentSync && (
                            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                Most recent sync:{" "}
                                <Text strong style={{ fontSize: token.fontSizeSM }}>
                                    {recentSync.mode}
                                </Text>{" "}
                                · {dayjs(recentSync.startedAt).fromNow()} ·{" "}
                                {(recentSync.failures?.length ?? 0) > 0
                                    ? `${recentSync.failures!.length} failures`
                                    : "ok"}
                            </Text>
                        )}
                    </Flex>
                </Col>
                <Col xs={24} lg={12}>
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
                            Notices
                        </Title>
                        {syncConfig.notice ? (
                            <Alert
                                type="info"
                                showIcon
                                title="Active broadcast"
                                description={syncConfig.notice}
                            />
                        ) : (
                            <Text type="secondary">No active broadcast.</Text>
                        )}
                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                            Manage broadcast banner from{" "}
                            <Link to="/admin/config">Config</Link>.
                        </Text>
                    </Flex>
                </Col>
            </Row>

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col span={24}>
                    <Flex
                        vertical
                        gap={token.marginXS}
                        style={{
                            background: token.colorBgContainer,
                            border: `1px solid ${token.colorBorderSecondary}`,
                            padding: token.padding,
                        }}
                    >
                        <Flex
                            align="center"
                            gap={token.marginXS}
                            justify="space-between"
                        >
                            <Title level={5} style={{ margin: 0 }}>
                                Recent failures
                            </Title>
                            <Link
                                to="/admin/logs"
                                style={{ color: token.colorPrimary }}
                            >
                                View full log →
                            </Link>
                        </Flex>
                        {recentFailures.length === 0 ? (
                            <Text type="secondary">
                                No failures in the last {totalSyncs} syncs.
                            </Text>
                        ) : (
                            <Flex vertical gap={token.marginXXS}>
                                {recentFailures.slice(0, 5).map((t) => (
                                    <Flex
                                        key={t.syncId}
                                        align="center"
                                        justify="space-between"
                                        gap={token.marginSM}
                                        style={{
                                            paddingBlock: token.paddingXXS,
                                            borderBottom: `1px solid ${token.colorBorderSecondary}`,
                                        }}
                                    >
                                        <Flex
                                            align="center"
                                            gap={token.marginXS}
                                        >
                                            <CloseCircleOutlined
                                                style={{
                                                    color: token.colorError,
                                                }}
                                            />
                                            <Text strong>{t.mode}</Text>
                                            <Text type="secondary">
                                                {dayjs(t.startedAt).fromNow()}
                                            </Text>
                                        </Flex>
                                        <Text
                                            type="secondary"
                                            style={{
                                                fontSize: token.fontSizeSM,
                                            }}
                                        >
                                            {t.failures?.[0]?.message}
                                        </Text>
                                    </Flex>
                                ))}
                            </Flex>
                        )}
                    </Flex>
                </Col>
            </Row>
        </Flex>
    );
}

function Field({
    label,
    value,
    accent,
}: {
    label: string;
    value: React.ReactNode;
    accent?: string;
}) {
    const { token } = theme.useToken();
    return (
        <Flex vertical gap={0} style={{ minWidth: 120 }}>
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {label}
            </Text>
            <Text
                strong
                style={{ color: accent ?? token.colorTextBase }}
            >
                {value}
            </Text>
        </Flex>
    );
}
