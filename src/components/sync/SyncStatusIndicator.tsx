import { Badge, Popover, Space, Spin, Typography } from "antd";
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    SyncOutlined,
    WarningOutlined,
} from "@ant-design/icons";
import React, { useEffect, useState } from "react";
import { syncMonitor } from "../../db/sync-monitor";
import type { SyncHealth } from "../../db/sync-monitor";

const { Text } = Typography;

export interface SyncStatusIndicatorProps {
    showDetails?: boolean;
    refreshInterval?: number; // milliseconds
}

/**
 * Sync Status Indicator Component
 *
 * Displays real-time sync health status with a visual indicator and detailed popover.
 */
export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
    showDetails = true,
    refreshInterval = 30000, // 30 seconds
}) => {
    const [health, setHealth] = useState<SyncHealth | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Initial load
        loadHealth();

        // Periodic refresh
        const interval = setInterval(loadHealth, refreshInterval);

        return () => clearInterval(interval);
    }, [refreshInterval]);

    const loadHealth = async () => {
        try {
            const newHealth = await syncMonitor.getHealth();
            setHealth(newHealth);
            setLoading(false);
        } catch (error) {
            setLoading(false);
        }
    };

    if (loading || !health) {
        return <Spin size="small" />;
    }

    const { status, metrics, issues, recommendations } = health;

    // Determine badge properties based on health status
    const getBadgeProps = () => {
        switch (status) {
            case "healthy":
                return {
                    status: "success" as const,
                    icon: <CheckCircleOutlined />,
                    text: "Sync: Healthy",
                    color: "#52c41a",
                };
            case "degraded":
                return {
                    status: "warning" as const,
                    icon: <WarningOutlined />,
                    text: "Sync: Degraded",
                    color: "#faad14",
                };
            case "critical":
                return {
                    status: "error" as const,
                    icon: <ExclamationCircleOutlined />,
                    text: "Sync: Critical",
                    color: "#ff4d4f",
                };
            default:
                return {
                    status: "default" as const,
                    icon: <ClockCircleOutlined />,
                    text: "Sync: Unknown",
                    color: "#d9d9d9",
                };
        }
    };

    const badgeProps = getBadgeProps();

    const content = (
        <div style={{ maxWidth: 300 }}>
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
                {/* Status */}
                <Text strong style={{ color: badgeProps.color }}>
                    {badgeProps.text}
                </Text>

                {/* Metrics */}
                <div>
                    <Text type="secondary">Pending: </Text>
                    <Text>{metrics.pendingCount}</Text>
                </div>
                <div>
                    <Text type="secondary">Failed: </Text>
                    <Text>{metrics.failedCount}</Text>
                </div>
                <div>
                    <Text type="secondary">Success Rate: </Text>
                    <Text>{metrics.successRate.toFixed(1)}%</Text>
                </div>
                {metrics.lastSyncAt && (
                    <div>
                        <Text type="secondary">Last Sync: </Text>
                        <Text>
                            {new Date(metrics.lastSyncAt).toLocaleTimeString()}
                        </Text>
                    </div>
                )}

                {/* Issues */}
                {issues.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                        <Text strong>Issues:</Text>
                        <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                            {issues.map((issue, index) => (
                                <li key={index}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {issue}
                                    </Text>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Recommendations */}
                {recommendations.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                        <Text strong>Recommendations:</Text>
                        <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                            {recommendations.map((rec, index) => (
                                <li key={index}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {rec}
                                    </Text>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </Space>
        </div>
    );

    return (
        <Popover
            content={showDetails ? content : null}
            title="Sync Health"
            trigger="hover"
        >
            <Badge status={badgeProps.status} text={badgeProps.text} />
        </Popover>
    );
};
