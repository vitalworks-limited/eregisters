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

export type CardVariant = "hero" | "status" | "operational";

function statusColor(
    s: HealthStatus,
    token: ReturnType<typeof theme.useToken>["token"],
): string {
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
    /** Optional icon shown in a tinted square in the top-left. */
    icon?: React.ReactNode;
    variant?: CardVariant;
}> = ({ metric, onClick, icon, variant = "operational" }) => {
    const { token } = theme.useToken();
    const color = statusColor(metric.status, token);
    const isHero = variant === "hero";
    const isStatus = variant === "status";

    const valueSize = isHero ? 30 : isStatus ? 24 : 22;
    const padding = isHero ? token.paddingLG : token.padding;

    const accent = isHero ? token.colorPrimary : color;
    const tint = isHero
        ? `linear-gradient(135deg, ${token.colorPrimary}0F 0%, ${token.colorPrimary}05 100%)`
        : isStatus
          ? `linear-gradient(135deg, ${color}10 0%, ${color}04 100%)`
          : token.colorBgContainer;

    return (
        <Flex
            vertical
            gap={token.marginXXS}
            onClick={onClick}
            style={{
                background: tint,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderTop: `3px solid ${accent}`,
                borderRadius: 6,
                padding,
                cursor: onClick ? "pointer" : "default",
                height: "100%",
                position: "relative",
                overflow: "hidden",
            }}
        >
            <Flex align="center" justify="space-between" gap={token.marginXS}>
                <Flex align="center" gap={token.marginXS}>
                    {icon && (
                        <Flex
                            align="center"
                            justify="center"
                            style={{
                                width: isHero ? 36 : 28,
                                height: isHero ? 36 : 28,
                                borderRadius: 6,
                                background: `${accent}1A`,
                                color: accent,
                                fontSize: isHero ? 18 : 14,
                            }}
                        >
                            {icon}
                        </Flex>
                    )}
                    <Text
                        type="secondary"
                        style={{
                            fontSize: token.fontSizeSM,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                            fontWeight: 600,
                        }}
                    >
                        {metric.label}
                    </Text>
                </Flex>
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
                        fontSize: valueSize,
                        lineHeight: 1.05,
                        color: metric.value === null ? token.colorTextTertiary : isHero ? token.colorTextHeading : color,
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
