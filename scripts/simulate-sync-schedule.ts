/* eslint-disable no-console */
/**
 * Simulate the facility/user/device sync schedule.
 *
 * Usage:
 *   pnpm exec ts-node scripts/simulate-sync-schedule.ts
 *   node --import tsx scripts/simulate-sync-schedule.ts
 *
 * Why this exists: the production sync storm (25 Jun 2026) was caused by
 * hundreds of facilities all starting background sync at the same time.
 * This script demonstrates that, after the scheduling/jitter fix, sync
 * starts are spread across the working day.
 *
 * Output (CSV):
 *   facilityUid,userUid,deviceId,slot,scheduledSyncTime,jitterMinutes
 */

import {
    FACILITY_SYNC_MAX_JITTER_MINUTES,
    FACILITY_SYNC_SLOT_BASE_HOUR,
    FACILITY_SYNC_SLOT_COUNT,
} from "../src/sync/config";
import { getFacilitySyncSlot, hashString } from "../src/sync/scheduler";

const NUM_FACILITIES = parseInt(process.env.SIM_FACILITIES ?? "100", 10);
const USERS_PER_FACILITY = parseInt(process.env.SIM_USERS ?? "3", 10);

const baseDate = new Date();
baseDate.setHours(0, 0, 0, 0);

console.log("facilityUid,userUid,deviceId,slot,scheduledSyncTime,jitterMinutes");

const slotCounts = new Array<number>(FACILITY_SYNC_SLOT_COUNT).fill(0);

for (let f = 0; f < NUM_FACILITIES; f++) {
    const facilityUid = `facility-${f.toString(36).padStart(3, "0")}`;
    const slot = getFacilitySyncSlot(facilityUid, FACILITY_SYNC_SLOT_COUNT);
    for (let u = 0; u < USERS_PER_FACILITY; u++) {
        const userUid = `user-${f}-${u}`;
        const deviceId = `device-${f}-${u}`;
        const jitterSeed = `${facilityUid}:${userUid}:${deviceId}`;
        const jitter =
            hashString(jitterSeed) % FACILITY_SYNC_MAX_JITTER_MINUTES;
        const scheduled = new Date(baseDate);
        scheduled.setHours(
            FACILITY_SYNC_SLOT_BASE_HOUR + slot,
            jitter,
            0,
            0,
        );
        slotCounts[slot] += 1;
        console.log(
            [
                facilityUid,
                userUid,
                deviceId,
                slot,
                scheduled.toISOString(),
                jitter,
            ].join(","),
        );
    }
}

console.error("\n# Slot distribution (devices per slot):");
slotCounts.forEach((count, idx) => {
    const start = FACILITY_SYNC_SLOT_BASE_HOUR + idx;
    console.error(
        `slot ${idx} (${String(start).padStart(2, "0")}:00-${String(start + 1).padStart(2, "0")}:00): ${count} devices`,
    );
});
