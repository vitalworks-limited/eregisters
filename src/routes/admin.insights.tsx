import { BarChartOutlined } from "@ant-design/icons";
import { createRoute } from "@tanstack/react-router";
import { Flex, theme, Typography } from "antd";
import React from "react";
import { EmptyState } from "../components/empty-state";
import { AdminRoute } from "./admin";

const { Title, Text } = Typography;

export const AdminInsightsRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "insights",
    component: AdminInsights,
});

function AdminInsights() {
    const { token } = theme.useToken();
    return (
        <Flex vertical gap={token.marginSM} style={{ minHeight: 360 }}>
            <Flex vertical gap={token.marginXXS}>
                <Title level={5} style={{ margin: 0 }}>
                    Insights
                </Title>
                <Text type="secondary">
                    Cross-facility analytics — placeholder for the next phase.
                </Text>
            </Flex>
            <EmptyState
                title="Coming next"
                description={
                    <>
                        Per-facility roll-ups (devices on the latest build,
                        push backlog, longest-running pulls) will live here.
                        For now, use the Sync activity, Users, and Logs tabs
                        for device-scoped views.
                    </>
                }
                action={<BarChartOutlined style={{ fontSize: 36, color: token.colorTextTertiary }} />}
            />
        </Flex>
    );
}
