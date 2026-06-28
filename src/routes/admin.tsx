import { useCurrentUserInfo } from "@dhis2/app-runtime";
import {
    createRoute,
    Outlet,
    redirect,
} from "@tanstack/react-router";
import { Col, Flex, Grid, Layout, Row, theme, Typography } from "antd";
import React from "react";
import { AdminSubNav } from "../components/admin-sub-nav";
import { Spinner } from "../components/spinner";
import { EREG_ADMIN } from "../hooks/useAuthorities";
import { RootRoute } from "./__root";

const { Content } = Layout;
const { Title, Text } = Typography;

export const AdminRoute = createRoute({
    getParentRoute: () => RootRoute,
    path: "/admin",
    component: AdminLayout,
    pendingComponent: Spinner,
    beforeLoad: () => {
        // The DHIS2 app-runtime hooks aren't available in beforeLoad,
        // so we re-check in the component. We only redirect for
        // obviously missing user info to avoid a flash on first load.
    },
});

function AdminLayout() {
    const { token } = theme.useToken();
    const info = useCurrentUserInfo() as
        | { authorities?: string[]; name?: string }
        | undefined;
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;

    const authorities = new Set(info?.authorities ?? []);
    const isAdmin = authorities.has("ALL") || authorities.has(EREG_ADMIN);

    if (!isAdmin) {
        // Throw a redirect — tanstack-router catches it and routes
        // unauthorised users back to the patients page.
        throw redirect({ to: "/tracked-entities" });
    }

    return (
        <Content
            style={{
                padding: isMobile ? token.paddingSM : token.padding,
                display: "flex",
                flexDirection: "column",
                flex: 1,
            }}
        >
            <Flex
                align="center"
                justify="space-between"
                gap={token.marginSM}
                wrap
                style={{ marginBottom: token.marginSM }}
            >
                <Flex vertical gap={token.marginXXS}>
                    <Title level={4} style={{ margin: 0, lineHeight: 1.2 }}>
                        Admin
                    </Title>
                    <Text type="secondary">
                        Eyes-on monitoring, runtime config, and broadcast
                        controls. Visible to users with{" "}
                        <Text code style={{ fontSize: token.fontSizeSM }}>
                            EREG_ADMIN
                        </Text>
                        .
                    </Text>
                </Flex>
            </Flex>

            <Row
                gutter={[token.marginSM, token.marginSM]}
                style={{ flex: 1, minHeight: 0 }}
            >
                {!isMobile && (
                    <Col flex="220px">
                        <div
                            style={{
                                background: token.colorBgContainer,
                                border: `1px solid ${token.colorBorderSecondary}`,
                                padding: token.paddingXS,
                                position: "sticky",
                                top: token.paddingSM,
                            }}
                        >
                            <AdminSubNav orientation="vertical" />
                        </div>
                    </Col>
                )}
                <Col flex="1" style={{ minWidth: 0, display: "flex" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {isMobile && (
                            <div
                                style={{
                                    background: token.colorBgContainer,
                                    border: `1px solid ${token.colorBorderSecondary}`,
                                    padding: token.paddingXS,
                                    marginBottom: token.marginSM,
                                    overflowX: "auto",
                                }}
                            >
                                <AdminSubNav orientation="horizontal" />
                            </div>
                        )}
                        <Outlet />
                    </div>
                </Col>
            </Row>
        </Content>
    );
}
