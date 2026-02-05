import { createRoute, redirect } from "@tanstack/react-router";
import React from "react";
import { RootRoute } from "./__root";
export const IndexRoute = createRoute({
    getParentRoute: () => RootRoute,
    path: "/",
    beforeLoad: () => {
        throw redirect({
            to: "/tracked-entities",
            search: (prev) => ({
                ...prev,
								search: undefined,
								orgUnits: prev.orgUnits || "",
            }),
        });
    },
    component: () => {
        return <div>Welcome to MOH Registers</div>;
    },
});
