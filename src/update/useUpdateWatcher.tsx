import { App } from "antd";
import React from "react";
import {
    onUpdateAvailable,
    startUpdatePolling,
    stopUpdatePolling,
} from "./updateChecker";
import { startSafeRefreshFlow } from "./safeRefresh";
import { APP_NAME, APP_VERSION, BUILD_HASH, BUILD_TIME, VersionInfo } from "../version";
import {
    getCachedAdminConfig,
    subscribeAdminConfig,
} from "../sync/adminConfigCache";
import { BroadcastConfig } from "../sync/adminConfig";

/** Don't re-fire a toast/modal for the same admin broadcast on every cache refresh. */
const seenBroadcastIds = new Set<string>();

function broadcastId(b: BroadcastConfig): string {
    return `${b.buildHash}@${b.releasedAt}`;
}

function broadcastToVersionInfo(b: BroadcastConfig): VersionInfo {
    return {
        app: APP_NAME,
        version: APP_VERSION,
        buildHash: b.buildHash,
        buildTime: b.releasedAt,
    };
}

/**
 * Mount once at the top of the React tree to:
 *   1. Poll `version.json` every 5 minutes for a new build,
 *   2. Subscribe to the admin dataStore broadcast key,
 *   3. When detected, surface a notification, pause heavy sync, and
 *      trigger the safe refresh flow. Forced broadcasts auto-save
 *      drafts and reload regardless of unsaved state.
 */
export function UpdateWatcher() {
    const { message, modal } = App.useApp();

    React.useEffect(() => {
        const runFlow = (remote: VersionInfo, severity: "info" | "forced") => {
            startSafeRefreshFlow(remote, {
                severity,
                notify: (m) => {
                    message.info({ content: m, duration: 6 });
                },
                notifyBlocking: (m) => {
                    modal.warning({
                        title:
                            severity === "forced"
                                ? "Urgent app update"
                                : "App update available",
                        content: m,
                        okText: "OK",
                    });
                },
                hasUnsavedData: () => {
                    if (typeof window === "undefined") return false;
                    return Boolean(
                        (window as unknown as { __eregistersUnsaved?: boolean })
                            .__eregistersUnsaved,
                    );
                },
                saveDraftIfPossible: () => {
                    if (typeof window === "undefined") return false;
                    const win = window as unknown as {
                        __eregistersSaveDraft?: () => boolean | Promise<boolean>;
                    };
                    if (typeof win.__eregistersSaveDraft === "function") {
                        return win.__eregistersSaveDraft();
                    }
                    return false;
                },
            }).catch((err) => console.error("[update-watcher]", err));
        };

        const handleBroadcast = (broadcast?: BroadcastConfig) => {
            if (!broadcast || !broadcast.buildHash) return;
            // Admin published the build the client is already running.
            if (broadcast.buildHash === BUILD_HASH) return;
            // Ignore broadcasts older than the build the client booted with.
            try {
                if (
                    BUILD_TIME &&
                    new Date(BUILD_TIME).getTime() >
                        new Date(broadcast.releasedAt).getTime()
                ) {
                    return;
                }
            } catch {
                // ignore parse errors and continue
            }
            const id = broadcastId(broadcast);
            if (seenBroadcastIds.has(id)) return;
            seenBroadcastIds.add(id);
            runFlow(broadcastToVersionInfo(broadcast), broadcast.severity);
        };

        // Fire once for whatever was already cached when we mounted, then
        // subscribe to future refreshes.
        handleBroadcast(getCachedAdminConfig().broadcast);
        const offBroadcast = subscribeAdminConfig((snap) => {
            handleBroadcast(snap.broadcast);
        });

        // In dev (`pnpm start`) BUILD_HASH is "local" but
        // public/version.json carries the real git hash, so version-file
        // polling would trigger an immediate reload loop. The admin
        // broadcast subscription above still works in dev.
        const stop =
            BUILD_HASH === "local"
                ? () => undefined
                : startUpdatePolling({});
        const off = onUpdateAvailable((remote: VersionInfo) => {
            runFlow(remote, "info");
        });

        return () => {
            offBroadcast();
            off();
            stop();
            stopUpdatePolling();
        };
    }, [message, modal]);

    return null;
}
