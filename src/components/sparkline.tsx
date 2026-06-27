import { theme } from "antd";
import React from "react";

interface Props {
    values: number[];
    width?: number;
    height?: number;
    accent?: string;
    /** Tooltip label generator: index → text. */
    label?: (i: number) => string;
}

/**
 * Tiny pure-SVG sparkline with no chart-library dependency. Used inline
 * inside Reports metric cards to show a 30-day trend at-a-glance.
 */
export const Sparkline: React.FC<Props> = ({
    values,
    width = 120,
    height = 32,
    accent,
    label,
}) => {
    const { token } = theme.useToken();
    const stroke = accent ?? token.colorPrimary;
    if (!values.length) {
        return (
            <svg width={width} height={height} role="img" aria-label="No data">
                <line
                    x1={0}
                    x2={width}
                    y1={height / 2}
                    y2={height / 2}
                    stroke={token.colorBorderSecondary}
                    strokeWidth={1}
                />
            </svg>
        );
    }
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const stepX = values.length > 1 ? width / (values.length - 1) : 0;
    const points = values
        .map((v, i) => {
            const x = i * stepX;
            const y = height - ((v - min) / range) * height;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");
    const last = values[values.length - 1];
    const lastX = (values.length - 1) * stepX;
    const lastY = height - ((last - min) / range) * height;
    return (
        <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Trend with ${values.length} points, latest ${last}`}
        >
            <polyline
                points={points}
                fill="none"
                stroke={stroke}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
            {label && (
                <title>
                    {values
                        .map((v, i) => `${label(i)}: ${v}`)
                        .join("\n")}
                </title>
            )}
        </svg>
    );
};
