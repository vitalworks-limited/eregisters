import {
    ArrowDownOutlined,
    ArrowUpOutlined,
    MinusOutlined,
    QuestionCircleOutlined,
} from "@ant-design/icons";
import { Flex, theme, Tooltip, Typography } from "antd";
import React from "react";
import { HealthStatus, SummaryMetric } from "./summaryTypes";

const { Text } = Typography;

function statusColor(s: HealthStatus, token: ReturnType<typeof theme.useToken>["token"]): string {
    switch (s) {
        case "healthy":
            return token.colorSuccess;
        case "watch":
            return token.colorWarning;
        case "degraded":
            return token.colorWarningActive;
        case "critical":
            return token.colorError;
        default:
            return token.colorTextTertiary;
    }
}

function statusLabel(s: HealthStatus): string {
    switch (s) {
        case "healthy":
            return "Healthy";
        case "watch":
            return "Watch";
        case "degraded":
            return "Degraded";
        case "critical":
            return "Critical";
        default:
            return "No data";
    }
}

function trendIcon(t: SummaryMetric["trend"]): React.ReactNode {
    if (t === "up") return <ArrowUpOutlined />;
    if (t === "down") return <ArrowDownOutlined />;
    if (t === "flat") return <MinusOutlined />;
    return null;
}

function formatValue(metric: SummaryMetric): string {
    if (metric.value === null || metric.value === undefined) return "—";
    if (typeof metric.value === "number") {
        const formatted = metric.value.toLocaleString();
        return metric.unit ? `${formatted} ${metric.unit}` : formatted;
    }
    return String(metric.value);
}

export const AdminSummaryCard: React.FC<{
    metric: SummaryMetric;
    onClick?: () => void;
}> = ({ metric, onClick }) => {
    const { token } = theme.useToken();
    const color = statusColor(metric.status, token);

    return (
        <Flex
            vertical
            gap={token.marginXXS}
            onClick={onClick}
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderLeft: `3px solid ${color}`,
                padding: token.padding,
                cursor: onClick ? "pointer" : "default",
                height: "100%",
            }}
        >
            <Flex align="center" justify="space-between" gap={token.marginXS}>
                <Text
                    type="secondary"
                    style={{
                        fontSize: token.fontSizeSM,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                    }}
                >
                    {metric.label}
                </Text>
                {metric.helpText && (
                    <Tooltip title={metric.helpText}>
                        <QuestionCircleOutlined
                            style={{ color: token.colorTextTertiary }}
                        />
                    </Tooltip>
                )}
            </Flex>
            <Flex align="baseline" gap={token.marginXS}>
                <Text
                    strong
                    style={{
                        fontSize: 26,
                        lineHeight: 1.1,
                        color,
                    }}
                >
                    {formatValue(metric)}
                </Text>
                {metric.trend && trendIcon(metric.trend) && (
                    <Text
                        type="secondary"
                        style={{ fontSize: token.fontSizeSM }}
                    >
                        {trendIcon(metric.trend)}
                    </Text>
                )}
            </Flex>
            <Flex align="center" justify="space-between" gap={token.marginXS}>
                <Text
                    style={{
                        color,
                        fontSize: token.fontSizeSM,
                        fontWeight: 500,
                    }}
                >
                    {statusLabel(metric.status)}
                </Text>
                <Text
                    type="secondary"
                    style={{ fontSize: token.fontSizeSM }}
                >
                    {metric.source}
                </Text>
            </Flex>
        </Flex>
    );
};
