/**
 * Collection Access Helper
 * Provides centralized access to TanStack DB collections and internal update flag management
 */

// import { trackedEntityCollection } from "../collections/tracked-entity";
// import { enrollmentsCollection } from "../collections/enrollments";
// import { eventsCollection } from "../collections/events";

// /**
//  * Centralized collection access
//  */
// export const collections = {
//     trackedEntities: trackedEntityCollection,
//     enrollments: enrollmentsCollection,
//     events: eventsCollection,
// };

/**
 * Internal update flag to prevent sync loops
 * Set to true when SyncManager updates entity status to prevent lifecycle hooks from queueing redundant syncs
 */
let isInternalUpdate = false;

/**
 * Set the internal update flag
 * Use this before sync-related updates (e.g., updating syncStatus or lastSynced)
 */
export function setInternalUpdate(value: boolean): void {
    isInternalUpdate = value;
}

/**
 * Get the current internal update flag value
 * Used by collection lifecycle hooks to determine if they should skip sync queueing
 */
export function getInternalUpdateFlag(): boolean {
    return isInternalUpdate;
}
