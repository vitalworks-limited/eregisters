import React from "react";
import { Badge, Tooltip, Space, Typography } from "antd";
import {
    CloudOutlined,
    CloudSyncOutlined,
    DisconnectOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
} from "@ant-design/icons";
import { useLiveQuery } from "dexie-react-hooks";
import type { createSyncManager, SyncManagerState } from "../db/sync";
import { db } from "../db";

const { Text } = Typography;

/**
 * SyncStatus Component
 *
 * Displays real-time sync status with visual indicators:
 * - Online/Offline status
 * - Pending sync count
 * - Last sync timestamp
 * - Active sync indicator
 */
export const SyncStatus: React.FC<{
    syncManager: ReturnType<typeof createSyncManager>;
}> = ({ syncManager }) => {
    // Use Dexie's useLiveQuery to reactively watch sync state changes
    const syncStateFromDb = useLiveQuery(() => db.syncState.get("current"));

    // Fallback state for initial render or if DB state not yet initialized
    const syncState: SyncManagerState = syncStateFromDb
        ? {
              status: syncStateFromDb.status,
              pendingCount: syncStateFromDb.pendingCount,
              lastSyncAt: syncStateFromDb.lastSyncAt,
              error: syncStateFromDb.lastError,
          }
        : {
              status: "idle",
              pendingCount: 0,
          };

    /**
     * Render status icon based on current state
     */
    const renderIcon = () => {
        switch (syncState.status) {
            case "offline":
                return <DisconnectOutlined style={{ color: "#ff4d4f" }} />;
            case "syncing":
                return <CloudSyncOutlined spin style={{ color: "#1890ff" }} />;
            case "online":
                return syncState.pendingCount > 0 ? (
                    <ClockCircleOutlined style={{ color: "#faad14" }} />
                ) : (
                    <CheckCircleOutlined style={{ color: "#52c41a" }} />
                );
            default:
                return <CloudOutlined style={{ color: "#8c8c8c" }} />;
        }
    };

    /**
     * Render status text
     */
    const renderText = () => {
        if (syncState.status === "offline") {
            return "Offline";
        }

        if (syncState.status === "syncing") {
            return "Syncing...";
        }

        if (syncState.pendingCount > 0) {
            return `${syncState.pendingCount} pending`;
        }

        return "Synced";
    };

    /**
     * Render badge status
     */
    const renderBadgeStatus = ():
        | "success"
        | "processing"
        | "error"
        | "warning"
        | "default" => {
        switch (syncState.status) {
            case "offline":
                return "error";
            case "syncing":
                return "processing";
            case "online":
                return syncState.pendingCount > 0 ? "warning" : "success";
            default:
                return "default";
        }
    };

    /**
     * Render tooltip content with detailed info
     */
    const renderTooltip = () => {
        const getConnectionType = () => {
            const connection =
                (navigator as any).connection ||
                (navigator as any).mozConnection ||
                (navigator as any).webkitConnection;
            if (connection) {
                return connection.effectiveType || connection.type || "Unknown";
            }
            return "Unknown";
        };

        const isOnline = navigator.onLine;
        const connectionType = getConnectionType();

        return (
            <div>
                <div>
                    <strong>Network:</strong> {isOnline ? "Online" : "Offline"}
                    {isOnline &&
                        connectionType !== "Unknown" &&
                        ` (${connectionType.toUpperCase()})`}
                </div>
                <div>
                    <strong>Sync Status:</strong> {syncState.status}
                </div>
                {syncState.pendingCount > 0 && (
                    <div>
                        <strong>Pending:</strong> {syncState.pendingCount}{" "}
                        operation(s)
                    </div>
                )}
                {syncState.lastSyncAt && (
                    <div>
                        <strong>Last sync:</strong>{" "}
                        {new Date(syncState.lastSyncAt).toLocaleTimeString()}
                    </div>
                )}
                <div style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>
                    {syncState.status === "offline"
                        ? "Changes will sync when you're back online"
                        : syncState.status === "syncing"
                          ? "Syncing your changes to the server"
                          : syncState.pendingCount > 0
                            ? "Waiting to sync pending changes"
                            : "All changes synced"}
                </div>
                {!isOnline && (
                    <div
                        style={{ marginTop: 8, fontSize: 11, color: "#faad14" }}
                    >
                        ⚠️ Working in offline mode
                    </div>
                )}
            </div>
        );
    };

    return (
        <Tooltip title={renderTooltip()}>
            <Badge
                status={renderBadgeStatus()}
                dot={syncState.pendingCount > 0}
            >
                <Space size="small" style={{ cursor: "pointer" }}>
                    {renderIcon()}
                    <Text
                        style={{
                            fontSize: 12,
                            color:
                                syncState.status === "offline"
                                    ? "#ff4d4f"
                                    : syncState.status === "syncing"
                                      ? "#1890ff"
                                      : syncState.pendingCount > 0
                                        ? "#faad14"
                                        : "#52c41a",
                        }}
                    >
                        {renderText()}
                    </Text>
                </Space>
            </Badge>
        </Tooltip>
    );
};
