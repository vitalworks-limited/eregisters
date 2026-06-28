import Dexie, { Table } from "dexie";
import { APP_VERSION, BUILD_HASH, BUILD_TIME } from "../version";

/**
 * Local sync telemetry.
 *
 * Why: when a facility/device misbehaves we currently have no way to
 * see how/when their sync ran. Storing a small ring buffer of telemetry
 * locally lets support download diagnostics from the device.
 */
export type SyncMode =
    | "metadata"
    | "data-pull"
    | "data-push"
    | "events-pull"
    | "delete"
    | "full"
    | "manual";

export interface SyncFailure {
    at: string;
    endpoint?: string;
    status?: number;
    message: string;
}

export type SyncTrigger = "manual" | "scheduled";

export interface SyncTelemetry {
    syncId: string;
    userUid?: string;
    username?: string;
    orgUnitUid?: string;
    appVersion?: string;
    startedAt: string;
    finishedAt?: string;
    mode: SyncMode;
    /**
     * How the sync was initiated. `manual` covers the sync popover and
     * admin-page buttons; `scheduled` covers the timer, app-start
     * bootstrap, and network-reconnect flows.
     */
    trigger?: SyncTrigger;
    pagesPulled?: number;
    trackedEntitiesPulled?: number;
    eventsPulled?: number;
    payloadBytesApprox?: number;
    trackerPosts?: number;
    asyncJobsCreated?: number;
    failures?: SyncFailure[];
}

/**
 * One-shot trigger marker.
 *
 * Why: the state machine fans out a single user event into multiple
 * actors (data-pull, events-pull, etc.). Rather than threading
 * `trigger` through every transition, UI dispatchers call
 * `markNextSyncManual()` immediately before `syncActor.send(...)`. The
 * actor consumes it via `consumeNextSyncTrigger()` at the top of its
 * run, so the very next sync flow is labelled `manual` even if it's
 * queued. Anything fired by the scheduler doesn't call the marker and
 * defaults to `scheduled`.
 */
let pendingManualTrigger = false;
let pendingManualTriggerExpiresAt = 0;
const MANUAL_TRIGGER_TTL_MS = 30_000;

export function markNextSyncManual(): void {
    pendingManualTrigger = true;
    pendingManualTriggerExpiresAt = Date.now() + MANUAL_TRIGGER_TTL_MS;
}

export function consumeNextSyncTrigger(): SyncTrigger {
    if (pendingManualTrigger && Date.now() < pendingManualTriggerExpiresAt) {
        pendingManualTrigger = false;
        return "manual";
    }
    pendingManualTrigger = false;
    return "scheduled";
}

class TelemetryDatabase extends Dexie {
    syncTelemetry!: Table<SyncTelemetry, string>;

    constructor() {
        super("MOHRegister_SyncTelemetry");
        this.version(1).stores({
            syncTelemetry: "syncId,startedAt,mode",
        });
    }
}

let telemetryDb: TelemetryDatabase | null = null;
function getDb(): TelemetryDatabase {
    if (!telemetryDb) {
        telemetryDb = new TelemetryDatabase();
    }
    return telemetryDb;
}

export const MAX_TELEMETRY_RECORDS = 20;

export function newSyncId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function recordTelemetry(entry: SyncTelemetry): Promise<void> {
    try {
        await getDb().syncTelemetry.put(entry);
        const all = await getDb()
            .syncTelemetry.orderBy("startedAt")
            .reverse()
            .toArray();
        const excess = all.slice(MAX_TELEMETRY_RECORDS);
        if (excess.length > 0) {
            await getDb().syncTelemetry.bulkDelete(excess.map((e) => e.syncId));
        }
    } catch {
        // Telemetry must never break clinical workflows.
    }
}

/**
 * In-flight builder so callers can incrementally update counters.
 */
export class SyncTelemetryBuilder {
    private record: SyncTelemetry;

    constructor(mode: SyncMode, partial: Partial<SyncTelemetry> = {}) {
        this.record = {
            syncId: partial.syncId ?? newSyncId(),
            startedAt: partial.startedAt ?? new Date().toISOString(),
            mode,
            appVersion: partial.appVersion ?? APP_VERSION,
            ...partial,
        };
    }

    addFailure(failure: SyncFailure) {
        this.record.failures = [...(this.record.failures ?? []), failure];
        return this;
    }

    set<K extends keyof SyncTelemetry>(key: K, value: SyncTelemetry[K]) {
        this.record[key] = value;
        return this;
    }

    incr(
        key:
            | "pagesPulled"
            | "trackedEntitiesPulled"
            | "eventsPulled"
            | "payloadBytesApprox"
            | "trackerPosts"
            | "asyncJobsCreated",
        by = 1,
    ) {
        this.record[key] = (this.record[key] ?? 0) + by;
        return this;
    }

    snapshot(): SyncTelemetry {
        return { ...this.record };
    }

    async finish(extra: Partial<SyncTelemetry> = {}): Promise<SyncTelemetry> {
        this.record = {
            ...this.record,
            ...extra,
            finishedAt: new Date().toISOString(),
        };
        await recordTelemetry(this.record);
        return this.record;
    }
}

export async function listTelemetry(): Promise<SyncTelemetry[]> {
    try {
        return await getDb()
            .syncTelemetry.orderBy("startedAt")
            .reverse()
            .toArray();
    } catch {
        return [];
    }
}

/**
 * Returns a JSON Blob suitable for a "Download sync diagnostics" button.
 *
 * Includes build identity (appVersion / buildHash / buildTime) so
 * support can tell which version produced the report.
 */
export async function downloadSyncDiagnostics(): Promise<Blob> {
    const records = await listTelemetry();
    return new Blob(
        [
            JSON.stringify(
                {
                    generatedAt: new Date().toISOString(),
                    appVersion: APP_VERSION,
                    buildHash: BUILD_HASH,
                    buildTime: BUILD_TIME,
                    records,
                },
                null,
                2,
            ),
        ],
        { type: "application/json" },
    );
}

export async function clearTelemetry(): Promise<void> {
    try {
        await getDb().syncTelemetry.clear();
    } catch {
        // ignore
    }
}
