import { App } from "antd";
import React from "react";
import {
    onUpdateAvailable,
    startUpdatePolling,
    stopUpdatePolling,
} from "./updateChecker";
import { startSafeRefreshFlow } from "./safeRefresh";
import { BUILD_HASH, VersionInfo } from "../version";

/**
 * Mount once at the top of the React tree to:
 *   1. Poll `version.json` every 5 minutes for a new build,
 *   2. When detected, surface a notification, pause heavy sync (the
 *      sync machine reads `isUpdateAvailable()` and bails),
 *   3. Trigger the safe refresh flow, deferring if unsaved data is
 *      present.
 *
 * Phase 17 implementation. Safe in tests: if `fetch` is not available
 * (e.g. jsdom without polyfill), polling silently no-ops.
 */
export function UpdateWatcher() {
    const { message, modal } = App.useApp();

    React.useEffect(() => {
        // In dev (`pnpm start`) BUILD_HASH is "local" but public/version.json
        // carries the real git hash, so polling would trigger an immediate
        // reload loop. Skip polling entirely outside production builds.
        if (BUILD_HASH === "local") return;
        const stop = startUpdatePolling({});
        const off = onUpdateAvailable((remote: VersionInfo) => {
            startSafeRefreshFlow(remote, {
                notify: (m) => {
                    message.info({ content: m, duration: 6 });
                },
                notifyBlocking: (m) => {
                    modal.warning({
                        title: "App update available",
                        content: m,
                        okText: "OK",
                    });
                },
                hasUnsavedData: () => {
                    // The form pages set this flag when a form is dirty.
                    if (typeof window === "undefined") return false;
                    return Boolean(
                        (window as unknown as { __eregistersUnsaved?: boolean })
                            .__eregistersUnsaved,
                    );
                },
            }).catch((err) => console.error("[update-watcher]", err));
        });

        return () => {
            off();
            stop();
            stopUpdatePolling();
        };
    }, [message, modal]);

    return null;
}
