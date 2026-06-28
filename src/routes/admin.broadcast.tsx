import {
    NotificationOutlined,
    ReloadOutlined,
    SaveOutlined,
    StopOutlined,
} from "@ant-design/icons";
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
    Flex,
    Input,
    Popconfirm,
    Radio,
    Space,
    Tag,
    theme,
    Typography,
} from "antd";
import dayjs from "dayjs";
import React, { useEffect, useState } from "react";
import { adminConfig, BroadcastConfig, NAMESPACE } from "../sync/adminConfig";
import { refreshAdminConfig } from "../sync/adminConfigCache";
import { BUILD_HASH, BUILD_TIME, APP_VERSION } from "../version";
import { AdminRoute } from "./admin";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

export const AdminBroadcastRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "broadcast",
    component: AdminBroadcast,
});

function AdminBroadcast() {
    const { token } = theme.useToken();
    const engine = useDataEngine();
    const { message, modal } = App.useApp();
    const userInfo = useCurrentUserInfo() as
        | { username?: string; name?: string }
        | undefined;

    const [current, setCurrent] = useState<BroadcastConfig | undefined>(
        undefined,
    );
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [revoking, setRevoking] = useState(false);

    const [buildHash, setBuildHash] = useState(BUILD_HASH);
    const [severity, setSeverity] = useState<"info" | "forced">("info");
    const [noteMsg, setNoteMsg] = useState("");

    const load = async () => {
        setLoading(true);
        try {
            const b = await adminConfig.getBroadcast(engine);
            setCurrent(b ?? undefined);
            if (b) {
                setBuildHash(b.buildHash);
                setSeverity(b.severity);
                setNoteMsg(b.message ?? "");
            }
        } catch (err) {
            message.error(
                err instanceof Error
                    ? err.message
                    : "Failed to read broadcast key.",
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const publish = async () => {
        if (!buildHash.trim()) {
            message.warning("Build hash is required.");
            return;
        }
        if (buildHash.trim() === BUILD_HASH) {
            const ok = await new Promise<boolean>((resolve) => {
                modal.confirm({
                    title: "Build hash matches this device",
                    content:
                        "The broadcast will be ignored by clients already on this build. Publish anyway?",
                    okText: "Publish",
                    cancelText: "Cancel",
                    onOk: () => resolve(true),
                    onCancel: () => resolve(false),
                });
            });
            if (!ok) return;
        }
        setSaving(true);
        try {
            const broadcast: BroadcastConfig = {
                buildHash: buildHash.trim(),
                severity,
                releasedAt: new Date().toISOString(),
                releasedBy: userInfo?.username ?? userInfo?.name,
                message: noteMsg.trim() || undefined,
            };
            await adminConfig.setBroadcast(engine, broadcast);
            await refreshAdminConfig(engine);
            setCurrent(broadcast);
            message.success(
                severity === "forced"
                    ? "Forced update broadcast — clients will reload within 5 minutes."
                    : "Notice broadcast — clients will be notified within 5 minutes.",
            );
        } catch (err) {
            message.error(
                err instanceof Error
                    ? err.message
                    : "Publish failed — check dataStore write permission.",
            );
        } finally {
            setSaving(false);
        }
    };

    const revoke = async () => {
        setRevoking(true);
        try {
            // Overwrite with an entry matching the current build so no
            // client triggers a refresh. We can't truly "delete" without
            // an explicit delete mutation, and writing the same hash is
            // a safer no-op that keeps the audit trail.
            const broadcast: BroadcastConfig = {
                buildHash: BUILD_HASH,
                severity: "info",
                releasedAt: new Date().toISOString(),
                releasedBy: userInfo?.username ?? userInfo?.name,
                message: "Broadcast revoked.",
            };
            await adminConfig.setBroadcast(engine, broadcast);
            await refreshAdminConfig(engine);
            setCurrent(broadcast);
            setNoteMsg("");
            setSeverity("info");
            message.success("Broadcast revoked.");
        } catch (err) {
            message.error(
                err instanceof Error
                    ? err.message
                    : "Revoke failed — check dataStore write permission.",
            );
        } finally {
            setRevoking(false);
        }
    };

    const currentIsActive =
        current?.buildHash && current.buildHash !== BUILD_HASH;

    return (
        <Flex vertical gap={token.marginSM}>
            <Flex
                align="center"
                justify="space-between"
                gap={token.marginSM}
                wrap
            >
                <Flex vertical gap={token.marginXXS}>
                    <Title level={5} style={{ margin: 0 }}>
                        App update broadcast
                    </Title>
                    <Text type="secondary">
                        Force every open browser session to refresh to the
                        latest build. Sessions auto-save drafts before
                        reload when severity is <Text code>forced</Text>.
                    </Text>
                </Flex>
                <Button
                    icon={<ReloadOutlined />}
                    onClick={load}
                    loading={loading}
                >
                    Refresh
                </Button>
            </Flex>

            <Card size="small">
                <Flex vertical gap={token.marginXS}>
                    <Text type="secondary">This device is on</Text>
                    <Flex gap={token.marginXS} wrap align="center">
                        <Tag color="blue">v{APP_VERSION}</Tag>
                        <Text code>{BUILD_HASH}</Text>
                        <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                        >
                            built {dayjs(BUILD_TIME).format("MMM D HH:mm")}
                        </Text>
                    </Flex>
                </Flex>
            </Card>

            <Card size="small" title="Current broadcast">
                {!current ? (
                    <Text type="secondary">
                        No broadcast set. Clients only check{" "}
                        <Text code>version.json</Text> for updates.
                    </Text>
                ) : (
                    <Flex vertical gap={token.marginXS}>
                        <Flex gap={token.marginXS} align="center" wrap>
                            <Tag
                                color={
                                    currentIsActive
                                        ? current.severity === "forced"
                                            ? "red"
                                            : "blue"
                                        : "default"
                                }
                            >
                                {currentIsActive
                                    ? current.severity === "forced"
                                        ? "Forced reload"
                                        : "Notify only"
                                    : "Revoked / matches this build"}
                            </Tag>
                            <Text code>{current.buildHash}</Text>
                            <Text
                                type="secondary"
                                style={{ fontSize: token.fontSizeSM }}
                            >
                                {dayjs(current.releasedAt).format(
                                    "MMM D HH:mm",
                                )}{" "}
                                · {current.releasedBy ?? "unknown"}
                            </Text>
                        </Flex>
                        {current.message && (
                            <Paragraph
                                style={{
                                    margin: 0,
                                    color: token.colorTextSecondary,
                                }}
                            >
                                {current.message}
                            </Paragraph>
                        )}
                        {currentIsActive && (
                            <Popconfirm
                                title="Revoke the active broadcast?"
                                description="Clients that have not yet refreshed will stop reloading."
                                onConfirm={revoke}
                                okText="Revoke"
                            >
                                <Button
                                    icon={<StopOutlined />}
                                    danger
                                    loading={revoking}
                                    style={{ alignSelf: "flex-start" }}
                                >
                                    Revoke broadcast
                                </Button>
                            </Popconfirm>
                        )}
                    </Flex>
                )}
            </Card>

            <Card size="small" title="Publish new broadcast">
                <Flex vertical gap={token.marginSM}>
                    <Flex vertical gap={token.marginXXS}>
                        <Text type="secondary">
                            Target build hash (the build clients must
                            upgrade to)
                        </Text>
                        <Input
                            value={buildHash}
                            onChange={(e) => setBuildHash(e.target.value)}
                            placeholder={BUILD_HASH}
                            style={{ fontFamily: "monospace" }}
                            allowClear
                        />
                        <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                        >
                            Defaults to this device's build. Change only
                            if you've already deployed the new bundle to
                            the DHIS2 instance.
                        </Text>
                    </Flex>

                    <Flex vertical gap={token.marginXXS}>
                        <Text type="secondary">Severity</Text>
                        <Radio.Group
                            value={severity}
                            onChange={(e) => setSeverity(e.target.value)}
                        >
                            <Space direction="vertical">
                                <Radio value="info">
                                    <Text strong>Notify only</Text>{" "}
                                    <Text type="secondary">
                                        — Defers reload if user has
                                        unsaved form data.
                                    </Text>
                                </Radio>
                                <Radio value="forced">
                                    <Text strong>Forced reload</Text>{" "}
                                    <Text type="secondary">
                                        — Auto-saves drafts and reloads
                                        every session, even when busy.
                                    </Text>
                                </Radio>
                            </Space>
                        </Radio.Group>
                    </Flex>

                    <Flex vertical gap={token.marginXXS}>
                        <Text type="secondary">Message (optional)</Text>
                        <TextArea
                            rows={3}
                            value={noteMsg}
                            onChange={(e) => setNoteMsg(e.target.value)}
                            placeholder="e.g. Urgent fix for visit save failure — please refresh."
                            maxLength={500}
                            showCount
                        />
                    </Flex>

                    {severity === "forced" && (
                        <Alert
                            type="warning"
                            showIcon
                            message="Forced reload affects every open session"
                            description="The app attempts to save drafts before reload, but anything not yet typed into a field will be lost. Use only for urgent fixes."
                        />
                    )}

                    <Flex gap={token.marginXS} wrap>
                        <Popconfirm
                            title={
                                severity === "forced"
                                    ? "Force every session to reload?"
                                    : "Publish update notice to every session?"
                            }
                            description={
                                severity === "forced"
                                    ? "Clients will reload within 5 minutes. Drafts auto-save first."
                                    : "Clients will see a banner and can refresh on their own."
                            }
                            onConfirm={publish}
                            okText="Publish"
                        >
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                loading={saving}
                            >
                                Publish broadcast
                            </Button>
                        </Popconfirm>
                    </Flex>
                </Flex>
            </Card>

            <Alert
                type="info"
                showIcon
                icon={<NotificationOutlined />}
                message="How clients discover broadcasts"
                description={
                    <>
                        Every client polls{" "}
                        <Text code>dataStore/{NAMESPACE}/broadcast</Text>{" "}
                        every 5 minutes. When the broadcast's build hash
                        differs from the bundle the client booted with, a
                        safe-refresh flow runs immediately.
                    </>
                }
            />
        </Flex>
    );
}
