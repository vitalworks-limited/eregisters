import { useDataEngine } from "@dhis2/app-runtime";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { App, ConfigProvider } from "antd";
import React, { FC, useEffect, useRef } from "react";
import { createSyncManager, SyncManager } from "./db/sync";
import { startPeriodicSync, stopPeriodicSync } from "./db/periodic-sync";
import { queryClient } from "./query-client";
import { router } from "./router";

const Main = () => {
    const engine = useDataEngine();
    const syncManagerRef = useRef<SyncManager | null>(null);

    if (!syncManagerRef.current) {
        // Keep SyncManager for metadata sync only
        syncManagerRef.current = createSyncManager(engine);
        syncManagerRef.current.startAutoSync();
    }
    const syncManager = syncManagerRef.current;

    // Start periodic sync on mount, cleanup on unmount
    useEffect(() => {
        startPeriodicSync(engine);
        return () => {
            stopPeriodicSync();
        };
    }, [engine]);

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
