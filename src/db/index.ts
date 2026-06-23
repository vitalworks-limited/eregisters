import Dexie, { Table } from "dexie";
import {
    DataElement,
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
    MetadataVersion,
    Node,
    Program,
    ProgramIndicator,
    ProgramRule,
    ProgramRuleResult,
    ProgramRuleVariable,
    TrackedEntityAttribute,
} from "../schemas";

export interface SyncOperation {
    id: string;
    type:
        | "CREATE_ENROLLMENT"
        | "CREATE_OR_UPDATE_TRACKED_ENTITY"
        | "CREATE_UPDATE_EVENT";
    entityId: string;
    data: FlattenedEnrollment | FlattenedTrackedEntity | FlattenedEvent;
    status: "pending" | "syncing" | "failed" | "completed";
    attempts: number;
    createdAt: string;
    updatedAt: string;
    error?: string;
    priority: number;
}

export interface MachineState {
    id: string;
    context: any;
    state: string;
    updatedAt: string;
}

export interface Village {
    village_id: string;
    village_name: string;
    parish_name: string;
    subcounty_name: string;
    District: string;
}

export interface RuleCacheEntry {
    key: string;
    result: ProgramRuleResult;
    timestamp: number;
    dataValues: Record<string, any>;
    attributes: Record<string, any>;
}
export interface MetadataSyncProgress {
    id: string;
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
export interface SyncState {
    id: string;
    status: "idle" | "syncing" | "online" | "offline";
    isOnline: boolean;
    isSyncing: boolean;
    lastSyncAt?: string;
    lastPullAt?: string;
    lastPushAt?: string;
    lastSyncDuration?: number;
    lastSyncCount?: number;
    lastError?: string;
    pendingCount: number;
    updatedAt: string;
    pullVersions?: Record<string, string>;
}
export interface IndicatorEvaluation {
    id: string;
    eventId: string;
    results: Record<string, 1>;
    updatedAt: string;
    version: number;
}
class RegisterDatabase extends Dexie {
    programRules!: Table<ProgramRule, string>;
    programRuleVariables!: Table<ProgramRuleVariable, string>;
    optionGroups!: Table<
        {
            id: string;
            name: string;
            code: string;
            optionGroup: string;
            sortOrder: number;
        },
        string
    >;
    optionSets!: Table<
        {
            id: string;
            name: string;
            code: string;
            optionSet: string;
            sortOrder: number;
        },
        string
    >;
    dataElements!: Table<DataElement, string>;
    trackedEntityAttributes!: Table<TrackedEntityAttribute, string>;
    organisationUnits!: Table<Node, string>;
    programs!: Table<Program, string>;
    metadataVersions!: Table<MetadataVersion, string>;
    metadataSyncProgress!: Table<MetadataSyncProgress, string>;
    syncState!: Table<SyncState, string>;
    programIndicators!: Table<ProgramIndicator, string>;
    indicatorEvaluations!: Table<IndicatorEvaluation, string>;

    constructor() {
        super("MOHRegisterDB");
        this.version(1).stores({
            programRules: "id,program",
            programRuleVariables: "id,program",
            dataElements: "id,name",
            programIndicators: "id,name",
            trackedEntityAttributes: "id,name",
            organisationUnits: "[id+user],id,user",
            optionSets: "[id+optionSet],id,optionSet,name,code",
            optionGroups: "[id+optionGroup],id,optionGroup,name,code",
            programs: "id,name,programType",
            metadataVersions: "id,lastSync",
            metadataSyncProgress: "id,status,updatedAt",
            syncState: "id,status,updatedAt",
            indicatorEvaluations: "id,eventId,updatedAt,version",
        });
    }
}
export const db = new RegisterDatabase();
