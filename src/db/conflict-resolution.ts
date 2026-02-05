import { db, FlattenedEvent, FlattenedTrackedEntity } from "./index";

/**
 * Conflict Resolution Strategies for Dexie-DHIS2 Sync
 *
 * Handles conflicts when local and remote data diverge.
 * Uses version numbers and timestamps for detection.
 */

export type ConflictStrategy =
    | "client-wins" // Local changes take precedence
    | "server-wins" // Remote changes take precedence
    | "newest-wins" // Most recent modification wins
    | "manual"; // Require user intervention

export interface ConflictDetectionResult {
    hasConflict: boolean;
    localVersion: number;
    remoteVersion?: number;
    localLastModified: string;
    remoteLastModified?: string;
    reason?: string;
}

export interface ConflictResolutionResult {
    resolved: boolean;
    strategy: ConflictStrategy;
    winner: "local" | "remote" | "merged" | "pending";
    data: any;
    message?: string;
}

/**
 * Detect if a conflict exists between local and remote data
 *
 * Conflict occurs when:
 * 1. Local version > remote version (local has unsaved changes)
 * 2. Remote lastModified > local lastSynced (server updated after last sync)
 */
export function detectConflict(
    localData: any,
    remoteData: any,
): ConflictDetectionResult {
    const localVersion = localData.version || 1;
    const remoteVersion = remoteData.version;
    const localLastModified = localData.lastModified;
    const remoteLastModified = remoteData.lastModified;
    const localLastSynced = localData.lastSynced;

    // No remote data yet - no conflict
    if (!remoteData) {
        return {
            hasConflict: false,
            localVersion,
            localLastModified,
        };
    }

    // Check version mismatch
    if (localVersion !== remoteVersion) {
        // Local has pending changes AND remote was modified after last sync
        if (
            localData.syncStatus === "pending" &&
            remoteLastModified &&
            localLastSynced &&
            new Date(remoteLastModified) > new Date(localLastSynced)
        ) {
            return {
                hasConflict: true,
                localVersion,
                remoteVersion,
                localLastModified,
                remoteLastModified,
                reason: "Both local and remote data modified since last sync",
            };
        }
    }

    return {
        hasConflict: false,
        localVersion,
        remoteVersion,
        localLastModified,
        remoteLastModified,
    };
}

/**
 * Resolve conflict using specified strategy
 */
export async function resolveConflict(
    entityType: "trackedEntity" | "event" | "relationship",
    entityId: string,
    localData: any,
    remoteData: any,
    strategy: ConflictStrategy = "newest-wins",
): Promise<ConflictResolutionResult> {
    const detection = detectConflict(localData, remoteData);

    if (!detection.hasConflict) {
        return {
            resolved: true,
            strategy,
            winner: "local",
            data: localData,
            message: "No conflict detected",
        };
    }

    console.log(`⚠️ Conflict detected for ${entityType} ${entityId}`, detection);

    switch (strategy) {
        case "client-wins":
            return {
                resolved: true,
                strategy,
                winner: "local",
                data: localData,
                message: "Local changes take precedence",
            };

        case "server-wins":
            // Update local data with remote data
            await updateLocalWithRemote(entityType, entityId, remoteData);
            return {
                resolved: true,
                strategy,
                winner: "remote",
                data: remoteData,
                message: "Remote changes take precedence",
            };

        case "newest-wins": {
            const localTime = new Date(
                detection.localLastModified,
            ).getTime();
            const remoteTime = detection.remoteLastModified
                ? new Date(detection.remoteLastModified).getTime()
                : 0;

            if (localTime > remoteTime) {
                return {
                    resolved: true,
                    strategy,
                    winner: "local",
                    data: localData,
                    message: `Local changes are newer (${new Date(localTime).toISOString()})`,
                };
            } else {
                await updateLocalWithRemote(entityType, entityId, remoteData);
                return {
                    resolved: true,
                    strategy,
                    winner: "remote",
                    data: remoteData,
                    message: `Remote changes are newer (${new Date(remoteTime).toISOString()})`,
                };
            }
        }

        case "manual":
            return {
                resolved: false,
                strategy,
                winner: "pending",
                data: { local: localData, remote: remoteData },
                message: "Manual resolution required",
            };

        default:
            throw new Error(`Unknown conflict strategy: ${strategy}`);
    }
}

/**
 * Update local database with remote data
 */
