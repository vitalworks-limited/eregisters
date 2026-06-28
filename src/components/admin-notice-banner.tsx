import {
    CloseOutlined,
    CloudDownloadOutlined,
    CloudUploadOutlined,
    ExportOutlined,
    LoadingOutlined,
    NotificationOutlined,
    ReloadOutlined,
    SaveOutlined,
    ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Flex, Modal, theme, Typography } from "antd";
import React, { useEffect, useMemo, useState } from "react";
import { SyncConfig } from "../sync/adminConfig";
import {
    getCachedAdminConfig,
    subscribeAdminConfig,
} from "../sync/adminConfigCache";
import { markNextSyncManual } from "../sync/telemetry";
import { SyncContext } from "../machines/sync";

const { Text, Paragraph } = Typography;

const DISMISS_KEY = "eregisters.noticeDismissedHash";

type ActionKind =
    | "dismiss"
    | "openLink"
    | "refresh"
    | "saveRefresh"
    | "syncMetadata"
    | "syncData"
    | "syncAll";

function hash(value: string): string {
    let h = 0;
    for (let i = 0; i < value.length; i += 1) {
        h = (h << 5) - h + value.charCodeAt(i);
        h |= 0;
    }
    return String(h);
}

interface NoticeView {
    text: string;
    mode: "banner" | "modal";
    requiresAck: boolean;
    actionLabel: string;
    actionKind: ActionKind;
    actionHref?: string;
}

const DEFAULT_LABELS: Record<ActionKind, string> = {
    dismiss: "OK",
    openLink: "Open",
    refresh: "Refresh app",
    saveRefresh: "Save and refresh",
    syncMetadata: "Sync metadata",
    syncData: "Sync data",
    syncAll: "Run all sync steps",
};

function actionIcon(kind: ActionKind): React.ReactNode {
    switch (kind) {
        case "openLink":
            return <ExportOutlined />;
        case "refresh":
            return <ReloadOutlined />;
        case "saveRefresh":
            return <SaveOutlined />;
        case "syncMetadata":
            return <ThunderboltOutlined />;
        case "syncData":
            return <CloudDownloadOutlined />;
        case "syncAll":
            return <CloudUploadOutlined />;
        default:
            return undefined;
    }
}

function asView(sc: SyncConfig): NoticeView | null {
    const trimmed = sc.notice?.trim();
    if (!trimmed) return null;
    const kind: ActionKind = sc.noticeAction ?? "dismiss";
    return {
        text: trimmed,
        mode: sc.noticeMode === "modal" ? "modal" : "banner",
        requiresAck: Boolean(sc.noticeRequiresAck),
        actionLabel:
            sc.noticeActionLabel?.trim() || DEFAULT_LABELS[kind] || "OK",
        actionKind: kind,
        actionHref: sc.noticeActionHref?.trim() || undefined,
    };
}

async function trySaveDraft(): Promise<boolean> {
    if (typeof window === "undefined") return true;
    const fn = (window as unknown as {
        __eregistersSaveDraft?: () => boolean | Promise<boolean>;
    }).__eregistersSaveDraft;
    if (typeof fn !== "function") return true;
    try {
        return Boolean(await fn());
    } catch {
        return false;
    }
}

/**
 * Renders the admin-set notice as either a slim dismissible banner or a
 * blocking-style modal. The action button can be configured to run a
 * safe in-app operation (refresh, save+refresh, sync metadata/data, or
 * all of them) instead of just dismissing. Per-content dismiss is
 * persisted to localStorage so the same notice doesn't re-fire on every
 * page navigation.
 */
