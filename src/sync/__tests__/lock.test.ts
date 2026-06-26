import {
    SyncLockRecord,
    SyncLockStorage,
    acquireSyncLock,
    buildOwnerId,
    releaseSyncLock,
    setSyncLockStorage,
    withSyncLock,
} from "../lock";

class MemoryLockStorage implements SyncLockStorage {
    private map = new Map<string, SyncLockRecord>();
    async get(key: string) {
        return this.map.get(key);
    }
    async put(record: SyncLockRecord) {
        this.map.set(record.lockId, record);
    }
    async delete(key: string) {
        this.map.delete(key);
    }
}

describe("sync lock", () => {
    beforeEach(() => {
        setSyncLockStorage(new MemoryLockStorage());
    });

    test("first acquire succeeds, second concurrent acquire fails", async () => {
        const a = await acquireSyncLock("lock1", "ownerA", 60_000);
        const b = await acquireSyncLock("lock1", "ownerB", 60_000);
        expect(a).toBe(true);
        expect(b).toBe(false);
    });

    test("same owner re-acquiring refreshes ttl", async () => {
        const a = await acquireSyncLock("lock1", "ownerA", 60_000);
        const re = await acquireSyncLock("lock1", "ownerA", 60_000);
        expect(a).toBe(true);
        expect(re).toBe(true);
    });

    test("release allows other owner to acquire", async () => {
        await acquireSyncLock("lock1", "ownerA", 60_000);
        await releaseSyncLock("lock1", "ownerA");
        const b = await acquireSyncLock("lock1", "ownerB", 60_000);
        expect(b).toBe(true);
    });

    test("release by non-owner is a no-op", async () => {
        await acquireSyncLock("lock1", "ownerA", 60_000);
        await releaseSyncLock("lock1", "ownerB");
        const c = await acquireSyncLock("lock1", "ownerC", 60_000);
        expect(c).toBe(false);
    });

    test("expired lock can be taken over", async () => {
        await acquireSyncLock("lock1", "ownerA", 1); // 1 ms TTL
        await new Promise((r) => setTimeout(r, 5));
        const b = await acquireSyncLock("lock1", "ownerB", 60_000);
        expect(b).toBe(true);
    });

    test("withSyncLock returns undefined when lock is held", async () => {
        await acquireSyncLock("lock1", "ownerA", 60_000);
        const result = await withSyncLock("lock1", "ownerB", 60_000, async () => 42);
        expect(result).toBeUndefined();
    });

    test("withSyncLock releases the lock after work completes", async () => {
        const result = await withSyncLock(
            "lock1",
            "ownerA",
            60_000,
            async () => 7,
        );
        expect(result).toBe(7);
        const next = await acquireSyncLock("lock1", "ownerB", 60_000);
        expect(next).toBe(true);
    });

    test("owner id includes user + device + timestamp segments", () => {
        const id = buildOwnerId({ userUid: "user1", deviceId: "device1" });
        expect(id.startsWith("user1:device1:")).toBe(true);
        expect(id.split(":")).toHaveLength(3);
    });
});
