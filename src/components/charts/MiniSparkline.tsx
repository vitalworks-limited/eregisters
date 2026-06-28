import React from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

interface Props {
    values: number[];
    color: string;
    height?: number;
    /** When you want the chart to fill its parent's width. */
    fillWidth?: boolean;
    width?: number;
}

/**
 * Tiny inline area chart used inside metric cards. Recharts handles
 * sizing via ResponsiveContainer; the parent picks dimensions.
 */
export const MiniSparkline: React.FC<Props> = ({
    values,
    color,
    height = 36,
    fillWidth = false,
    width = 112,
}) => {
    if (!values.length) return null;
    const data = values.map((v, i) => ({ i, v }));
    const id = React.useId();
    const inner = (
        <AreaChart
            data={data}
            margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
            <defs>
                <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
            </defs>
            <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#spark-${id})`}
                isAnimationActive={false}
            />
        </AreaChart>
    );
    if (fillWidth) {
        return (
            <ResponsiveContainer width="100%" height={height}>
                {inner}
            </ResponsiveContainer>
        );
    }
    return (
        <div style={{ width, height }}>
            <ResponsiveContainer width="100%" height="100%">
                {inner}
            </ResponsiveContainer>
        </div>
    );
};
