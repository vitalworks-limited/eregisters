import Dexie, { Table } from "dexie";

/**
 * Per-device/browser sync lock.
 *
 * Why: production showed users opening the app in multiple tabs (or
 * reloading repeatedly) and each tab firing a tracker pull/push loop.
 * The lock ensures only one sync runs at a time per browser profile.
 *
 * The lock is stored in its own tiny Dexie database so it can be acquired
 * without depending on the main register database being open.
 */
export interface SyncLockRecord {
    lockId: string;
    ownerId: string;
    acquiredAt: string;
    expiresAt: string;
}

class LockDatabase extends Dexie {
    syncLocks!: Table<SyncLockRecord, string>;

    constructor() {
        super("MOHRegister_SyncLocks");
        this.version(1).stores({
            syncLocks: "lockId,ownerId,expiresAt",
        });
    }
}

let lockDb: LockDatabase | null = null;
function getLockDb(): LockDatabase {
    if (!lockDb) {
        lockDb = new LockDatabase();
    }
    return lockDb;
}

/**
 * Pluggable storage for lock testing.
 */
export interface SyncLockStorage {
    get(key: string): Promise<SyncLockRecord | undefined>;
    put(record: SyncLockRecord): Promise<void>;
    delete(key: string): Promise<void>;
}

class DexieLockStorage implements SyncLockStorage {
    async get(key: string): Promise<SyncLockRecord | undefined> {
        return getLockDb().syncLocks.get(key);
    }
    async put(record: SyncLockRecord): Promise<void> {
        await getLockDb().syncLocks.put(record);
    }
    async delete(key: string): Promise<void> {
        await getLockDb().syncLocks.delete(key);
    }
}

let activeStorage: SyncLockStorage = new DexieLockStorage();

/** Test/utility helper: swap the storage backend (e.g. for an in-memory mock). */
export function setSyncLockStorage(storage: SyncLockStorage) {
    activeStorage = storage;
}

/**
 * Attempt to acquire a named lock.
 *
 * Returns true if acquired, false if another non-expired holder owns it.
 */
export async function acquireSyncLock(
    lockId: string,
    ownerId: string,
    ttlMs: number,
): Promise<boolean> {
    const now = Date.now();
    const existing = await activeStorage.get(lockId);

    if (existing && new Date(existing.expiresAt).getTime() > now) {
        if (existing.ownerId === ownerId) {
            // Same owner re-entering: refresh TTL.
            await activeStorage.put({
                lockId,
                ownerId,
                acquiredAt: existing.acquiredAt,
                expiresAt: new Date(now + ttlMs).toISOString(),
            });
            return true;
        }
        return false;
    }

    await activeStorage.put({
        lockId,
        ownerId,
        acquiredAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlMs).toISOString(),
    });
    return true;
}

/**
 * Release a lock only if owned by `ownerId`.
 *
 * No-op if the lock has expired or is held by someone else.
 */
export async function releaseSyncLock(
    lockId: string,
    ownerId: string,
): Promise<void> {
    const existing = await activeStorage.get(lockId);
    if (existing?.ownerId === ownerId) {
        await activeStorage.delete(lockId);
    }
}

/**
 * Helper to wrap any async work in a lock acquire/release.
 *
 * Returns the work result, or undefined if the lock could not be acquired.
 */
export async function withSyncLock<T>(
    lockId: string,
    ownerId: string,
    ttlMs: number,
    work: () => Promise<T>,
): Promise<T | undefined> {
    const acquired = await acquireSyncLock(lockId, ownerId, ttlMs);
    if (!acquired) {
        return undefined;
    }
    try {
        return await work();
    } finally {
        await releaseSyncLock(lockId, ownerId);
    }
}

/**
 * Returns a unique-ish owner id for this browser/tab/session.
 *
 * The combination of user, device, and `Date.now()` makes the owner id
 * unique enough that the same browser opening twice won't accidentally
 * re-acquire the other tab's lock.
 */
export function buildOwnerId(parts: {
    userUid?: string;
    deviceId?: string;
}): string {
    return `${parts.userUid ?? "anon"}:${parts.deviceId ?? "device"}:${Date.now()}`;
}
