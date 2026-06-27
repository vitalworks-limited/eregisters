import { theme } from "antd";
import dayjs from "dayjs";
import React from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

export interface VisitPoint {
    date: string; // YYYY-MM-DD
    value: number;
}

interface Props {
    points: VisitPoint[];
    accent?: string;
    /** Lock the chart height; the width is always responsive to parent. */
    height?: number;
    /** Hide x/y tick labels on tight viewports. */
    compact?: boolean;
}

/**
 * Daily visits over a date range, rendered with Recharts so the chart
 * grows / shrinks fluidly with the parent. Pure recharts, no D3 axes;
 * styling pulls from antd theme tokens for dark-mode parity.
 */
export const VisitsAreaChart: React.FC<Props> = ({
    points,
    accent,
    height = 240,
    compact = false,
}) => {
    const { token } = theme.useToken();
    const stroke = accent ?? token.colorPrimary;
    const gridStroke = token.colorBorderSecondary;
    const textColor = token.colorTextTertiary;
    const tooltipBg = token.colorBgElevated;
    const tooltipBorder = token.colorBorderSecondary;
    const gradientId = React.useId();

    if (!points.length) {
        return (
            <div
                style={{
                    height,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: textColor,
                    fontSize: token.fontSizeSM,
                }}
            >
                No data yet.
            </div>
        );
    }

    const tickFormatter = (raw: string) => dayjs(raw).format("MMM D");

    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart
                data={points}
                margin={{
                    top: 8,
                    right: 12,
                    bottom: 4,
                    left: compact ? 0 : 4,
                }}
            >
                <defs>
                    <linearGradient
                        id={`visit-${gradientId}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                    >
                        <stop offset="0%" stopColor={stroke} stopOpacity={0.32} />
                        <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid
                    stroke={gridStroke}
                    strokeDasharray="3 4"
                    vertical={false}
                />
                <XAxis
                    dataKey="date"
                    tickFormatter={tickFormatter}
                    tick={{ fontSize: 11, fill: textColor }}
                    tickLine={false}
                    axisLine={{ stroke: gridStroke }}
                    minTickGap={32}
                    interval="preserveStartEnd"
                />
                <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: textColor }}
                    tickLine={false}
                    axisLine={false}
                    width={compact ? 24 : 36}
                />
                <Tooltip
                    cursor={{ stroke, strokeOpacity: 0.4, strokeWidth: 1 }}
                    contentStyle={{
                        background: tooltipBg,
                        border: `1px solid ${tooltipBorder}`,
                        borderRadius: token.borderRadius,
                        fontSize: token.fontSizeSM,
                        padding: `${token.paddingXXS}px ${token.paddingSM}px`,
                    }}
                    labelStyle={{ color: textColor, fontSize: 11 }}
                    labelFormatter={((value: unknown) =>
                        dayjs(String(value)).format("ddd, MMM D, YYYY")) as never}
                    formatter={((v: unknown) => [`${v}`, "Visits"]) as never}
                />
                <Area
                    type="monotone"
                    dataKey="value"
                    stroke={stroke}
                    strokeWidth={2}
                    fill={`url(#visit-${gradientId})`}
                    isAnimationActive
                    animationDuration={400}
                    dot={false}
                    activeDot={{ r: 3 }}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
};
