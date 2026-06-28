import {
    FACILITY_SYNC_MAX_JITTER_MINUTES,
    FACILITY_SYNC_SLOT_BASE_HOUR,
    FACILITY_SYNC_SLOT_COUNT,
} from "./config";

/**
 * Stable, deterministic 32-bit string hash.
 *
 * Used so that a given facility/user/device combination always lands in
 * the same sync slot and uses the same jitter, while different
 * facilities/users/devices spread out across slots.
 */
export function hashString(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash;
}

/**
 * Returns the slot index `[0, slots)` for a given facility UID.
 *
 * Why: production showed every facility starting a heavy sync at the
 * top of the working hour, overloading DHIS2. Slotting spreads the
 * scheduled background sync across the working day.
 */
export function getFacilitySyncSlot(
    orgUnitUid: string,
    slots: number = FACILITY_SYNC_SLOT_COUNT,
): number {
    if (slots <= 0) return 0;
    return hashString(orgUnitUid) % slots;
}

export interface SyncDelayParams {
    orgUnitUid: string;
    userUid?: string;
    deviceId?: string;
    /** Reference clock used to compute the absolute scheduled time. Default now. */
    now?: Date;
    /** Number of slots in the day. */
    slots?: number;
    /** First slot starts at this local hour (24h). */
    baseHour?: number;
    /** Max jitter inside a slot. */
    maxJitterMinutes?: number;
}

/**
 * Computes the delay (ms from `now`) until this facility/user/device's
 * next scheduled background sync.
 *
 * The slot defines a one-hour window starting at
 * `baseHour + slot`. Jitter (0 - maxJitterMinutes) is added inside the
 * window so devices in the same slot don't all start at the same minute.
 *
 * If the scheduled time has already passed today, the next occurrence is
 * the same time tomorrow.
 */
export function getSyncDelayMs(params: SyncDelayParams): number {
    const slotCount = params.slots ?? FACILITY_SYNC_SLOT_COUNT;
    const baseHour = params.baseHour ?? FACILITY_SYNC_SLOT_BASE_HOUR;
    const maxJitter =
        params.maxJitterMinutes ?? FACILITY_SYNC_MAX_JITTER_MINUTES;

    const slot = getFacilitySyncSlot(params.orgUnitUid, slotCount);
    const jitterSeed = `${params.orgUnitUid}:${params.userUid ?? ""}:${
        params.deviceId ?? ""
    }`;
    const jitterMinutes = maxJitter > 0 ? hashString(jitterSeed) % maxJitter : 0;

    const now = params.now ?? new Date();
    const scheduled = new Date(now);
    scheduled.setHours(baseHour + slot, jitterMinutes, 0, 0);

    let delay = scheduled.getTime() - now.getTime();
    if (delay < 0) {
        // Window already passed today; schedule for tomorrow's window.
        delay += 24 * 60 * 60 * 1000;
    }
    return delay;
}

/**
 * Returns the next scheduled sync time as a Date.
 */
export function getNextScheduledSyncAt(params: SyncDelayParams): Date {
    const now = params.now ?? new Date();
    return new Date(now.getTime() + getSyncDelayMs({ ...params, now }));
}
