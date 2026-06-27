import type { useDataEngine } from "@dhis2/app-runtime";
import {
    adminConfig,
    DEFAULT_KILL_SWITCH,
    DEFAULT_SYNC_CONFIG,
    KillSwitch,
    SyncConfig,
} from "./adminConfig";

/**
 * Cache for the admin-controlled dataStore config.
 *
 * The sync machine consults the cached values synchronously before each
 * pull/push. A background loader refreshes them every 5 min when
 * online; the very first load runs on app start.
 */

interface Snapshot {
    syncConfig: SyncConfig;
    killSwitch: KillSwitch;
    loadedAt: number;
}

const KEY = "eregisters.adminConfigCache";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let snapshot: Snapshot | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function readPersisted(): Snapshot | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return null;
        return JSON.parse(raw) as Snapshot;
    } catch {
        return null;
    }
}

function persist(snap: Snapshot) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(KEY, JSON.stringify(snap));
    } catch {
        // localStorage may be full / unavailable; the in-memory
        // snapshot still works for the rest of the session.
    }
}

export function getCachedAdminConfig(): Snapshot {
    if (!snapshot) {
        snapshot = readPersisted() ?? {
            syncConfig: DEFAULT_SYNC_CONFIG,
            killSwitch: DEFAULT_KILL_SWITCH,
            loadedAt: 0,
        };
    }
    return snapshot;
}

export async function refreshAdminConfig(
    engine: ReturnType<typeof useDataEngine>,
): Promise<Snapshot> {
    const [syncConfig, killSwitch] = await Promise.all([
        adminConfig.getSyncConfig(engine),
        adminConfig.getKillSwitch(engine),
    ]);
    snapshot = {
        syncConfig,
        killSwitch,
        loadedAt: Date.now(),
    };
    persist(snapshot);
    return snapshot;
}

export function startAdminConfigPolling(
    engine: ReturnType<typeof useDataEngine>,
): () => void {
    if (pollTimer) {
        return () => stopAdminConfigPolling();
    }
    refreshAdminConfig(engine).catch(() => undefined);
    pollTimer = setInterval(() => {
        refreshAdminConfig(engine).catch(() => undefined);
    }, REFRESH_INTERVAL_MS);
    return () => stopAdminConfigPolling();
}

export function stopAdminConfigPolling(): void {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}
