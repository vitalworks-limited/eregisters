import { useCurrentUserInfo, useDataEngine } from "@dhis2/app-runtime";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { App, ConfigProvider, Typography } from "antd";
import { isEmpty } from "lodash";
import React, { FC } from "react";
import { SyncContext } from "./machines/sync";
import { queryClient } from "./query-client";
import { router } from "./router";

const Main = () => {
    const syncActor = SyncContext.useActorRef();

    return <RouterProvider router={router} context={{ syncActor }} />;
};

const FullApp: FC<{
    user: string;
    orgUnit: string;
}> = ({ user, orgUnit }) => {
    const engine = useDataEngine();

    const { message } = App.useApp();

    return (
        <QueryClientProvider client={queryClient}>
            <SyncContext.Provider
                options={{
                    input: {
                        engine,
                        orgUnit,
                        user,

                        message,
                    },
                }}
                key={`${user}${orgUnit}`}
            >
                <Main />
            </SyncContext.Provider>
        </QueryClientProvider>
    );
};
const MyApp: FC = () => {
    const userInfo = useCurrentUserInfo();

    if (isEmpty(userInfo) || userInfo.organisationUnits.length > 1) {
        return (
            <Typography.Text>
                No user found or user assigned multiple organisations
            </Typography.Text>
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
                    motion: false,
                },
            }}
        >
            <App>
                <FullApp orgUnit={orgUnit} user={user} />
            </App>
        </ConfigProvider>
    );
};

export default MyApp;
