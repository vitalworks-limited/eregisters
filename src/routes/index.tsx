import { createRoute, redirect } from "@tanstack/react-router";
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
            }),
        });
    },
});
