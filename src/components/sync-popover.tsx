import {
    CheckCircleOutlined,
    CloudDownloadOutlined,
    CloudUploadOutlined,
    DownloadOutlined,
    ExclamationCircleOutlined,
    ReloadOutlined,
    SyncOutlined,
} from "@ant-design/icons";
import {
    App,
    Button,
    Divider,
    Flex,
    Popover,
    theme,
    Typography,
} from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import React, { useState } from "react";

import { SyncContext } from "../machines/sync";
import {
    isDataPullLoading,
    isDataPushLoading,
    isMetadataSyncLoading,
} from "../machines/sync-metadata-mode";
import { downloadBackupBundle } from "../sync/exportBackup";

dayjs.extend(relativeTime);

const { Text } = Typography;

interface Props {
    pendingCount: number;
    compact?: boolean;
}

type PillTone = "success" | "info" | "warning" | "error";

function pickLatest(values: Array<string | number | undefined>): string | undefined {
    const filtered = values.filter(
        (v): v is string | number => v !== undefined && v !== null && v !== "",
    );
    if (!filtered.length) return undefined;
    return filtered
        .map((v) => dayjs(v))
        .sort((a, b) => a.valueOf() - b.valueOf())
        .pop()
        ?.toISOString();
}

export const SyncPopover: React.FC<Props> = ({ pendingCount, compact = false }) => {
    const { token } = theme.useToken();
    const syncActor = SyncContext.useActorRef();
    const { message } = App.useApp();
    const [exporting, setExporting] = useState(false);

    const handleExport = async () => {
        setExporting(true);
        try {
            const bundle = await downloadBackupBundle();
            const totalRecords =
                bundle.counts.trackedEntities +
                bundle.counts.enrollments +
                bundle.counts.events;
            message.success(`Backup saved · ${totalRecords} records`);
        } catch (err) {
            console.error("[sync-popover] export backup failed", err);
            message.error("Backup failed — see console for details.");
        } finally {
            setExporting(false);
        }
    };

    const syncingMetadata = SyncContext.useSelector((s) =>
        isMetadataSyncLoading(
            s.matches({ metadataSync: "syncing" }) ||
                s.matches({ metadataSync: "deletingMetadata" }) ||
                s.matches({ metadataSync: "savingMetadata" }),
            s.context.lastMetadataPull,
        ),
    );
    const syncingData = SyncContext.useSelector((s) =>
        isDataPullLoading(
            s.matches({ dataPull: "syncing" }),
            s.context.lastDataPull,
        ),
    );
    const pushingData = SyncContext.useSelector((s) =>
        isDataPushLoading(s.matches({ dataSync: "batchSync" })),
    );
    const metadataFailed = SyncContext.useSelector((s) =>
        s.matches({ metadataSync: "failure" }),
    );
    const lastDataPull = SyncContext.useSelector((s) => s.context.lastDataPull);
    const lastDataPush = SyncContext.useSelector((s) => s.context.lastDataPush);
    const lastMetadataPull = SyncContext.useSelector(
        (s) => s.context.lastMetadataPull,
    );

    const inProgress = syncingData || syncingMetadata || pushingData;

    let label: string;
    let icon: React.ReactNode;
    let tone: PillTone;
    if (inProgress) {
        label = "Syncing…";
        icon = <SyncOutlined spin />;
        tone = "info";
    } else if (metadataFailed) {
        label = "Sync failed";
        icon = <ExclamationCircleOutlined />;
        tone = "error";
    } else if (pendingCount > 0) {
        label = `Pending push · ${pendingCount}`;
        icon = <CloudUploadOutlined />;
        tone = "warning";
    } else {
        const latest = pickLatest([
            lastDataPull,
            lastDataPush,
            lastMetadataPull,
        ]);
        label = latest
            ? `Up to date · ${dayjs(latest).fromNow()}`
            : "Up to date";
        icon = <CheckCircleOutlined />;
        tone = "success";
    }

    const toneColor =
        tone === "success"
            ? token.colorSuccess
            : tone === "info"
              ? token.colorInfo
              : tone === "warning"
                ? token.colorWarning
                : token.colorError;

    const lastTimeText = (v?: string | number) =>
        v ? (
            <Text type="secondary" style={{ marginLeft: token.marginXS }}>
                · {dayjs(v).fromNow()}
            </Text>
        ) : null;

    const popoverContent = (
        <Flex vertical gap={token.marginSM} style={{ width: 280 }}>
            <Flex align="center" gap={token.marginXS}>
                <span style={{ color: toneColor, lineHeight: 0 }}>{icon}</span>
                <Text strong>{label}</Text>
            </Flex>
            <Divider style={{ margin: 0 }} />
            <Button
                icon={<CloudDownloadOutlined />}
                loading={syncingData}
                onClick={() => syncActor.send({ type: "START_DATA_SYNC" })}
                block
                style={{ justifyContent: "flex-start" }}
            >
                Pull changes
                {lastTimeText(lastDataPull)}
            </Button>
            <Button
                icon={<ReloadOutlined />}
                loading={syncingMetadata}
                onClick={() => syncActor.send({ type: "START_METADATA_SYNC" })}
                block
                style={{ justifyContent: "flex-start" }}
            >
                Sync metadata
                {lastTimeText(lastMetadataPull)}
            </Button>
            <Button
                icon={<CloudUploadOutlined />}
                loading={pushingData}
                onClick={() => syncActor.send({ type: "PUSH_DATA" })}
                type={pendingCount > 0 ? "primary" : "default"}
                block
                style={{ justifyContent: "flex-start" }}
            >
                Push data
                {pendingCount > 0 ? ` · ${pendingCount}` : ""}
                {lastTimeText(lastDataPush)}
            </Button>
            {metadataFailed && (
                <Button
                    danger
                    block
                    onClick={() =>
                        syncActor.send({ type: "FULL_METADATA_SYNC" })
                    }
                >
                    Retry metadata sync
                </Button>
            )}
            <Divider style={{ margin: 0 }} />
            <Button
                type="text"
                icon={<DownloadOutlined />}
                loading={exporting}
                onClick={handleExport}
                block
                style={{ justifyContent: "flex-start" }}
            >
                Download local backup
            </Button>
        </Flex>
    );

    return (
        <Popover
            content={popoverContent}
            placement="bottomRight"
            trigger="click"
            arrow={false}
        >
            <Button
                style={{
                    paddingInline: token.paddingSM,
                    borderColor: token.colorBorder,
                }}
                aria-label={`Sync: ${label}`}
            >
                <Flex align="center" gap={token.marginXS}>
                    <span style={{ color: toneColor, lineHeight: 0 }}>
                        {icon}
                    </span>
                    {!compact && <span>{label}</span>}
                    {compact && pendingCount > 0 && (
                        <span style={{ color: toneColor, fontWeight: 600 }}>
                            {pendingCount}
                        </span>
                    )}
                </Flex>
            </Button>
        </Popover>
    );
};
