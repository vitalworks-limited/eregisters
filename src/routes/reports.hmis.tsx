import { createRoute } from "@tanstack/react-router";
import React from "react";
import { Spinner } from "../components/spinner";
import { ReportsRoute } from "./reports";

export const HMISReportsRoute = createRoute({
    getParentRoute: () => ReportsRoute,
    path: "/hmis",
    component: HMISReports,

    pendingComponent: Spinner,
});
function HMISReports() {
    return <div>reports</div>;
}
