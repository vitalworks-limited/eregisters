/**
 * Persistent storage helpers.
 *
 * Browsers can auto-evict IndexedDB data when storage runs low (typical on
 * older Android devices and Safari). Calling `navigator.storage.persist()`
 * asks the browser to keep this origin's data even under pressure. It is
 * granted automatically for installed PWAs and usually for sites the user
 * visits frequently. It does NOT prevent a user from manually clearing
 * site data — that's a platform constraint we cannot work around.
 */

export interface PersistedStatus {
    /** True if the API exists in this browser. */
    supported: boolean;
    /** True if the origin currently has persistent storage. */
    persisted: boolean;
    /** Quota / usage if available. */
    quotaBytes?: number;
    usageBytes?: number;
}

export async function requestPersistentStorage(): Promise<PersistedStatus> {
    if (typeof navigator === "undefined" || !("storage" in navigator)) {
        return { supported: false, persisted: false };
    }
    const storage = navigator.storage as StorageManager;
    let persisted = false;
    if (typeof storage.persisted === "function") {
        try {
            persisted = await storage.persisted();
        } catch {
            persisted = false;
        }
    }
    if (!persisted && typeof storage.persist === "function") {
        try {
            persisted = await storage.persist();
        } catch {
            persisted = false;
        }
    }
    let quotaBytes: number | undefined;
    let usageBytes: number | undefined;
    if (typeof storage.estimate === "function") {
        try {
            const est = await storage.estimate();
            quotaBytes = est.quota;
            usageBytes = est.usage;
        } catch {
            // ignore
        }
    }
    return {
        supported: true,
        persisted,
        quotaBytes,
        usageBytes,
    };
}

export async function getStorageEstimate(): Promise<{
    quotaBytes?: number;
    usageBytes?: number;
}> {
    if (
        typeof navigator === "undefined" ||
        !("storage" in navigator) ||
        typeof (navigator.storage as StorageManager).estimate !== "function"
    ) {
        return {};
    }
    try {
        const est = await (navigator.storage as StorageManager).estimate();
        return { quotaBytes: est.quota, usageBytes: est.usage };
    } catch {
        return {};
    }
}
