import { theme, Typography } from "antd";
import dayjs from "dayjs";
import React from "react";

const { Text } = Typography;

interface Point {
    date: string; // YYYY-MM-DD
    value: number;
}

interface Props {
    points: Point[];
    height?: number;
    accent?: string;
}

/**
 * Inline-SVG area chart for visit trends. Renders X-axis labels for the
 * first, middle and last days plus the latest value above the line.
 * Deliberately avoids any chart library so the bundle stays light and
 * works fully offline.
 */
export const TrendChart: React.FC<Props> = ({ points, height = 180, accent }) => {
    const { token } = theme.useToken();
    const stroke = accent ?? token.colorPrimary;
    const fill = `${stroke}22`;
    const padL = 32;
    const padR = 12;
    const padT = 16;
    const padB = 24;
    const width = 720;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    if (!points.length) {
        return (
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height,
                    color: token.colorTextTertiary,
                }}
            >
                <Text type="secondary">No data yet.</Text>
            </div>
        );
    }

    const values = points.map((p) => p.value);
    const max = Math.max(1, ...values);
    const min = Math.min(0, ...values);
    const range = max - min || 1;
    const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
    const project = (i: number, v: number) => {
        const x = padL + i * stepX;
        const y = padT + innerH - ((v - min) / range) * innerH;
        return { x, y };
    };

    const linePoints = points.map((p, i) => project(i, p.value));
    const linePath = linePoints
        .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
        .join(" ");
    const areaPath = `${linePath} L ${linePoints[linePoints.length - 1].x.toFixed(2)} ${padT + innerH} L ${linePoints[0].x.toFixed(2)} ${padT + innerH} Z`;

    const ticks = 4;
    const yAxisLabels = Array.from({ length: ticks + 1 }).map((_, i) => {
        const v = min + ((max - min) * i) / ticks;
        const y = padT + innerH - (i / ticks) * innerH;
        return { v: Math.round(v), y };
    });

    const xLabelIdxs =
        points.length <= 1
            ? [0]
            : [0, Math.floor(points.length / 2), points.length - 1];

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Visit trend"
            style={{ width: "100%", height }}
        >
            {yAxisLabels.map((t, i) => (
                <g key={`y-${i}`}>
                    <line
                        x1={padL}
                        x2={width - padR}
                        y1={t.y}
                        y2={t.y}
                        stroke={token.colorBorderSecondary}
                        strokeDasharray="2 4"
                        strokeWidth={1}
                    />
                    <text
                        x={padL - 6}
                        y={t.y + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={token.colorTextTertiary}
                    >
                        {t.v}
                    </text>
                </g>
            ))}

            <path d={areaPath} fill={fill} />
            <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.75} />

            {linePoints.map((pt, i) => (
                <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r={1.5}
                    fill={stroke}
                    opacity={0.7}
                >
                    <title>
                        {dayjs(points[i].date).format("MMM D")}: {points[i].value}
                    </title>
                </circle>
            ))}

            {xLabelIdxs.map((i) => (
                <text
                    key={`x-${i}`}
                    x={padL + i * stepX}
                    y={height - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fill={token.colorTextTertiary}
                >
                    {dayjs(points[i].date).format("MMM D")}
                </text>
            ))}
        </svg>
    );
};
