import Dexie, { Table } from "dexie";
import {
    DataElement,
    FlattenedEnrollment,
    FlattenedTrackedEntity,
    Node,
    Program,
    ProgramRule,
    ProgramRuleResult,
    ProgramRuleVariable,
    TrackedEntityAttribute,
    FlattenedEvent,
} from "../schemas";

export type SyncStatus = "draft" | "pending" | "syncing" | "synced" | "failed";
export interface SyncOperation {
    id: string; // Composite ID format: {entityId}_{type} for automatic deduplication
    type:
        | "CREATE_TRACKED_ENTITY"
        | "UPDATE_TRACKED_ENTITY"
        | "CREATE_RELATIONSHIP"
        | "CREATE_EVENT"
        | "UPDATE_EVENT";
    entityId: string;
    data: FlattenedEnrollment | FlattenedTrackedEntity | FlattenedEvent;
    status: "pending" | "syncing" | "failed" | "completed";
    attempts: number;
    createdAt: string;
    updatedAt: string;
    error?: string;
    priority: number;
}

// Machine state persistence
export interface MachineState {
    id: string; // Always "tracker-machine" for single state
    context: any; // XState machine context
    state: string; // Current machine state
    updatedAt: string;
}

// Village reference data
export interface Village {
    village_id: string;
    village_name: string;
    parish_name: string;
    subcounty_name: string;
    District: string;
}

// Program rules cache entry
export interface RuleCacheEntry {
    key: string;
    result: ProgramRuleResult;
    timestamp: number;
    dataValues: Record<string, any>;
    attributes: Record<string, any>;
}

// Metadata version tracking with per-type lastUpdated timestamps
export interface MetadataVersion {
    id: string; // Always "metadata-version"
    lastSync: string; // Overall last sync timestamp (ISO 8601)
    versions: {
        // Per-type lastUpdated timestamps for incremental sync
        programs?: string; // ISO 8601 timestamp
        dataElements?: string; // ISO 8601 timestamp
        attributes?: string; // ISO 8601 timestamp
        programRules?: string; // ISO 8601 timestamp
        programRuleVariables?: string; // ISO 8601 timestamp
        optionSets?: string; // ISO 8601 timestamp
        optionGroups?: string; // ISO 8601 timestamp
        villages?: string; // ISO 8601 timestamp
        relationshipTypes?: string; // ISO 8601 timestamp
    };
}

// Metadata sync progress tracking
export interface MetadataSyncProgress {
    id: string; // Always "metadata-sync-progress"
    status: "idle" | "checking" | "syncing" | "error" | "success";
    progress?: {
        total: number;
        completed: number;
        current: string;
        percentage: number;
    };
    error?: string;
    lastSync?: string;
    updatedAt: string;
}

// Sync state persistence for sync manager
export interface SyncState {
    id: string; // Always "current"
    status: "idle" | "syncing" | "online" | "offline";
    isOnline: boolean;
    isSyncing: boolean;
    lastSyncAt?: string; // ISO 8601 timestamp
    lastSyncDuration?: number; // Duration in milliseconds
    lastSyncCount?: number; // Number of items synced
    lastError?: string;
    pendingCount: number;
    updatedAt: string; // ISO 8601 timestamp
}

/**
 * RegisterDatabase - Main Dexie database instance
 */
export class RegisterDatabase extends Dexie {
    trackedEntities!: Table<FlattenedTrackedEntity, string>;
    events!: Table<FlattenedEvent, string>;
    syncQueue!: Table<SyncOperation, string>;
    programRules!: Table<ProgramRule, string>;
    programRuleVariables!: Table<ProgramRuleVariable, string>;
    optionGroups!: Table<
        { id: string; name: string; code: string; optionGroup: string },
        string
    >;
    optionSets!: Table<
        { id: string; name: string; code: string; optionSet: string },
        string
    >;
    dataElements!: Table<DataElement, string>;
    trackedEntityAttributes!: Table<TrackedEntityAttribute, string>;
    organisationUnits!: Table<Node, string>;
    programs!: Table<Program, string>;
    metadataVersions!: Table<MetadataVersion, string>;
    metadataSyncProgress!: Table<MetadataSyncProgress, string>;
    syncState!: Table<SyncState, string>;

    constructor() {
        super("MOHRegisterDB");
        this.version(1).stores({
            trackedEntities:
                "trackedEntity,orgUnit,enrollment.enrolledAt,updatedAt,syncStatus,version,lastSynced,parentEntity",
            events: "event,trackedEntity,programStage,enrollment,occurredAt,updatedAt,syncStatus,version,lastSynced,parentEvent",
            syncQueue: "id,status,priority,type,entityId,createdAt",
            programRules: "id,program",
            programRuleVariables: "id,program",
            dataElements: "id,name",
            trackedEntityAttributes: "id,name",
            organisationUnits: "[id+user],id,title,user",
            optionSets: "[id+optionSet],id,optionSet,name,code",
            optionGroups: "[id+optionGroup],id,optionGroup,name,code",
            programs: "id,name,programType",
            metadataVersions: "id,lastSync",
            metadataSyncProgress: "id,status,updatedAt",
            syncState: "id,status,updatedAt",
        });
    }

    /**
     * Clear all data (useful for logout/reset)
     */
    async clearAllData(): Promise<void> {
        await this.trackedEntities.clear();
        await this.events.clear();
        await this.syncQueue.clear();
    }

    /**
     * Get pending sync operations ordered by priority and creation time
     */
    async getPendingSyncOperations(): Promise<SyncOperation[]> {
        return await this.syncQueue
            .where("status")
            .equals("pending")
            .or("status")
            .equals("failed")
            .sortBy("priority")
            .then((ops) => ops.reverse()); // Higher priority first
    }

    /**
     * Get total count of pending sync operations
     */
    async getPendingSyncCount(): Promise<number> {
        return await this.syncQueue
            .where("status")
            .equals("pending")
            .or("status")
            .equals("failed")
            .count();
    }

    /**
     * Clean up old completed sync operations (older than 7 days)
     */
    async cleanupCompletedSyncOperations(): Promise<void> {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        await this.syncQueue
            .where("status")
            .equals("completed")
            .and((op) => new Date(op.updatedAt) < sevenDaysAgo)
            .delete();
    }

    /**
     * Get entities with specific sync status
     */
    async getEntitiesByStatus(
        status: SyncStatus,
    ): Promise<FlattenedTrackedEntity[]> {
        return await this.trackedEntities
            .where("syncStatus")
            .equals(status)
            .toArray();
    }

    /**
     * Get events with specific sync status
     */
    async getEventsByStatus(status: SyncStatus): Promise<FlattenedEvent[]> {
        return await this.events.where("syncStatus").equals(status).toArray();
    }

    /**
     * Get count of items pending sync across all tables
     */
    async getPendingChangesCount(): Promise<{
        entities: number;
        events: number;
        total: number;
    }> {
        const entities = await this.trackedEntities
            .where("syncStatus")
            .anyOf(["draft", "pending", "failed"])
            .count();

        const events = await this.events
            .where("syncStatus")
            .anyOf(["draft", "pending", "failed"])
            .count();

        return {
            entities,
            events,
            total: entities + events,
        };
    }
}

// Export singleton database instance
export const db = new RegisterDatabase();
