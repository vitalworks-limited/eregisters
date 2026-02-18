import { useDataEngine } from "@dhis2/app-runtime";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { App, ConfigProvider } from "antd";
import React, { FC, useRef } from "react";
import { createSyncManager, SyncManager } from "./db/sync";
import { queryClient } from "./query-client";
import { router } from "./router";

const Main = () => {
    const engine = useDataEngine();
    const syncManagerRef = useRef<SyncManager | null>(null);
    if (!syncManagerRef.current) {
        syncManagerRef.current = createSyncManager(engine);
    }
    const syncManager = syncManagerRef.current;

    return (
        <RouterProvider
            router={router}
            context={{
                syncManager,
            }}
        />
    );
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
