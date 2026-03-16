import { useCurrentUserInfo, useDataEngine } from "@dhis2/app-runtime";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { App, ConfigProvider, Typography } from "antd";
import React, { FC } from "react";
import {
    createEnrollmentCollection,
    createEventCollection,
    createTrackedEntityCollection,
} from "./collections";
import { SyncContext } from "./machines/sync";
import { queryClient } from "./query-client";
import { router } from "./router";
import { Spinner } from "./components/spinner";
import { loadInitialSyncState } from "./db/sync-state-loader";

const Main = () => {
    const syncActor = SyncContext.useActorRef();

    const isFirstTimeLoading = SyncContext.useSelector((snapshot) => {
        const isMetadataNotReady =
            snapshot.matches({ metadataSync: "idle" }) ||
            snapshot.matches({ metadataSync: "fullRefresh" }) ||
            (snapshot.matches({ metadataSync: "syncing" }) &&
                !snapshot.context.lastMetadataPull);

        return isMetadataNotReady;
    });

    if (isFirstTimeLoading)
        return (
            <Spinner
                component={<Typography.Text>Loading Metadata</Typography.Text>}
            />
        );
    return <RouterProvider router={router} context={{ syncActor }} />;
};
const MyApp: FC = () => {
    const engine = useDataEngine();
    const trackedEntitiesCollection = createTrackedEntityCollection();
    const enrollmentsCollection = createEnrollmentCollection();
    const eventsCollection = createEventCollection();
    const userInfo = useCurrentUserInfo();

    const [initialSyncState, setInitialSyncState] = React.useState<{
        lastMetadataPull?: string;
        lastDataPull?: string;
    } | null>(null);

    React.useEffect(() => {
        loadInitialSyncState().then(setInitialSyncState);
    }, []);

    if (!initialSyncState) {
        return (
            <Spinner
                component={<Typography.Text>Initializing...</Typography.Text>}
            />
        );
    }

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
                    <SyncContext.Provider
                        options={{
                            input: {
                                engine,
                                enrollmentsCollection,
                                eventsCollection,
                                trackedEntitiesCollection,
                                orgUnit:
                                    userInfo?.organisationUnits
                                        .map((a) => a.id)
                                        .join(";") ?? "",
                                initialLastMetadataPull:
                                    initialSyncState.lastMetadataPull,
                                initialLastDataPull:
                                    initialSyncState.lastDataPull,
                            },
                        }}
                    >
                        <Main />
                    </SyncContext.Provider>
                </QueryClientProvider>
            </App>
        </ConfigProvider>
    );
};

export default MyApp;
