import {
    createHashHistory,
    createRouter,
    ErrorComponent,
} from "@tanstack/react-router";
import React from "react";
import { Spinner } from "./components/spinner";
import { RootRoute } from "./routes/__root";
import { IndexRoute } from "./routes/index";
import { TrackedEntitiesRoute } from "./routes/tracked-entities";
import { TrackedEntitiesIndexRoute } from "./routes/tracked-entities.index";
import { TrackedEntityRoute } from "./routes/tracked-entity";

const routeTree = RootRoute.addChildren([
    IndexRoute,
    TrackedEntitiesRoute.addChildren([TrackedEntitiesIndexRoute]),
    TrackedEntityRoute,
]);
export const router = createRouter({
    routeTree,
    defaultPendingComponent: () => <Spinner />,
    defaultErrorComponent: ({ error }) => <ErrorComponent error={error} />,
    history: createHashHistory(),
    context: {
        syncManager: undefined!,
    },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
