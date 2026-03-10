import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import { Button, Modal, Space, Typography } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useLiveQuery } from "dexie-react-hooks";
import React, { useCallback, useEffect, useState } from "react";
import { db } from "../db";
import { MetadataSync } from "../db/metadata-sync";
import { useMetadataSync } from "../hooks/useMetadataSync";
import MetadataProgress from "./metdata-progress";

dayjs.extend(relativeTime);

const { Text } = Typography;

interface MetadataSyncProps {
    metadataSync: MetadataSync;
    autoSync?: boolean; // Enable automatic sync when metadata is stale
    checkInterval?: number; // Check interval in minutes (default: 60)
}

export default function MetadataSyncComponent({
    metadataSync,
    autoSync = true,
    checkInterval = 60,
}: MetadataSyncProps) {
    const {
        state,
        syncChangedMetadata,
        checkForUpdates,
        forceFullSync,
        isSyncing,
        isChecking,
        hasError,
        isStale,
    } = useMetadataSync(metadataSync);
    const [showProgressModal, setShowProgressModal] = useState(false);

    // Get last sync time from Dexie using useLiveQuery
    const lastSyncFromDb = useLiveQuery(async () => {
        // Try to get from sync progress first
        const progress = await db.metadataSyncProgress.get(
            "metadata-sync-progress",
        );
        if (progress?.lastSync) {
            return progress.lastSync;
        }

        // Fallback to metadata versions table
        const version = await db.metadataVersions.get("metadata-version");
        return version?.lastSync;
    }, []);

    // Auto-sync when metadata becomes stale
    const checkAndSync = useCallback(async () => {
        try {
            console.log(
                "🔍 Checking metadata staleness...",
                `isSyncing: ${isSyncing}, isChecking: ${isChecking}`,
            );
            const stale = await isStale();
            console.log(`📊 Metadata stale: ${stale}`);

            if (stale && !isSyncing && !isChecking) {
                console.log("🔄 Metadata is stale, auto-syncing...");
                await syncChangedMetadata();
                console.log("✅ Auto-sync completed");
            } else if (!stale) {
                console.log("✅ Metadata is fresh, no sync needed");
            } else {
                console.log("⏸️ Sync skipped (already syncing or checking)");
            }
        } catch (error) {
            console.error("Auto-sync check failed:", error);
        }
    }, [isStale, isSyncing, isChecking, syncChangedMetadata]);

    useEffect(() => {
        if (!autoSync) {
            console.log("⏸️ Auto-sync disabled");
            return;
        }

        console.log(
            `🚀 Auto-sync enabled - checking every ${checkInterval} minutes`,
        );

        // Check on mount
        checkAndSync();

        const intervalMs = checkInterval * 60 * 1000; // Convert minutes to milliseconds
        const interval = setInterval(() => {
            console.log("⏰ Periodic auto-sync check triggered");
            checkAndSync();
        }, intervalMs);

        return () => {
            console.log("🛑 Auto-sync cleanup");
            clearInterval(interval);
        };
    }, [autoSync, checkInterval, checkAndSync]);

    const handleSync = async () => {
        try {
            setShowProgressModal(true);
            await syncChangedMetadata();
        } catch (error) {
            console.error("Metadata sync failed:", error);
        } finally {
            setShowProgressModal(false);
        }
    };

    const handleCheckUpdates = async () => {
        try {
            const updateInfo = await checkForUpdates();
            if (updateInfo.hasUpdates) {
                Modal.confirm({
                    title: "Metadata Updates Available",
                    content: `Changes detected in: ${updateInfo.changedTypes.join(", ")}. Would you like to sync now?`,
                    onOk: handleSync,
                    okText: "Sync Now",
                    cancelText: "Later",
                });
            } else {
                Modal.success({
                    title: "Metadata Up to Date",
                    content: `Last synced: ${dayjs(lastSyncFromDb).fromNow()}`,
                });
            }
        } catch (error) {
            console.error("Failed to check for updates:", error);
            Modal.error({
                title: "Check Failed",
                content:
                    "Failed to check for metadata updates. Please try again.",
            });
        }
    };

    const getStatusIcon = () => {
        if (hasError) {
            return <ExclamationCircleOutlined style={{ color: "#ff4d4f" }} />;
        }
        if (isSyncing || isChecking) {
            return <ReloadOutlined spin style={{ color: "#1890ff" }} />;
        }
        return <CheckCircleOutlined style={{ color: "#52c41a" }} />;
    };

    const getStatusText = () => {
        if (hasError) {
            return "Sync Error";
        }
        if (isSyncing) {
            return "Syncing...";
        }
        if (isChecking) {
            return "Checking...";
        }
        if (lastSyncFromDb) {
            return `Synced ${dayjs(lastSyncFromDb).fromNow()}`;
        }
        return "Not synced";
    };

    return (
        <>
            <Space>
                <Button
                    type="text"
                    icon={getStatusIcon()}
                    onClick={handleCheckUpdates}
                    loading={isChecking}
                    disabled={isSyncing}
                    size="small"
                >
                    <Space size={4}>
                        <ClockCircleOutlined />
                        <Text style={{ fontSize: 12 }}>{getStatusText()}</Text>
                    </Space>
                </Button>
                <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    onClick={() => forceFullSync()}
                    loading={isSyncing}
                    size="small"
                >
                    Sync Metadata
                </Button>
            </Space>

            <Modal
                open={showProgressModal}
                footer={null}
                closable={false}
                centered
            >
                <MetadataProgress height="100%" />
            </Modal>
        </>
    );
}
