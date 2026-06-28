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
    Input,
    InputNumber,
    Radio,
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
    const [noticeMode, setNoticeMode] = useState<"banner" | "modal">("banner");
    const [noticeRequiresAck, setNoticeRequiresAck] = useState(false);
    const [noticeActionLabel, setNoticeActionLabel] = useState("");
    const [noticeActionHref, setNoticeActionHref] = useState("");
    const [noticeAction, setNoticeAction] = useState<
        NonNullable<SyncConfig["noticeAction"]>
    >("dismiss");
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
            setNoticeMode(sc.noticeMode === "modal" ? "modal" : "banner");
            setNoticeRequiresAck(Boolean(sc.noticeRequiresAck));
            setNoticeActionLabel(sc.noticeActionLabel ?? "");
            setNoticeActionHref(sc.noticeActionHref ?? "");
            setNoticeAction(sc.noticeAction ?? "dismiss");
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
            const trimmedNotice = notice.trim();
            const sc: SyncConfig = {
                ...syncConfig,
                notice: trimmedNotice || undefined,
                noticeMode: trimmedNotice ? noticeMode : undefined,
                noticeRequiresAck:
                    trimmedNotice && noticeMode === "modal"
                        ? noticeRequiresAck
                        : undefined,
                noticeActionLabel:
                    trimmedNotice && noticeActionLabel.trim()
                        ? noticeActionLabel.trim()
                        : undefined,
                noticeActionHref:
                    trimmedNotice && noticeActionHref.trim()
                        ? noticeActionHref.trim()
                        : undefined,
                noticeAction:
                    trimmedNotice && noticeAction !== "dismiss"
                        ? noticeAction
                        : undefined,
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
        setNoticeMode("banner");
        setNoticeRequiresAck(false);
        setNoticeActionLabel("");
        setNoticeActionHref("");
        setNoticeAction("dismiss");
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
                <Flex vertical gap={token.marginSM}>
                    <Paragraph type="secondary" style={{ margin: 0 }}>
                        Shown to every signed-in user until they
                        acknowledge it. Use the broadcast page instead
                        when you need to force a build update.
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

                    <Flex vertical gap={token.marginXXS}>
                        <Text strong>How should it appear?</Text>
                        <Radio.Group
                            value={noticeMode}
                            onChange={(e) => setNoticeMode(e.target.value)}
                            optionType="button"
                            options={[
                                { value: "banner", label: "Slim banner" },
                                { value: "modal", label: "Popover dialog" },
                            ]}
                        />
                        <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                        >
                            Banner sits above the app bar and can be
                            dismissed with an X. Popover blocks the page
                            until the user clicks the action button.
                        </Text>
                    </Flex>

                    <Flex vertical gap={token.marginXXS}>
                        <Text strong>What should the action button do?</Text>
                        <Select
                            value={noticeAction}
                            onChange={(v) => setNoticeAction(v)}
                            options={[
                                {
                                    value: "dismiss",
                                    label: "Just acknowledge (close)",
                                },
                                {
                                    value: "openLink",
                                    label: "Open a link in a new tab",
                                },
                                {
                                    value: "refresh",
                                    label: "Refresh the app",
                                },
                                {
                                    value: "saveRefresh",
                                    label:
                                        "Save current draft, then refresh",
                                },
                                {
                                    value: "syncMetadata",
                                    label: "Sync metadata",
                                },
                                {
                                    value: "syncData",
                                    label: "Sync data (pull changes)",
                                },
                                {
                                    value: "syncAll",
                                    label:
                                        "Run all safely (save · metadata · pull · push)",
                                },
                            ]}
                            style={{ minWidth: 320 }}
                        />
                        <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                        >
                            "Run all safely" attempts a draft save first
                            and runs each step in order. Each sync step
                            is recorded as a Manual run in the sync
                            telemetry.
                        </Text>
                    </Flex>

                    <Row gutter={[token.marginSM, token.marginSM]}>
                        <Col xs={24} md={12}>
                            <Flex vertical gap={token.marginXXS}>
                                <Text type="secondary">
                                    Action button label
                                </Text>
                                <Input
                                    value={noticeActionLabel}
                                    placeholder="Default for this action"
                                    onChange={(e) =>
                                        setNoticeActionLabel(e.target.value)
                                    }
                                    maxLength={40}
                                />
                                <Text
                                    type="secondary"
                                    style={{ fontSize: token.fontSizeSM }}
                                >
                                    Defaults to a sensible label per
                                    action (e.g. "Refresh app").
                                </Text>
                            </Flex>
                        </Col>
                        {noticeAction === "openLink" && (
                            <Col xs={24} md={12}>
                                <Flex vertical gap={token.marginXXS}>
                                    <Text type="secondary">URL to open</Text>
                                    <Input
                                        value={noticeActionHref}
                                        placeholder="https://…"
                                        onChange={(e) =>
                                            setNoticeActionHref(e.target.value)
                                        }
                                        allowClear
                                    />
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: token.fontSizeSM }}
                                    >
                                        Opens in a new tab. The click
                                        still counts as acknowledgement.
                                    </Text>
                                </Flex>
                            </Col>
                        )}
                    </Row>

                    {noticeMode === "modal" && (
                        <Flex
                            align="center"
                            justify="space-between"
                            gap={token.marginSM}
                        >
                            <Flex vertical gap={token.marginXXS}>
                                <Text strong>Block the page until acknowledged</Text>
                                <Text
                                    type="secondary"
                                    style={{ fontSize: token.fontSizeSM }}
                                >
                                    No close X, the backdrop is locked,
                                    and the Esc key is ignored. The
                                    action button is the only way out.
                                </Text>
                            </Flex>
                            <Switch
                                checked={noticeRequiresAck}
                                onChange={setNoticeRequiresAck}
                            />
                        </Flex>
                    )}

                    {noticeMode === "modal" && noticeRequiresAck && (
                        <Alert
                            type="warning"
                            showIcon
                            message="Hard-stop modal"
                            description="The user can't capture data or navigate until they click the action button. Reserve this for compliance-grade notices."
                        />
                    )}
                </Flex>
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
