import {
    getFacilitySyncSlot,
    getSyncDelayMs,
    hashString,
} from "../scheduler";

describe("scheduler", () => {
    test("hashString is deterministic", () => {
        expect(hashString("orgA")).toBe(hashString("orgA"));
        expect(hashString("orgA")).not.toBe(hashString("orgB"));
    });

    test("facility sync slot is stable for a given orgUnit UID", () => {
        const ou = "QkLcaTSITvm";
        const slot = getFacilitySyncSlot(ou, 8);
        expect(slot).toBe(getFacilitySyncSlot(ou, 8));
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(slot).toBeLessThan(8);
    });

    test("jitter differs across devices/users for the same facility", () => {
        const orgUnitUid = "QkLcaTSITvm";
        const now = new Date("2026-06-26T07:00:00.000Z");
        const a = getSyncDelayMs({
            orgUnitUid,
            userUid: "userA",
            deviceId: "deviceA",
            now,
        });
        const b = getSyncDelayMs({
            orgUnitUid,
            userUid: "userB",
            deviceId: "deviceB",
            now,
        });
        // It is statistically extremely unlikely for two devices to share
        // both the slot AND the same jitter minute. With a fixed seed
        // these particular values must differ.
        expect(a).not.toBe(b);
    });

    test("same orgUnit + user + device returns the same delay", () => {
        const params = {
            orgUnitUid: "ouX",
            userUid: "u1",
            deviceId: "d1",
            now: new Date("2026-06-26T05:00:00.000Z"),
        };
        expect(getSyncDelayMs(params)).toBe(getSyncDelayMs(params));
    });

    test("slot 0 lands inside the base hour (08:00-09:00 local)", () => {
        // Find a UID that hashes to slot 0.
        let uid = "";
        for (let i = 0; i < 100; i++) {
            const candidate = `seed-${i}`;
            if (getFacilitySyncSlot(candidate, 8) === 0) {
                uid = candidate;
                break;
            }
        }
        expect(uid).not.toBe("");

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const delayMs = getSyncDelayMs({
            orgUnitUid: uid,
            userUid: "u",
            deviceId: "d",
            now,
            baseHour: 8,
            maxJitterMinutes: 60,
        });
        const scheduled = new Date(now.getTime() + delayMs);
        expect(scheduled.getHours()).toBe(8);
    });

    test("delay rolls over to next day if window already passed", () => {
        const orgUnitUid = "ouLate";
        const now = new Date();
        now.setHours(23, 59, 0, 0);
        const delay = getSyncDelayMs({
            orgUnitUid,
            userUid: "u",
            deviceId: "d",
            now,
            baseHour: 8,
        });
        expect(delay).toBeGreaterThan(0);
    });
});
