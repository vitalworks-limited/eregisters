import { DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import {
    useCurrentUserInfo,
    useDataEngine,
} from "@dhis2/app-runtime";
import { createRoute } from "@tanstack/react-router";
import {
    Alert,
    App,
    Button,
    Card,
    Checkbox,
    Col,
    Flex,
    InputNumber,
    Row,
    Select,
    Switch,
    theme,
    TimePicker,
    Typography,
} from "antd";
import dayjs from "dayjs";
import React, { useEffect, useState } from "react";
import {
    adminConfig,
    DEFAULT_KILL_SWITCH,
    DEFAULT_SYNC_CONFIG,
    KillSwitch,
    SyncConfig,
    TimeWindow,
} from "../sync/adminConfig";
import { refreshAdminConfig } from "../sync/adminConfigCache";
import { AdminRoute } from "./admin";

const { Title, Text, Paragraph } = Typography;

export const AdminConfigRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "config",
    component: AdminConfig,
});

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function emptyWindow(): TimeWindow {
    return {
        daysOfWeek: [1, 2, 3, 4, 5],
        fromLocal: "08:00",
        toLocal: "17:00",
        label: "",
    };
}

function WindowEditor({
    title,
    items,
    onChange,
    accent,
}: {
    title: string;
    items: TimeWindow[];
    onChange: (next: TimeWindow[]) => void;
    accent: string;
}) {
    const { token } = theme.useToken();
    return (
        <Flex vertical gap={token.marginSM}>
            <Flex align="center" justify="space-between" gap={token.marginSM}>
                <Title level={5} style={{ margin: 0 }}>
                    {title}
                </Title>
                <Button
                    icon={<PlusOutlined />}
                    onClick={() => onChange([...items, emptyWindow()])}
                >
                    Add window
                </Button>
            </Flex>
            {items.length === 0 && (
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    None configured.
                </Text>
            )}
            {items.map((win, i) => (
                <Card
                    key={i}
                    size="small"
                    style={{
                        borderInlineStart: `3px solid ${accent}`,
                    }}
                >
                    <Flex vertical gap={token.marginSM}>
                        <Flex gap={token.marginSM} wrap>
                            <Flex vertical gap={token.marginXXS}>
                                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                    From
                                </Text>
                                <TimePicker
                                    value={dayjs(win.fromLocal, "HH:mm")}
                                    format="HH:mm"
                                    minuteStep={15}
                                    onChange={(v) => {
                                        const next = [...items];
                                        next[i] = {
                                            ...win,
                                            fromLocal: v ? v.format("HH:mm") : "08:00",
                                        };
                                        onChange(next);
                                    }}
                                />
                            </Flex>
                            <Flex vertical gap={token.marginXXS}>
                                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                    To
                                </Text>
                                <TimePicker
                                    value={dayjs(win.toLocal, "HH:mm")}
                                    format="HH:mm"
                                    minuteStep={15}
                                    onChange={(v) => {
                                        const next = [...items];
                                        next[i] = {
                                            ...win,
                                            toLocal: v ? v.format("HH:mm") : "17:00",
                                        };
                                        onChange(next);
                                    }}
                                />
                            </Flex>
                            <Flex vertical gap={token.marginXXS} style={{ flex: 1, minWidth: 200 }}>
                                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                    Days of week
                                </Text>
                                <Select
                                    mode="multiple"
                                    value={win.daysOfWeek}
                                    options={DAY_LABELS.map((d, idx) => ({
                                        value: idx,
                                        label: d,
                                    }))}
                                    onChange={(values) => {
                                        const next = [...items];
                                        next[i] = {
                                            ...win,
                                            daysOfWeek: values as number[],
                                        };
                                        onChange(next);
                                    }}
                                />
                            </Flex>
                            <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() =>
                                    onChange(items.filter((_, j) => j !== i))
                                }
                                aria-label="Remove window"
                                style={{ alignSelf: "flex-end" }}
                            />
                        </Flex>
                        <Flex vertical gap={token.marginXXS}>
                            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                Label (shown to users when sync is blocked)
                            </Text>
                            <input
                                value={win.label ?? ""}
                                placeholder="Working hours"
                                onChange={(e) => {
                                    const next = [...items];
                                    next[i] = { ...win, label: e.target.value };
                                    onChange(next);
                                }}
                                style={{
                                    border: `1px solid ${token.colorBorderSecondary}`,
                                    padding: `${token.paddingXXS}px ${token.paddingSM}px`,
                                    background: token.colorBgContainer,
                                    color: token.colorTextBase,
                                    fontSize: token.fontSize,
                                }}
                            />
                        </Flex>
                    </Flex>
                </Card>
            ))}
        </Flex>
    );
}

