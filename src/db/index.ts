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
    RelationshipType,
    TrackedEntityAttribute,
    FlattenedEvent,
    FlattenedRelationship,
} from "../schemas";

export type SyncStatus = "draft" | "pending" | "syncing" | "synced" | "failed";
export interface SyncOperation {
    id: string;
    type:
        | "CREATE_TRACKED_ENTITY"
        | "UPDATE_TRACKED_ENTITY"
        | "CREATE_RELATIONSHIP"
        | "CREATE_EVENT"
        | "UPDATE_EVENT";
    entityId: string;
    data:
        | FlattenedEnrollment
        | FlattenedTrackedEntity
        | FlattenedEvent
        | FlattenedRelationship;
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
    // Tables with sync metadata
    trackedEntities!: Table<FlattenedTrackedEntity, string>;
    events!: Table<FlattenedEvent, string>;
    relationships!: Table<FlattenedRelationship, string>;
    trackedEntityDrafts!: Table<FlattenedTrackedEntity, string>;
    relationshipDraft!: Table<FlattenedRelationship, string>;
    eventDrafts!: Table<FlattenedEvent, string>;
    syncQueue!: Table<SyncOperation, string>;
    machineState!: Table<MachineState, string>;
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
    villages!: Table<Village, string>;
    relationshipTypes: Table<RelationshipType>;
    ruleCache!: Table<RuleCacheEntry, string>;
    metadataVersions!: Table<MetadataVersion, string>;
    metadataSyncProgress!: Table<MetadataSyncProgress, string>;
    syncState!: Table<SyncState, string>;

    constructor() {
        super("MOHRegisterDB");

        // Version 2 - Added syncState table for persistent sync manager state
        this.version(2).stores({
            // Tracked entities with sync status, version tracking, and lastSynced
            trackedEntities:
                "trackedEntity,orgUnit,enrollment.enrolledAt,updatedAt,syncStatus,version,lastSynced",

            // Events with sync status, version tracking, and lastSynced
            events: "event,trackedEntity,programStage,enrollment,occurredAt,updatedAt,syncStatus,version,lastSynced",

            // Relationships with sync status, version tracking, and lastSynced
            // Using flattened structure: from.id and to.id
            relationships:
                "relationship,fromId,toId,syncStatus,version,lastSynced",

            // Relationship types
            relationshipTypes: "id",

            // Draft tables
            trackedEntityDrafts: "trackedEntity,orgUnit,updatedAt,isNew",
            eventDrafts: "event,trackedEntity,programStage,updatedAt,isNew",

            // Sync queue
            syncQueue: "id,status,priority,type,entityId,createdAt",

            // Machine state persistence
            machineState: "id,updatedAt",

            // Metadata tables
            programRules: "id,program",
            programRuleVariables: "id,program",
            dataElements: "id,name",
            trackedEntityAttributes: "id,name",
            organisationUnits: "[id+user],id,title,user",
            optionSets: "[id+optionSet],id,optionSet,name,code",
            optionGroups: "[id+optionGroup],id,optionGroup,name,code",
            programs: "id,name,programType",
            villages:
                "village_id,village_name,District,[District+subcounty_name],[District+subcounty_name+parish_name]",
            // Program rules cache
            ruleCache: "key,timestamp",
            // Metadata version tracking
            metadataVersions: "id,lastSync",
            // Metadata sync progress tracking
            metadataSyncProgress: "id,status,updatedAt",
            // Sync manager state persistence
            syncState: "id,status,updatedAt",
        });
    }

    /**
     * Clear all draft data (useful after successful submissions)
     */
    async clearAllDrafts(): Promise<void> {
        await this.trackedEntityDrafts.clear();
        await this.eventDrafts.clear();
    }

    /**
     * Clear all data (useful for logout/reset)
     */
    async clearAllData(): Promise<void> {
        await this.trackedEntities.clear();
        await this.events.clear();
        await this.trackedEntityDrafts.clear();
        await this.eventDrafts.clear();
        await this.syncQueue.clear();
        await this.machineState.clear();
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
     * Get all drafts for listing in UI
     */
    async getAllDrafts(): Promise<{
        trackedEntityDrafts: FlattenedTrackedEntity[];
        eventDrafts: FlattenedTrackedEntity["events"];
    }> {
        const trackedEntityDrafts = await this.trackedEntityDrafts
            .orderBy("updatedAt")
            .reverse()
            .toArray();

        const eventDrafts = await this.eventDrafts
            .orderBy("updatedAt")
            .reverse()
            .toArray();

        return { trackedEntityDrafts, eventDrafts };
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
     * Get relationships with specific sync status
     */
    async getRelationshipsByStatus(
        status: SyncStatus,
    ): Promise<FlattenedRelationship[]> {
        return await this.relationships
            .where("syncStatus")
            .equals(status)
            .toArray();
    }

    /**
     * Get count of items pending sync across all tables
     */
    async getPendingChangesCount(): Promise<{
        entities: number;
        events: number;
        relationships: number;
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

        const relationships = await this.relationships
            .where("syncStatus")
            .anyOf(["draft", "pending", "failed"])
            .count();

        return {
            entities,
            events,
            relationships,
            total: entities + events + relationships,
        };
    }

    // /**
    //  * Initialize sync metadata for new entity
    //  */
    // createSyncMetadata(status: SyncStatus = "draft"): SyncMetadata {
    //     return {
    //         syncStatus: status,
    //         version: 1,
    //         lastModified: new Date().toISOString(),
    //     };
    // }

    // /**
    //  * Update sync metadata (for use in hooks)
    //  */
    // updateSyncMetadata(current: Partial<SyncMetadata>): Partial<SyncMetadata> {
    //     return {
    //         ...current,
    //         version: (current.version || 0) + 1,
    //         lastModified: new Date().toISOString(),
    //         syncStatus: "pending",
    //     };
    // }
}

// Export singleton database instance
export const db = new RegisterDatabase();
