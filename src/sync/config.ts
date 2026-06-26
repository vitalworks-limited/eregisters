/**
 * Sync configuration constants for the eRegisters app.
 *
 * Why: production logs (25 Jun 2026) showed the app pulling full nested
 * tracker payloads (`fields=*,enrollments[*,events[*]]`) at `pageSize=100`,
 * and pushing tracker imports synchronously (`async=false`), which generated
 * a working-hours sync storm. These constants enforce safe, minimal sync.
 */

export const PROGRAM_UID = "ueBhWkWll5v";

/**
 * Minimal tracked entity fields used for routine incremental pulls.
 *
 * Notes:
 *   - never use `*`
 *   - never nest `events[*]` here (events have their own incremental pull)
 *   - enrollments are included shallowly so the app can render the
 *     enrollment list without an extra round-trip
 */
export const TRACKED_ENTITY_SYNC_FIELDS = [
    "trackedEntity",
    "trackedEntityType",
    "orgUnit",
    "createdAt",
    "updatedAt",
    "inactive",
    "deleted",
    "potentialDuplicate",
    "attributes[attribute,value,updatedAt,createdAt]",
    "enrollments[enrollment,program,trackedEntity,orgUnit,status,enrolledAt,occurredAt,createdAt,updatedAt,followUp,deleted,attributes[attribute,value,updatedAt,createdAt]]",
].join(",");

/**
 * Minimal event fields used for routine incremental pulls via the
 * tracker/events endpoint.
 */
export const EVENT_SYNC_FIELDS = [
    "event",
    "program",
    "programStage",
    "orgUnit",
    "enrollment",
    "trackedEntity",
    "status",
    "occurredAt",
    "scheduledAt",
    "createdAt",
    "updatedAt",
    "followUp",
    "deleted",
    "dataValues[dataElement,value,updatedAt,createdAt]",
].join(",");

/** Default page size for tracked entity pulls. Never exceed this for routine sync. */
export const DEFAULT_TRACKER_PULL_PAGE_SIZE = 25;
/** Absolute upper bound for tracked entity page size in normal sync. */
export const MAX_TRACKER_PULL_PAGE_SIZE = 50;
/** Default page size for the separate events pull. */
export const DEFAULT_EVENT_PULL_PAGE_SIZE = 50;
/** Absolute upper bound for event page size. */
export const MAX_EVENT_PULL_PAGE_SIZE = 100;

/** Bounded lookback for the first sync when no watermark is stored. */
export const INITIAL_LOOKBACK_HOURS = 24;

/** Above this size, tracker pushes must use async=true. */
export const BULK_IMPORT_THRESHOLD = 10;

/** Delete batching defaults. */
export const DELETE_BATCH_SIZE = 20;
export const DELETE_BATCH_DELAY_MS = 1000;

/** Sync slots (one hour each, 08:00 → 16:00). */
export const FACILITY_SYNC_SLOT_COUNT = 8;
export const FACILITY_SYNC_SLOT_BASE_HOUR = 8;
export const FACILITY_SYNC_MAX_JITTER_MINUTES = 45;

/** Async tracker job polling. */
export const TRACKER_JOB_POLL_INTERVAL_MS = 7_000;
export const TRACKER_JOB_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export const SYNC_CONFIG = {
    programUid: PROGRAM_UID,
    trackedEntityFields: TRACKED_ENTITY_SYNC_FIELDS,
    eventFields: EVENT_SYNC_FIELDS,
    defaultTrackerPullPageSize: DEFAULT_TRACKER_PULL_PAGE_SIZE,
    maxTrackerPullPageSize: MAX_TRACKER_PULL_PAGE_SIZE,
    defaultEventPullPageSize: DEFAULT_EVENT_PULL_PAGE_SIZE,
    maxEventPullPageSize: MAX_EVENT_PULL_PAGE_SIZE,
    initialLookbackHours: INITIAL_LOOKBACK_HOURS,
    bulkImportThreshold: BULK_IMPORT_THRESHOLD,
    deleteBatchSize: DELETE_BATCH_SIZE,
    deleteBatchDelayMs: DELETE_BATCH_DELAY_MS,
    facilitySyncSlotCount: FACILITY_SYNC_SLOT_COUNT,
    facilitySyncSlotBaseHour: FACILITY_SYNC_SLOT_BASE_HOUR,
    facilitySyncMaxJitterMinutes: FACILITY_SYNC_MAX_JITTER_MINUTES,
    trackerJobPollIntervalMs: TRACKER_JOB_POLL_INTERVAL_MS,
    trackerJobPollTimeoutMs: TRACKER_JOB_POLL_TIMEOUT_MS,
};

export type SyncMode =
    | "incremental"
    | "initial-bounded"
    | "full-manual-admin";

/**
 * Resolve the value to send as `updatedAfter` on a tracker pull.
 *
 *   - full-manual-admin → no filter (explicit admin/support full sync)
 *   - lastDataPull set  → use it (normal incremental)
 *   - otherwise         → bounded lookback (initial sync)
 */
export function resolveUpdatedAfter(
    lastDataPull?: string,
    mode: SyncMode = "incremental",
): string | undefined {
    if (mode === "full-manual-admin") {
        return undefined;
    }
    if (lastDataPull) {
        return lastDataPull;
    }
    const lookbackMs = INITIAL_LOOKBACK_HOURS * 60 * 60 * 1000;
    return new Date(Date.now() - lookbackMs).toISOString();
}

/** Returns true if the response status code/error means we should not retry now. */
export function isRetriableServerError(status?: number | string): boolean {
    if (status === undefined || status === null) return false;
    const code = typeof status === "string" ? parseInt(status, 10) : status;
    return code === 429 || code === 500 || code === 502 || code === 503 || code === 504;
}
