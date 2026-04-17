import { useCurrentUserInfo, useDataEngine } from "@dhis2/app-runtime";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { App, ConfigProvider, Typography } from "antd";
import React, { FC, useEffect, useState } from "react";
import {
    createEnrollmentCollection,
    createEventCollection,
    createTrackedEntityCollection,
} from "./collections";
import { Spinner } from "./components/spinner";
import { InitialSyncState, loadInitialSyncState } from "./db/sync-state-loader";
import { SyncContext } from "./machines/sync";
import { queryClient } from "./query-client";
import { router } from "./router";
import { isEmpty } from "lodash";

const Main = ({ user, ou }: { user: string; ou: string }) => {
    const syncActor = SyncContext.useActorRef();
    const isFirstTimeLoading = SyncContext.useSelector((snapshot) => {
        const isMetadataNotReady =
            (snapshot.matches({ metadataSync: "idle" }) ||
                snapshot.matches({ metadataSync: "fullRefresh" }) ||
                snapshot.matches({ metadataSync: "syncing" })) &&
            !snapshot.context.lastMetadataPull;
        return isMetadataNotReady;
    });

    const { metadataSync } = SyncContext.useSelector((a) => a.value);

    if (isFirstTimeLoading) {
        return (
            <Spinner
                component={
                    <Typography.Text>
                        Loading Metadata {metadataSync}
                    </Typography.Text>
                }
            />
        );
    }
    return <RouterProvider router={router} context={{ syncActor, user, ou }} />;
};
const MyApp: FC = () => {
    const engine = useDataEngine();
    const trackedEntitiesCollection = createTrackedEntityCollection();
    const enrollmentsCollection = createEnrollmentCollection();
    const eventsCollection = createEventCollection();
    const userInfo = useCurrentUserInfo();
    const [initialSyncState, setInitialSyncState] =
        useState<InitialSyncState | null>(null);

    useEffect(() => {
        loadInitialSyncState().then(setInitialSyncState);
    }, []);

    if (isEmpty(userInfo) || userInfo.organisationUnits.length > 1) {
        return (
            <Typography.Text>
                No user found or user assigned multiple organisations
            </Typography.Text>
        );
    }

    if (initialSyncState === null) {
        return (
            <Spinner
                component={
                    <Typography.Text>Loading sync state...</Typography.Text>
                }
            />
        );
    }
    const {
        id: user,
        organisationUnits: [{ id: orgUnit }],
    } = userInfo;

    return (
        <ConfigProvider
            theme={{
                components: {
                    Table: {
                        rowHoverBg: "#F1EFFD",
                    },
                    Card: {},
                    Tabs: {
                        cardGutter: 5,
                    },
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
                                orgUnit,
                                user,
                                initialLastDataPull:
                                    initialSyncState.lastDataPull,
                                initialLastMetadataPull:
                                    initialSyncState.lastMetadataPull,
                                initialLastDataPush:
                                    initialSyncState.lastDataPush,
                            },
                        }}
                        key={`${user}${orgUnit}`}
                    >
                        <Main user={user} ou={orgUnit} />
                    </SyncContext.Provider>
                </QueryClientProvider>
            </App>
        </ConfigProvider>
    );
};

export default MyApp;
