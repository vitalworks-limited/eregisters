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
import { Spinner } from "./components/spinner";
import { SyncContext } from "./machines/sync";
import { queryClient } from "./query-client";
import { router } from "./router";

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

    const { metadataSync } = SyncContext.useSelector((a) => a.value);

    const userInfo = useCurrentUserInfo();

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
    return (
        <RouterProvider
            router={router}
            context={{ syncActor, user: userInfo?.id }}
        />
    );
};
const MyApp: FC = () => {
    const engine = useDataEngine();
    const trackedEntitiesCollection = createTrackedEntityCollection();
    const enrollmentsCollection = createEnrollmentCollection();
    const eventsCollection = createEventCollection();
    const userInfo = useCurrentUserInfo();

    if (userInfo === undefined) {
        return <Typography.Text>No user found</Typography.Text>;
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
                                orgUnit: userInfo.organisationUnits
                                    .map(({ id }) => id)
                                    .join(";"),
                                user: userInfo.id,
                            },
                        }}
                        key={`${userInfo.id}${userInfo.organisationUnits
                            .map(({ id }) => id)
                            .join(";")}`}
                    >
                        <Main />
                    </SyncContext.Provider>
                </QueryClientProvider>
            </App>
        </ConfigProvider>
    );
};

export default MyApp;
