import React from "react";
import { createRoute } from "@tanstack/react-router";
import { Flex, Typography } from "antd";
import { RootRoute } from "./__root";
import { Spinner } from "../components/spinner";

export const ReportsRoute = createRoute({
    getParentRoute: () => RootRoute,
    path: "/reports",
    component: Reports,
    pendingComponent: Spinner,
});

function Reports() {
    return (
        <Flex style={{ height: "calc(100vh - 96px - 20px)", padding: 10 }}>
            <Typography.Title>Coming very soon</Typography.Title>
        </Flex>
    );
}
