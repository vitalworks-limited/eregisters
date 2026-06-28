import {
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    InfoCircleOutlined,
    WarningOutlined,
} from "@ant-design/icons";
import { Empty, Flex, theme, Typography } from "antd";
import React from "react";
import { AdminAlert } from "./summaryTypes";

const { Text, Paragraph } = Typography;

function severityVisuals(
    severity: AdminAlert["severity"],
    token: ReturnType<typeof theme.useToken>["token"],
): { color: string; icon: React.ReactNode; label: string } {
    switch (severity) {
        case "critical":
            return {
                color: token.colorError,
                icon: <ExclamationCircleOutlined />,
                label: "Critical",
            };
        case "error":
            return {
                color: token.colorError,
                icon: <ExclamationCircleOutlined />,
                label: "Error",
            };
        case "warning":
            return {
                color: token.colorWarning,
                icon: <WarningOutlined />,
                label: "Warning",
            };
        default:
            return {
                color: token.colorInfo,
                icon: <InfoCircleOutlined />,
                label: "Info",
            };
    }
}

export const AdminOperationalAlertsPanel: React.FC<{
    alerts: AdminAlert[];
}> = ({ alerts }) => {
    const { token } = theme.useToken();

    if (alerts.length === 0) {
        return (
            <Flex
                vertical
                align="center"
                justify="center"
                gap={token.marginXS}
                style={{
                    padding: token.paddingLG,
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <CheckCircleOutlined
                    style={{ fontSize: 26, color: token.colorSuccess }}
                />
                <Text strong>No operational alerts</Text>
                <Text
                    type="secondary"
                    style={{ fontSize: token.fontSizeSM, textAlign: "center" }}
                >
                    No risk signals fired for the selected period and scope.
                </Text>
            </Flex>
        );
    }

    return (
        <Flex vertical gap={token.marginSM}>
            {alerts.map((alert) => {
                const visuals = severityVisuals(alert.severity, token);
                return (
                    <Flex
                        key={alert.id}
                        vertical
                        gap={token.marginXXS}
                        style={{
                            background: token.colorBgContainer,
                            border: `1px solid ${token.colorBorderSecondary}`,
                            borderInlineStart: `3px solid ${visuals.color}`,
                            padding: token.padding,
                        }}
                    >
                        <Flex
                            align="center"
                            justify="space-between"
                            gap={token.marginXS}
                        >
                            <Flex align="center" gap={token.marginXS}>
                                <span style={{ color: visuals.color }}>
                                    {visuals.icon}
                                </span>
                                <Text strong>{alert.title}</Text>
                            </Flex>
                            <Text
                                style={{
                                    color: visuals.color,
                                    fontSize: token.fontSizeSM,
                                    textTransform: "uppercase",
                                    letterSpacing: 0.4,
                                }}
                            >
                                {visuals.label}
                            </Text>
                        </Flex>
                        <Paragraph
                            type="secondary"
                            style={{ margin: 0 }}
                        >
                            {alert.description}
                        </Paragraph>
                        {alert.evidence.length > 0 && (
                            <Flex vertical gap={token.marginXXS}>
                                <Text
                                    type="secondary"
                                    style={{
                                        fontSize: token.fontSizeSM,
                                        fontWeight: 500,
                                    }}
                                >
                                    Evidence
                                </Text>
                                <ul
                                    style={{
                                        margin: 0,
                                        paddingInlineStart: 18,
                                        color: token.colorTextSecondary,
                                    }}
                                >
                                    {alert.evidence.map((e, i) => (
                                        <li key={i}>
                                            <Text
                                                type="secondary"
                                                style={{
                                                    fontSize: token.fontSizeSM,
                                                }}
                                            >
                                                {e}
                                            </Text>
                                        </li>
                                    ))}
                                </ul>
                            </Flex>
                        )}
                        <Text style={{ fontSize: token.fontSizeSM }}>
                            <Text strong>Recommended action: </Text>
                            {alert.recommendedAction}
                        </Text>
                        {alert.affectedOrgUnits &&
                            alert.affectedOrgUnits.length > 0 && (
                                <Text
                                    type="secondary"
                                    style={{ fontSize: token.fontSizeSM }}
                                >
                                    Affects{" "}
                                    {alert.affectedOrgUnits.length} org unit
                                    {alert.affectedOrgUnits.length === 1
                                        ? ""
                                        : "s"}
                                </Text>
                            )}
                    </Flex>
                );
            })}
            {alerts.length === 0 && <Empty />}
        </Flex>
    );
};
