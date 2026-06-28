import type { useDataEngine } from "@dhis2/app-runtime";

/**
 * Admin-controlled runtime config stored in the DHIS2 dataStore. The
 * Admin UI is the only writer; every client reads it lazily on app
 * start and refreshes every five minutes when online.
 *
 * Namespace: `eregisters-admin`
 * Keys: `sync-config`, `kill-switch`, `broadcast`
 */

type Engine = ReturnType<typeof useDataEngine>;

export const NAMESPACE = "eregisters-admin";

export interface TimeWindow {
    /** Days of week, 0=Sunday … 6=Saturday. */
    daysOfWeek: number[];
    /** Inclusive lower bound, local time, HH:mm. */
    fromLocal: string;
    /** Exclusive upper bound, local time, HH:mm. */
    toLocal: string;
    /** Human-readable label. */
    label?: string;
}

export interface SyncConfig {
    /** When non-empty, sync only runs inside one of these windows. */
    allowedWindows: TimeWindow[];
    /** When matched, sync is blocked. Evaluated after allowedWindows. */
    blockedWindows: TimeWindow[];
    /** Additional random delay added on top of the scheduler hash. */
    jitterMinutes: number;
    /**
     * When false, even users on this build won't post telemetry to the
     * dataStore. Local telemetry still works for the support download.
     */
    telemetryEnabled: boolean;
    /** Optional banner/modal shown to all users while non-empty. */
    notice?: string;
    /**
     * How the notice surfaces in the client.
     * - `banner` (default): slim dismissible bar at the top of the app.
     * - `modal`: blocking-style popover until the user clicks the action.
     */
    noticeMode?: "banner" | "modal";
    /**
     * When true, the modal has no close X and the mask cannot dismiss
     * it — the user must click the action button to acknowledge.
     * Only applies when `noticeMode === "modal"`.
     */
    noticeRequiresAck?: boolean;
    /**
     * Label for the action button. Defaults to a kind-specific label.
     */
    noticeActionLabel?: string;
    /**
     * URL opened in a new tab when `noticeAction === "openLink"`.
     */
    noticeActionHref?: string;
    /**
     * What the action button does when clicked. `dismiss` simply closes
     * the notice (default). The other kinds run safe in-app operations
     * before closing — e.g. refresh the bundle, save the active draft,
     * or kick a manual sync.
     */
    noticeAction?:
        | "dismiss"
        | "openLink"
        | "refresh"
        | "saveRefresh"
        | "syncMetadata"
        | "syncData"
        | "syncAll";
    /** Last updated timestamp (set by the writer). */
    updatedAt?: string;
    /** Username of the writer. */
    updatedBy?: string;
}

export interface KillSwitch {
    pauseAllSync: boolean;
    reason?: string;
    setAt?: string;
    setBy?: string;
}

export interface BroadcastConfig {
    buildHash: string;
    severity: "info" | "forced";
    releasedAt: string;
    releasedBy?: string;
    message?: string;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
    allowedWindows: [],
    blockedWindows: [],
    jitterMinutes: 7,
    telemetryEnabled: true,
};

export const DEFAULT_KILL_SWITCH: KillSwitch = {
    pauseAllSync: false,
};

async function getKey<T>(
    engine: Engine,
    key: string,
    fallback: T,
): Promise<T> {
    try {
        const result = (await engine.query({
            value: {
                resource: `dataStore/${NAMESPACE}/${key}`,
            },
        })) as { value?: T };
        return (result.value as T) ?? fallback;
    } catch {
        return fallback;
    }
}

async function putKey<T>(
    engine: Engine,
    key: string,
    value: T,
): Promise<void> {
    const data = value as unknown as Record<string, unknown>;
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await engine.mutate({
            type: "update",
            resource: `dataStore/${NAMESPACE}/${key}`,
            data,
        } as any);
    } catch {
        // First-time write needs a create instead.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await engine.mutate({
            type: "create",
            resource: `dataStore/${NAMESPACE}/${key}`,
            data,
        } as any);
    }
}

export const adminConfig = {
    getSyncConfig: (engine: Engine) =>
        getKey<SyncConfig>(engine, "sync-config", DEFAULT_SYNC_CONFIG),
    setSyncConfig: (engine: Engine, value: SyncConfig) =>
        putKey<SyncConfig>(engine, "sync-config", value),
    getKillSwitch: (engine: Engine) =>
        getKey<KillSwitch>(engine, "kill-switch", DEFAULT_KILL_SWITCH),
    setKillSwitch: (engine: Engine, value: KillSwitch) =>
        putKey<KillSwitch>(engine, "kill-switch", value),
    getBroadcast: (engine: Engine) =>
        getKey<BroadcastConfig | undefined>(engine, "broadcast", undefined),
    setBroadcast: (engine: Engine, value: BroadcastConfig) =>
        putKey<BroadcastConfig>(engine, "broadcast", value),
};

/**
 * Client-side enforcement: returns true when sync is currently
 * permitted by the admin config (no kill switch, inside allowed
 * window, not inside a blocked window).
 */
export function isSyncAllowedByAdmin(
    now: Date,
    syncConfig: SyncConfig,
    killSwitch: KillSwitch,
): { allowed: boolean; reason?: string } {
    if (killSwitch.pauseAllSync) {
        return {
            allowed: false,
            reason: killSwitch.reason ?? "Sync paused by admin",
        };
    }
    if (
        syncConfig.allowedWindows.length > 0 &&
        !syncConfig.allowedWindows.some((w) => isInWindow(now, w))
    ) {
        return {
            allowed: false,
            reason: "Outside the allowed sync window",
        };
    }
    const blocked = syncConfig.blockedWindows.find((w) => isInWindow(now, w));
    if (blocked) {
        return {
            allowed: false,
            reason: blocked.label ?? "Inside a blocked sync window",
        };
    }
    return { allowed: true };
}

export function isInWindow(now: Date, window: TimeWindow): boolean {
    const day = now.getDay();
    if (window.daysOfWeek.length > 0 && !window.daysOfWeek.includes(day)) {
        return false;
    }
    const minutes = now.getHours() * 60 + now.getMinutes();
    const [fromH, fromM] = parseTime(window.fromLocal);
    const [toH, toM] = parseTime(window.toLocal);
    const from = fromH * 60 + fromM;
    const to = toH * 60 + toM;
    if (from <= to) {
        return minutes >= from && minutes < to;
    }
    // Wraps midnight (e.g. 22:00 → 06:00).
    return minutes >= from || minutes < to;
}

function parseTime(value: string): [number, number] {
    const [h, m] = value.split(":").map((v) => parseInt(v, 10));
    return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
}