async function updateLocalWithRemote(
    entityType: "trackedEntity" | "event" | "relationship",
    entityId: string,
    remoteData: any,
): Promise<void> {
    const updates = {
        ...remoteData,
        syncStatus: "synced" as const,
        lastSynced: new Date().toISOString(),
    };

    switch (entityType) {
        case "trackedEntity":
            await db.trackedEntities.update(entityId, updates);
            break;
        case "event":
            await db.events.update(entityId, updates);
            break;
        case "relationship":
            await db.relationships.update(entityId, updates);
            break;
    }

    console.log(`✅ Updated local ${entityType} with remote data:`, entityId);
}

/**
 * Merge strategies for specific data types
 */

/**
 * Merge tracked entity attributes
 * Combines non-conflicting attributes, newer wins for conflicts
 */
export function mergeTrackedEntityAttributes(
    localEntity: FlattenedTrackedEntity,
    remoteEntity: any,
): FlattenedTrackedEntity {
    const mergedAttributes = { ...remoteEntity.attributes };

    // Overlay local changes that are newer
    Object.entries(localEntity.attributes || {}).forEach(([key, value]) => {
        // If local has a value and it's different from remote
        if (
            value !== undefined &&
            value !== null &&
            value !== remoteEntity.attributes?.[key]
        ) {
            // Keep local value (assuming local is newer if it differs)
            mergedAttributes[key] = value;
        }
    });

    return {
        ...remoteEntity,
        attributes: mergedAttributes,
        syncStatus: "pending" as const,
        lastModified: new Date().toISOString(),
    };
}

/**
 * Merge event data values
 * Combines non-conflicting data elements, newer wins for conflicts
 */
export function mergeEventDataValues(
    localEvent: FlattenedEvent,
    remoteEvent: any,
): FlattenedEvent {
    const mergedDataValues = { ...remoteEvent.dataValues };

    // Overlay local changes that are newer
    Object.entries(localEvent.dataValues || {}).forEach(([key, value]) => {
        if (
            value !== undefined &&
            value !== null &&
            value !== remoteEvent.dataValues?.[key]
        ) {
            mergedDataValues[key] = value;
        }
    });

    return {
        ...remoteEvent,
        dataValues: mergedDataValues,
        syncStatus: "pending" as const,
        lastModified: new Date().toISOString(),
    };
}

/**
 * Smart merge: Attempt to automatically merge compatible changes
 */
export async function smartMerge(
    entityType: "trackedEntity" | "event",
    entityId: string,
    localData: any,
    remoteData: any,
): Promise<ConflictResolutionResult> {
    console.log(`🔄 Attempting smart merge for ${entityType} ${entityId}`);

    try {
        let mergedData: any;

        if (entityType === "trackedEntity") {
            mergedData = mergeTrackedEntityAttributes(localData, remoteData);
        } else if (entityType === "event") {
            mergedData = mergeEventDataValues(localData, remoteData);
        } else {
            throw new Error(`Smart merge not supported for ${entityType}`);
        }

        // Update local database with merged data
        await updateLocalWithRemote(entityType, entityId, mergedData);

        return {
            resolved: true,
            strategy: "newest-wins",
            winner: "merged",
            data: mergedData,
            message: "Successfully merged local and remote changes",
        };
    } catch (error) {
        console.error("❌ Smart merge failed:", error);
        return {
            resolved: false,
            strategy: "manual",
            winner: "pending",
            data: { local: localData, remote: remoteData },
            message: `Merge failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
    }
}

/**
 * Handle conflict with automatic resolution
 * Returns result for logging/notification
 */
export async function handleConflict(
    entityType: "trackedEntity" | "event" | "relationship",
    entityId: string,
    localData: any,
    remoteData: any,
    preferredStrategy: ConflictStrategy = "newest-wins",
): Promise<ConflictResolutionResult> {
    const detection = detectConflict(localData, remoteData);

    if (!detection.hasConflict) {
        return {
            resolved: true,
            strategy: preferredStrategy,
            winner: "local",
            data: localData,
            message: "No conflict",
        };
    }

    console.warn(`⚠️ Conflict detected:`, {
        entityType,
        entityId,
        detection,
    });

    // Try smart merge first for tracked entities and events
    if (entityType === "trackedEntity" || entityType === "event") {
        const mergeResult = await smartMerge(
            entityType,
            entityId,
            localData,
            remoteData,
        );

        if (mergeResult.resolved) {
            console.log("✅ Smart merge successful");
            return mergeResult;
        }
    }

    // Fall back to strategy-based resolution
    const result = await resolveConflict(
        entityType,
        entityId,
        localData,
        remoteData,
        preferredStrategy,
    );

    console.log(`✅ Conflict resolved using ${result.strategy} strategy:`, {
        winner: result.winner,
        message: result.message,
    });

    return result;
}
