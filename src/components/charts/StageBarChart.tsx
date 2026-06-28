import { theme, Typography } from "antd";
import React from "react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

const { Text } = Typography;

export interface StageItem {
    label: string;
    value: number;
}

interface Props {
    items: StageItem[];
    /** Maximum number of rows to render; truncated rest shown as "+N more". */
    maxItems?: number;
    /** Lock the chart height. */
    height?: number;
    accent?: string;
}

/**
 * Horizontal bar chart of visits per program stage. Horizontal makes
 * long stage names readable on phones; the chart auto-sizes width.
 */
export const StageBarChart: React.FC<Props> = ({
    items,
    maxItems = 8,
    height,
    accent,
}) => {
    const { token } = theme.useToken();
    const bar = accent ?? token.colorPrimary;
    const gridStroke = token.colorBorderSecondary;
    const textColor = token.colorTextTertiary;
    const tooltipBg = token.colorBgElevated;
    const tooltipBorder = token.colorBorderSecondary;

    if (!items.length) {
        return (
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                No data yet.
            </Text>
        );
    }

    const sorted = [...items].sort((a, b) => b.value - a.value);
    const visible = sorted.slice(0, maxItems);
    const hiddenCount = sorted.length - visible.length;
    // 36 px per row keeps labels readable; pad for axis.
    const computedHeight = height ?? Math.max(160, visible.length * 36 + 24);

    return (
        <div style={{ width: "100%" }}>
            <ResponsiveContainer width="100%" height={computedHeight}>
                <BarChart
                    data={visible}
                    layout="vertical"
                    margin={{
                        top: 4,
                        right: 16,
                        bottom: 4,
                        left: 0,
                    }}
                >
                    <CartesianGrid
                        stroke={gridStroke}
                        strokeDasharray="3 4"
                        horizontal={false}
                    />
                    <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: textColor }}
                        tickLine={false}
                        axisLine={{ stroke: gridStroke }}
                    />
                    <YAxis
                        type="category"
                        dataKey="label"
                        tick={{ fontSize: 12, fill: token.colorTextSecondary }}
                        tickLine={false}
                        axisLine={false}
                        width={140}
                    />
                    <Tooltip
                        cursor={{ fill: `${bar}10` }}
                        contentStyle={{
                            background: tooltipBg,
                            border: `1px solid ${tooltipBorder}`,
                            borderRadius: token.borderRadius,
                            fontSize: token.fontSizeSM,
                            padding: `${token.paddingXXS}px ${token.paddingSM}px`,
                        }}
                        formatter={((v: unknown) => [`${v}`, "Visits"]) as never}
                    />
                    <Bar
                        dataKey="value"
                        radius={[0, 2, 2, 0]}
                        isAnimationActive
                        animationDuration={400}
                    >
                        {visible.map((entry, i) => (
                            <Cell key={`cell-${i}`} fill={bar} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
            {hiddenCount > 0 && (
                <Text
                    type="secondary"
                    style={{
                        fontSize: token.fontSizeSM,
                        display: "block",
                        marginTop: token.marginXS,
                    }}
                >
                    +{hiddenCount} more stage{hiddenCount === 1 ? "" : "s"} not
                    shown
                </Text>
            )}
        </div>
    );
};
