import { getSyncDelayMs } from "../scheduler";

/**
 * Integration-style simulation: 100 facilities × 3 users open the app
 * within the same hour. The fix must spread their scheduled syncs
 * across the day instead of starting them all at once.
 */
describe("sync schedule simulation", () => {
    test("100 facilities * 3 users distribute across all slots", () => {
        const baseHour = 8;
        const slots = 8;
        const now = new Date();
        now.setHours(baseHour, 0, 0, 0);

        const slotCounts = new Array<number>(slots).fill(0);
        for (let f = 0; f < 100; f++) {
            const ou = `facility-${f.toString(36)}`;
            for (let u = 0; u < 3; u++) {
                const delay = getSyncDelayMs({
                    orgUnitUid: ou,
                    userUid: `user-${u}`,
                    deviceId: `device-${u}`,
                    now,
                    baseHour,
                    slots,
                    maxJitterMinutes: 45,
                });
                const scheduled = new Date(now.getTime() + delay);
                const slot = scheduled.getHours() - baseHour;
                if (slot >= 0 && slot < slots) {
                    slotCounts[slot] += 1;
                }
            }
        }

        // Every slot should receive at least one device.
        for (const count of slotCounts) {
            expect(count).toBeGreaterThan(0);
        }
        // No single slot should dominate (>50% of facilities).
        const max = Math.max(...slotCounts);
        expect(max).toBeLessThan(300 * 0.5);
    });
});