export const AdminNoticeBanner: React.FC = () => {
    const { token } = theme.useToken();
    const syncActor = SyncContext.useActorRef();
    const [view, setView] = useState<NoticeView | null>(() =>
        asView(getCachedAdminConfig().syncConfig),
    );
    const [dismissedHash, setDismissedHash] = useState<string | null>(() => {
        try {
            return window.localStorage.getItem(DISMISS_KEY);
        } catch {
            return null;
        }
    });
    const [running, setRunning] = useState(false);

    useEffect(() => {
        return subscribeAdminConfig((snap) => {
            setView(asView(snap.syncConfig));
        });
    }, []);

    const currentHash = useMemo(
        () => (view ? hash(`${view.mode}:${view.text}`) : null),
        [view],
    );

    if (!view || !currentHash) return null;
    if (currentHash === dismissedHash) return null;

    const persistAck = () => {
        try {
            window.localStorage.setItem(DISMISS_KEY, currentHash);
        } catch {
            // ignore — fall back to per-session dismissal
        }
        setDismissedHash(currentHash);
    };

    const runAction = async () => {
        if (running) return;
        const kind = view.actionKind;

        if (kind === "openLink" && view.actionHref) {
            window.open(view.actionHref, "_blank", "noopener,noreferrer");
            persistAck();
            return;
        }

        if (kind === "dismiss") {
            persistAck();
            return;
        }

        setRunning(true);
        try {
            if (kind === "saveRefresh" || kind === "syncAll") {
                await trySaveDraft();
            }
            if (kind === "syncMetadata" || kind === "syncAll") {
                markNextSyncManual();
                syncActor.send({ type: "START_METADATA_SYNC" });
            }
            if (kind === "syncData" || kind === "syncAll") {
                markNextSyncManual();
                syncActor.send({ type: "START_DATA_SYNC" });
            }
            if (kind === "syncAll") {
                markNextSyncManual();
                syncActor.send({ type: "PUSH_DATA" });
            }
            persistAck();
            if (kind === "refresh" || kind === "saveRefresh") {
                // Defer slightly so the ack & any toast can render first.
                window.setTimeout(() => window.location.reload(), 250);
            }
        } finally {
            setRunning(false);
        }
    };

    if (view.mode === "modal") {
        return (
            <Modal
                open
                title={
                    <Flex align="center" gap={token.marginXS}>
                        <NotificationOutlined
                            style={{ color: token.colorInfo }}
                        />
                        <span>Notice</span>
                    </Flex>
                }
                closable={!view.requiresAck}
                maskClosable={!view.requiresAck}
                keyboard={!view.requiresAck}
                onCancel={persistAck}
                footer={
                    <Flex justify="flex-end" gap={token.marginXS}>
                        <Button
                            type="primary"
                            loading={running}
                            icon={
                                running ? (
                                    <LoadingOutlined />
                                ) : (
                                    actionIcon(view.actionKind)
                                )
                            }
                            onClick={runAction}
                        >
                            {view.actionLabel}
                        </Button>
                    </Flex>
                }
            >
                <Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                    {view.text}
                </Paragraph>
                {view.requiresAck && (
                    <Text
                        type="secondary"
                        style={{
                            display: "block",
                            marginTop: token.marginXS,
                            fontSize: token.fontSizeSM,
                        }}
                    >
                        You must acknowledge this notice before continuing.
                    </Text>
                )}
            </Modal>
        );
    }

    return (
        <Flex
            align="center"
            gap={token.marginXS}
            role="status"
            aria-live="polite"
            style={{
                background: `${token.colorInfo}14`,
                borderBottom: `1px solid ${token.colorInfo}40`,
                color: token.colorInfoText,
                paddingBlock: token.paddingXXS,
                paddingInline: token.padding,
                fontSize: token.fontSizeSM,
            }}
        >
            <NotificationOutlined style={{ color: token.colorInfo }} />
            <Text style={{ color: token.colorInfoText, flex: 1 }}>
                {view.text}
            </Text>
            {view.actionKind !== "dismiss" && (
                <Button
                    size="small"
                    type="link"
                    loading={running}
                    icon={actionIcon(view.actionKind)}
                    onClick={runAction}
                >
                    {view.actionLabel}
                </Button>
            )}
            <Button
                size="small"
                type="text"
                icon={<CloseOutlined />}
                onClick={persistAck}
                aria-label="Dismiss notice"
            />
        </Flex>
    );
};
