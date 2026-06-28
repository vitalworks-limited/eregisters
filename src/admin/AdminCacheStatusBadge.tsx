import { ClockCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { theme, Tooltip, Typography } from "antd";
import React from "react";
import { CacheInfo } from "./summaryTypes";

const { Text } = Typography;

function fmtAge(seconds: number): string {
    if (seconds < 90) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
    return `${Math.round(seconds / 86_400)}d ago`;
}

export const AdminCacheStatusBadge: React.FC<{
    cache: CacheInfo;
    compact?: boolean;
}> = ({ cache, compact }) => {
    const { token } = theme.useToken();
    const tip = `Source: ${cache.source} · TTL ${Math.round(
        cache.ttlSeconds / 60,
    )} min · Generated ${cache.generatedAt}`;
    const color = cache.isStale ? token.colorWarning : token.colorTextSecondary;
    const icon = cache.isStale ? <WarningOutlined /> : <ClockCircleOutlined />;
    return (
        <Tooltip title={tip}>
            <Text
                style={{
                    color,
                    fontSize: compact ? token.fontSizeSM : undefined,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                }}
            >
                {icon}
                {cache.isStale
                    ? `Stale · updated ${fmtAge(cache.ageSeconds)}`
                    : `Updated ${fmtAge(cache.ageSeconds)}`}{" "}
                · {cache.source}
            </Text>
        </Tooltip>
    );
};