function AdminConfig() {
    const { token } = theme.useToken();
    const engine = useDataEngine();
    const userInfo = useCurrentUserInfo() as
        | { username?: string; name?: string }
        | undefined;
    const { message } = App.useApp();
    const [syncConfig, setSyncConfig] = useState<SyncConfig>(DEFAULT_SYNC_CONFIG);
    const [killSwitch, setKillSwitch] = useState<KillSwitch>(DEFAULT_KILL_SWITCH);
    const [killReason, setKillReason] = useState("");
    const [notice, setNotice] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [sc, ks] = await Promise.all([
                adminConfig.getSyncConfig(engine),
                adminConfig.getKillSwitch(engine),
            ]);
            setSyncConfig(sc);
            setKillSwitch(ks);
            setKillReason(ks.reason ?? "");
            setNotice(sc.notice ?? "");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const saveAll = async () => {
        setSaving(true);
        try {
            const sc: SyncConfig = {
                ...syncConfig,
                notice: notice.trim() || undefined,
                updatedAt: new Date().toISOString(),
                updatedBy: userInfo?.username ?? userInfo?.name,
            };
            const ks: KillSwitch = {
                pauseAllSync: killSwitch.pauseAllSync,
                reason: killSwitch.pauseAllSync ? killReason.trim() : undefined,
                setAt: killSwitch.pauseAllSync
                    ? new Date().toISOString()
                    : undefined,
                setBy: killSwitch.pauseAllSync
                    ? userInfo?.username ?? userInfo?.name
                    : undefined,
            };
            await Promise.all([
                adminConfig.setSyncConfig(engine, sc),
                adminConfig.setKillSwitch(engine, ks),
            ]);
            await refreshAdminConfig(engine);
            message.success("Saved. All clients will refresh within 5 minutes.");
        } catch (e) {
            message.error(
                e instanceof Error ? e.message : "Save failed — check dataStore permissions.",
            );
        } finally {
            setSaving(false);
        }
    };

    const resetDefaults = () => {
        setSyncConfig(DEFAULT_SYNC_CONFIG);
        setKillSwitch(DEFAULT_KILL_SWITCH);
        setKillReason("");
        setNotice("");
    };

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex align="center" justify="space-between" gap={token.marginSM} wrap>
                <Flex vertical gap={token.marginXXS}>
                    <Title level={5} style={{ margin: 0 }}>
                        Sync configuration
                    </Title>
                    <Text type="secondary">
                        Stored in DHIS2 dataStore <Text code>eregisters-admin</Text>.
                        All clients re-read this every 5 minutes.
                    </Text>
                </Flex>
                <Flex gap={token.marginXS} wrap>
                    <Button onClick={resetDefaults}>Reset to defaults</Button>
                    <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        loading={saving}
                        onClick={saveAll}
                    >
                        Save changes
                    </Button>
                </Flex>
            </Flex>

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={24} lg={12}>
                    <Card
                        title="Kill switch"
                        loading={loading}
                        style={{
                            border: `1px solid ${
                                killSwitch.pauseAllSync
                                    ? token.colorError
                                    : token.colorBorderSecondary
                            }`,
                        }}
                    >
                        <Flex vertical gap={token.marginSM}>
                            <Flex align="center" justify="space-between" gap={token.marginSM}>
                                <Flex vertical gap={token.marginXXS}>
                                    <Text strong>Pause all sync</Text>
                                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                        Halt every client's pull, push, and delete
                                        traffic until disengaged.
                                    </Text>
                                </Flex>
                                <Switch
                                    checked={killSwitch.pauseAllSync}
                                    onChange={(checked) =>
                                        setKillSwitch((s) => ({
                                            ...s,
                                            pauseAllSync: checked,
                                        }))
                                    }
                                />
                            </Flex>
                            {killSwitch.pauseAllSync && (
                                <>
                                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                        Reason (shown to users in the sync popover)
                                    </Text>
                                    <input
                                        value={killReason}
                                        placeholder="e.g. End-of-month reporting freeze"
                                        onChange={(e) => setKillReason(e.target.value)}
                                        style={{
                                            border: `1px solid ${token.colorBorderSecondary}`,
                                            padding: `${token.paddingXS}px ${token.paddingSM}px`,
                                            background: token.colorBgContainer,
                                            color: token.colorTextBase,
                                            fontSize: token.fontSize,
                                        }}
                                    />
                                </>
                            )}
                        </Flex>
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <Card title="Background sync tuning" loading={loading}>
                        <Flex vertical gap={token.marginSM}>
                            <Flex
                                align="center"
                                justify="space-between"
                                gap={token.marginSM}
                            >
                                <Flex vertical gap={token.marginXXS}>
                                    <Text strong>Jitter window</Text>
                                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                        Random spread (minutes) added to the
                                        scheduler hash so devices don't sync
                                        to the same minute.
                                    </Text>
                                </Flex>
                                <InputNumber
                                    min={0}
                                    max={30}
                                    value={syncConfig.jitterMinutes}
                                    onChange={(v) =>
                                        setSyncConfig((c) => ({
                                            ...c,
                                            jitterMinutes:
                                                typeof v === "number" ? v : 0,
                                        }))
                                    }
                                    addonAfter="min"
                                    style={{ width: 140 }}
                                />
                            </Flex>
                            <Flex
                                align="center"
                                justify="space-between"
                                gap={token.marginSM}
                            >
                                <Flex vertical gap={token.marginXXS}>
                                    <Text strong>Telemetry transport</Text>
                                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                        When off, clients keep local diagnostics
                                        but won't post to the dataStore.
                                    </Text>
                                </Flex>
                                <Switch
                                    checked={syncConfig.telemetryEnabled}
                                    onChange={(v) =>
                                        setSyncConfig((c) => ({
                                            ...c,
                                            telemetryEnabled: v,
                                        }))
                                    }
                                />
                            </Flex>
                        </Flex>
                    </Card>
                </Col>
            </Row>

            <Card title="Allowed sync windows" loading={loading}>
                <Paragraph type="secondary" style={{ marginBottom: token.marginSM }}>
                    When at least one window is configured, sync only runs
                    while inside one of them. Leave empty to allow sync
                    anytime.
                </Paragraph>
                <WindowEditor
                    title=""
                    items={syncConfig.allowedWindows}
                    onChange={(items) =>
                        setSyncConfig((c) => ({ ...c, allowedWindows: items }))
                    }
                    accent={token.colorSuccess}
                />
            </Card>

            <Card title="Blocked sync windows" loading={loading}>
                <Paragraph type="secondary" style={{ marginBottom: token.marginSM }}>
                    Sync is paused while inside any of these windows.
                    Evaluated after allowed windows.
                </Paragraph>
                <WindowEditor
                    title=""
                    items={syncConfig.blockedWindows}
                    onChange={(items) =>
                        setSyncConfig((c) => ({ ...c, blockedWindows: items }))
                    }
                    accent={token.colorError}
                />
            </Card>

            <Card title="In-app notice" loading={loading}>
                <Paragraph type="secondary" style={{ marginBottom: token.marginSM }}>
                    Optional banner shown to all users in the sync popover.
                </Paragraph>
                <textarea
                    value={notice}
                    placeholder="e.g. Pilot phase — please report issues to the help desk"
                    onChange={(e) => setNotice(e.target.value)}
                    rows={3}
                    style={{
                        width: "100%",
                        border: `1px solid ${token.colorBorderSecondary}`,
                        padding: `${token.paddingXS}px ${token.paddingSM}px`,
                        background: token.colorBgContainer,
                        color: token.colorTextBase,
                        fontSize: token.fontSize,
                        fontFamily: token.fontFamily,
                    }}
                />
            </Card>

            {syncConfig.updatedAt && (
                <Alert
                    type="info"
                    showIcon
                    title="Currently published"
                    description={`Last saved ${dayjs(syncConfig.updatedAt).fromNow()}${
                        syncConfig.updatedBy ? ` by ${syncConfig.updatedBy}` : ""
                    }.`}
                />
            )}
            <Checkbox checked disabled>
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    Save also writes a row to{" "}
                    <Text code style={{ fontSize: token.fontSizeSM }}>
                        eregisters-admin/audit-log
                    </Text>{" "}
                    (last 200 changes retained).
                </Text>
            </Checkbox>
        </Flex>
    );
}
