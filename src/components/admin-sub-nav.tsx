import {
    BarChartOutlined,
    ControlOutlined,
    DashboardOutlined,
    FileSearchOutlined,
    TeamOutlined,
    ThunderboltOutlined,
} from "@ant-design/icons";
import { Link, useRouterState } from "@tanstack/react-router";
import { Flex, theme, Typography } from "antd";
import React from "react";

const { Text } = Typography;

interface NavItem {
    to: string;
    label: string;
    icon: React.ReactNode;
    activeWhen: (path: string) => boolean;
}

export const ADMIN_NAV: NavItem[] = [
    {
        to: "/admin",
        label: "Overview",
        icon: <DashboardOutlined />,
        activeWhen: (p) => p === "/admin" || p === "/admin/",
    },
    {
        to: "/admin/sync",
        label: "Sync activity",
        icon: <ThunderboltOutlined />,
        activeWhen: (p) => p.startsWith("/admin/sync"),
    },
    {
        to: "/admin/users",
        label: "Users",
        icon: <TeamOutlined />,
        activeWhen: (p) => p.startsWith("/admin/users"),
    },
    {
        to: "/admin/logs",
        label: "Logs",
        icon: <FileSearchOutlined />,
        activeWhen: (p) => p.startsWith("/admin/logs"),
    },
    {
        to: "/admin/config",
        label: "Config",
        icon: <ControlOutlined />,
        activeWhen: (p) => p.startsWith("/admin/config"),
    },
    {
        to: "/admin/insights",
        label: "Insights",
        icon: <BarChartOutlined />,
        activeWhen: (p) => p.startsWith("/admin/insights"),
    },
];

interface Props {
    orientation?: "vertical" | "horizontal";
    onItemClick?: () => void;
}

export const AdminSubNav: React.FC<Props> = ({
    orientation = "vertical",
    onItemClick,
}) => {
    const { token } = theme.useToken();
    const pathname = useRouterState({ select: (s) => s.location.pathname });

    return (
        <Flex
            vertical={orientation === "vertical"}
            gap={orientation === "vertical" ? token.marginXXS : token.marginSM}
            style={{ width: "100%" }}
        >
            {ADMIN_NAV.map((item) => {
                const active = item.activeWhen(pathname);
                const base: React.CSSProperties = {
                    display: "flex",
                    alignItems: "center",
                    gap: token.marginXS,
                    paddingInline: token.paddingSM,
                    paddingBlock: token.paddingXS,
                    color: active
                        ? token.colorPrimary
                        : token.colorTextSecondary,
                    background: active
                        ? token.colorFillTertiary
                        : "transparent",
                    borderLeft:
                        orientation === "vertical"
                            ? `3px solid ${
                                  active ? token.colorPrimary : "transparent"
                              }`
                            : undefined,
                    borderBottom:
                        orientation === "horizontal"
                            ? `2px solid ${
                                  active ? token.colorPrimary : "transparent"
                              }`
                            : undefined,
                    fontWeight: active ? 600 : 500,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                };
                return (
                    <Link
                        key={item.to}
                        to={item.to}
                        onClick={onItemClick}
                        style={base}
                    >
                        <span style={{ fontSize: 14 }}>{item.icon}</span>
                        <Text style={{ color: "inherit" }}>{item.label}</Text>
                    </Link>
                );
            })}
        </Flex>
    );
};
