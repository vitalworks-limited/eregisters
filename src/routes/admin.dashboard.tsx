import { createRoute } from "@tanstack/react-router";
import React from "react";
import { AdminNationalOverview } from "../admin/AdminNationalOverview";
import { AdminRoute } from "./admin";

export const AdminDashboardRoute = createRoute({
    getParentRoute: () => AdminRoute,
    path: "dashboard",
    component: AdminDashboard,
});

function AdminDashboard() {
    return <AdminNationalOverview />;
}
