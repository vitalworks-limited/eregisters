import { Flex, theme, Typography } from "antd";
import React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const { Text } = Typography;

export interface DonutItem {
    label: string;
    value: number;
    color?: string;
}

interface Props {
    title?: string;
    items: DonutItem[];
    /** Total label rendered in the donut hole. */
    totalLabel?: string;
    /** Color palette to cycle through when an item has no `color`. */
    palette?: string[];
    height?: number;
}

const defaultPalette = (token: ReturnType<typeof theme.useToken>["token"]) => [
    token.colorPrimary,
    token.colorSuccess,
    token.colorWarning,
    token.colorError,
    "#0EA5E9",
    "#A855F7",
    "#0891B2",
    "#84CC16",
];

/**
 * Compact donut chart with an inline legend. Used for sex / age-band
 * distributions in Reports.
 */
export const DistributionDonut: React.FC<Props> = ({
    title,
    items,
    totalLabel = "Total",
    palette,
    height = 220,
}) => {
    const { token } = theme.useToken();
    const colors = palette ?? defaultPalette(token);
    const total = items.reduce((s, it) => s + it.value, 0);

    if (total === 0) {
        return (
            <div
                style={{
                    height,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: token.colorTextTertiary,
                    fontSize: token.fontSizeSM,
                }}
            >
                No data yet.
            </div>
        );
    }

    const data = items.map((it, i) => ({
        name: it.label,
        value: it.value,
        color: it.color ?? colors[i % colors.length],
    }));

    return (
        <Flex
            gap={token.marginSM}
            align="center"
            wrap
            style={{ width: "100%" }}
        >
            <div style={{ flex: "1 1 200px", minWidth: 0, maxWidth: 280 }}>
                <ResponsiveContainer width="100%" height={height}>
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="60%"
                            outerRadius="90%"
                            paddingAngle={1}
                            strokeWidth={0}
                            isAnimationActive
                            animationDuration={400}
                        >
                            {data.map((d, i) => (
                                <Cell key={i} fill={d.color} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                background: token.colorBgElevated,
                                border: `1px solid ${token.colorBorderSecondary}`,
                                borderRadius: token.borderRadius,
                                fontSize: token.fontSizeSM,
                                padding: `${token.paddingXXS}px ${token.paddingSM}px`,
                            }}
                            formatter={
                                ((v: unknown, name: unknown) => {
                                    const n = Number(v);
                                    return [
                                        `${n} (${Math.round((n / total) * 100)}%)`,
                                        String(name),
                                    ];
                                }) as never
                            }
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <Flex
                vertical
                gap={token.marginXS}
                style={{ flex: "1 1 160px", minWidth: 0 }}
            >
                {title && (
                    <Text strong style={{ marginBottom: token.marginXXS }}>
                        {title}
                    </Text>
                )}
                {data.map((d) => {
                    const pct = Math.round((d.value / total) * 100);
                    return (
                        <Flex
                            key={d.name}
                            align="center"
                            gap={token.marginXS}
                            style={{ width: "100%" }}
                        >
                            <span
                                style={{
                                    width: 10,
                                    height: 10,
                                    background: d.color,
                                    display: "inline-block",
                                    flexShrink: 0,
                                }}
                            />
                            <Text
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    fontSize: token.fontSizeSM,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {d.name}
                            </Text>
                            <Text
                                strong
                                style={{ fontSize: token.fontSizeSM }}
                            >
                                {d.value}
                            </Text>
                            <Text
                                type="secondary"
                                style={{
                                    fontSize: token.fontSizeSM,
                                    minWidth: 36,
                                    textAlign: "right",
                                }}
                            >
                                {pct}%
                            </Text>
                        </Flex>
                    );
                })}
                <Text
                    type="secondary"
                    style={{
                        fontSize: token.fontSizeSM,
                        marginTop: token.marginXXS,
                    }}
                >
                    {totalLabel}: <strong>{total}</strong>
                </Text>
            </Flex>
        </Flex>
    );
};
