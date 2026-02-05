import { useDataEngine } from "@dhis2/app-runtime";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { App, ConfigProvider } from "antd";
import React, { FC } from "react";
import { Spinner } from "./components/spinner";
import { createSyncManager } from "./db/sync";
import { queryClient } from "./query-client";
import { resourceQueryOptions } from "./query-options";
import { router } from "./router";
import { OrgUnit } from "./schemas";

const Main = () => {
    const engine = useDataEngine();
    const syncManager = createSyncManager(engine);
    const { data, error, isError, isLoading } = useQuery(
        resourceQueryOptions<{
            organisationUnits: OrgUnit[];
            id: string;
        }>({
            engine,
            resource: "me",
            params: {
                fields: "id,organisationUnits[id,name,level,parent,leaf]",
            },
        }),
    );
    if (isError) return <div>Error: {String(error)}</div>;
    if (isLoading) return <Spinner />;

    if (data && data.organisationUnits.length > 0)
        return (
            <RouterProvider
                router={router}
                context={{
                    engine,
                    orgUnit: data.organisationUnits[0],
                    syncManager,
                }}
            />
        );
    return null;
};
const MyApp: FC = () => {
    return (
        <ConfigProvider
            theme={{
                components: {
                    Table: {
                        rowHoverBg: "#F1EFFD",
                    },
                    Card: {},
                },
                token: {
                    fontSize: 16,
                },
            }}
        >
            <App>
                <QueryClientProvider client={queryClient}>
                    <Main />
                </QueryClientProvider>
            </App>
        </ConfigProvider>
    );
};

export default MyApp;
