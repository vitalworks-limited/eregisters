import {
    useConfig,
    useCurrentUserInfo,
    useDataEngine,
} from "@dhis2/app-runtime";
import { RouterProvider } from "@tanstack/react-router";
import { App, ConfigProvider, Typography } from "antd";
import { isEmpty } from "lodash";
import React, { FC, useEffect, useState } from "react";
import { ErrorBoundary } from "./components/error-boundary";
import { SyncContext } from "./machines/sync";
import { router } from "./router";
import { requestPersistentStorage } from "./sync/persistentStorage";
import { darkTheme, lightTheme } from "./theme";
import { UpdateWatcher } from "./update/useUpdateWatcher";
import { redirectByAuthorities } from "./utils/utils";

const THEME_KEY = "eregisters.theme";
type ThemeMode = "light" | "dark";

export const ThemeContext = React.createContext<{
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
}>({ mode: "light", setMode: () => undefined });
const Main = () => {
    const syncActor = SyncContext.useActorRef();
    useEffect(() => {
        // Ask the browser to keep our IndexedDB data even under storage
        // pressure. Granted automatically for installed PWAs / frequently
        // visited origins. Failures are silent — the worst case is the
        // existing behaviour.
        requestPersistentStorage().catch(() => undefined);
    }, []);
    return (
        <ErrorBoundary>
            <UpdateWatcher />
            <RouterProvider router={router} context={{ syncActor }} />
        </ErrorBoundary>
    );
};

const FullApp: FC<{
    user: string;
    orgUnit: string;
}> = ({ user, orgUnit }) => {
    const engine = useDataEngine();
    const userInfo = useCurrentUserInfo();
    const { baseUrl } = useConfig();
    const { message } = App.useApp();

    redirectByAuthorities(userInfo?.authorities ?? [], baseUrl);

    return (
        <SyncContext.Provider
            options={{
                input: {
                    engine,
                    orgUnit,
                    user,
                    userInfo,
                    message,
                },
            }}
            key={`${user}${orgUnit}`}
        >
            <Main />
        </SyncContext.Provider>
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
        <ThemedShell>
            <FullApp orgUnit={orgUnit} user={user} />
        </ThemedShell>
    );
};

const ThemedShell: FC<{ children: React.ReactNode }> = ({ children }) => {
    const [mode, setMode] = useState<ThemeMode>(() => {
        if (typeof window === "undefined") return "light";
        const saved = window.localStorage.getItem(THEME_KEY);
        return saved === "dark" ? "dark" : "light";
    });
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(THEME_KEY, mode);
        }
    }, [mode]);
    return (
        <ThemeContext.Provider value={{ mode, setMode }}>
            <ConfigProvider theme={mode === "dark" ? darkTheme : lightTheme}>
                <App>{children}</App>
            </ConfigProvider>
        </ThemeContext.Provider>
    );
};

export default MyApp;
