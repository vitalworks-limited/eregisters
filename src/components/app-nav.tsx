import { DashboardOutlined, TeamOutlined } from "@ant-design/icons";
import { Link, useRouterState } from "@tanstack/react-router";
import { Flex, theme } from "antd";
import React from "react";

interface NavItem {
    to: string;
    label: string;
    icon: React.ReactNode;
    activeWhen: (pathname: string) => boolean;
}

const NAV: NavItem[] = [
    {
        to: "/tracked-entities",
        label: "Patients",
        icon: <TeamOutlined />,
        activeWhen: (p) =>
            p === "/" ||
            p.startsWith("/tracked-entities") ||
            p.startsWith("/tracked-entity"),
    },
    {
        to: "/dashboard",
        label: "Dashboard",
        icon: <DashboardOutlined />,
        activeWhen: (p) =>
            p.startsWith("/dashboard") || p.startsWith("/reports"),
    },
];

interface Props {
    orientation: "horizontal" | "vertical";
    onItemClick?: () => void;
}

export const AppNav: React.FC<Props> = ({ orientation, onItemClick }) => {
    const { token } = theme.useToken();
    const pathname = useRouterState({
        select: (s) => s.location.pathname,
    });

    return (
        <Flex
            vertical={orientation === "vertical"}
            gap={orientation === "horizontal" ? 4 : token.marginXS}
            align={orientation === "vertical" ? "stretch" : "center"}
            style={{ height: "100%" }}
        >
            {NAV.map((item) => {
                const active = item.activeWhen(pathname);
                const baseStyle: React.CSSProperties = {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: token.marginXS,
                    paddingInline: token.paddingSM,
                    color: active
                        ? token.colorPrimary
                        : token.colorTextSecondary,
                    fontWeight: active ? 600 : 500,
                    textDecoration: "none",
                };
                const orientationStyle: React.CSSProperties =
                    orientation === "horizontal"
                        ? {
                              height: "100%",
                              borderBottom: `2px solid ${
                                  active ? token.colorPrimary : "transparent"
                              }`,
                              marginBottom: -1,
                          }
                        : {
                              paddingBlock: token.paddingXS,
                              background: active
                                  ? token.colorFillTertiary
                                  : "transparent",
                              borderLeft: `3px solid ${
                                  active ? token.colorPrimary : "transparent"
                              }`,
                          };
                return (
                    <Link
                        key={item.to}
                        to={item.to}
                        onClick={onItemClick}
                        style={{ ...baseStyle, ...orientationStyle }}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </Link>
                );
            })}
        </Flex>
    );
};
