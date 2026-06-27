import {
    createHashHistory,
    createRouter,
    ErrorComponent,
} from "@tanstack/react-router";
import React from "react";
import { Spinner } from "./components/spinner";
import { AdminRoute } from "./routes/admin";
import { AdminConfigRoute } from "./routes/admin.config";
import { AdminDataCaptureRoute } from "./routes/admin.data-capture";
import { AdminIndexRoute } from "./routes/admin.index";
import { AdminInsightsRoute } from "./routes/admin.insights";
import { AdminLogsRoute } from "./routes/admin.logs";
import { AdminQueueRoute } from "./routes/admin.queue";
import { AdminSyncRoute } from "./routes/admin.sync";
import { AdminUsersRoute } from "./routes/admin.users";
import { RootRoute } from "./routes/__root";
import { IndexRoute } from "./routes/index";
import { ReportsRoute } from "./routes/reports";
import { TrackedEntitiesRoute } from "./routes/tracked-entities";
import { TrackedEntitiesIndexRoute } from "./routes/tracked-entities.index";
import { TrackedEntityRoute } from "./routes/tracked-entity";

const routeTree = RootRoute.addChildren([
    IndexRoute,
    TrackedEntitiesRoute.addChildren([TrackedEntitiesIndexRoute]),
    TrackedEntityRoute,
    ReportsRoute,
    AdminRoute.addChildren([
        AdminIndexRoute,
        AdminSyncRoute,
        AdminQueueRoute,
        AdminUsersRoute,
        AdminDataCaptureRoute,
        AdminLogsRoute,
        AdminConfigRoute,
        AdminInsightsRoute,
    ]),
]);
export const router = createRouter({
    routeTree,
    defaultPendingComponent: () => <Spinner />,
    defaultErrorComponent: ({ error }) => <ErrorComponent error={error} />,
    history: createHashHistory(),
    context: {
        syncActor: undefined!,
    },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
