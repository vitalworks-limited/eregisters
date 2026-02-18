import { useDataEngine } from "@dhis2/app-runtime";
import dayjs from "dayjs";
import {
    DataElement,
    OrgUnit,
    Program,
    ProgramRule,
    ProgramRuleVariable,
    TrackedEntityAttribute,
} from "../schemas";
import { db, MetadataVersion } from "./index";
export interface MetadataUpdateInfo {
    hasUpdates: boolean;
    changedTypes: string[];
    lastSync?: string;
    currentVersion?: string;
}

export interface MetadataSyncProgress {
    total: number;
    completed: number;
    current: string;
    percentage: number;
}

export type MetadataSyncStatus =
    | "idle"
    | "checking"
    | "syncing"
    | "error"
    | "success";

export interface MetadataSyncState {
    status: MetadataSyncStatus;
    progress?: MetadataSyncProgress;
    error?: string;
    lastSync?: string;
}

const METADATA_TYPES = [
    "me",
    "programs",
    "dataElements",
    "attributes",
    "programRules",
    "programRuleVariables",
    "optionSets",
    "optionGroups",
    "relationshipTypes",
] as const;

type MetadataType = (typeof METADATA_TYPES)[number];

const SKIP_ON_UPDATE_TYPES: MetadataType[] = [];

/**
 * Check if a metadata type should be skipped during update checks
 */
function shouldSkipOnUpdate(type: MetadataType): boolean {
    return SKIP_ON_UPDATE_TYPES.includes(type);
}

export class MetadataSync {
    private engine: ReturnType<typeof useDataEngine>;
    private currentState: MetadataSyncState = { status: "idle" };
    private writeQueue: Promise<void> = Promise.resolve();

    constructor(engine: ReturnType<typeof useDataEngine>) {
        this.engine = engine;
        this.initializeFromPersistedState();
    }

    private async initializeFromPersistedState() {
        const persistedProgress = await db.metadataSyncProgress.get(
            "metadata-sync-progress",
        );
        if (persistedProgress) {
            // Restore state, but reset syncing/checking to idle
            const status =
                persistedProgress.status === "syncing" ||
                persistedProgress.status === "checking"
                    ? "idle"
                    : persistedProgress.status;

            this.currentState = {
                status,
                progress: persistedProgress.progress,
                error: persistedProgress.error,
                lastSync: persistedProgress.lastSync,
            };
        }
    }

    private queueWrite<T>(operation: () => Promise<T>): Promise<T> {
        const promise = this.writeQueue
            .then(async () => {
                const result = await operation();
                await new Promise((resolve) => setTimeout(resolve, 0));
                return result;
            })
            .catch((error) => {
                console.error("❌ Queue write error:", error);
                throw error;
            });

        this.writeQueue = promise.then(
            () => {},
            () => {},
        );
        return promise;
    }
    private async setState(state: MetadataSyncState) {
        this.currentState = state;
        await db.metadataSyncProgress.put({
            id: "metadata-sync-progress",
            status: state.status,
            progress: state.progress,
            error: state.error,
            lastSync: state.lastSync,
            updatedAt: new Date().toISOString(),
        });
    }

    async getCurrentVersion(): Promise<MetadataVersion | null> {
        const version = await db.metadataVersions.get("metadata-version");
        return version || null;
    }
    async isMetadataStale(): Promise<boolean> {
        const version = await this.getCurrentVersion();
        if (!version) return true;
        const lastSync = dayjs(version.lastSync);
        const now = dayjs();
        const sinceLastSync = now.diff(lastSync, "hours");
        return sinceLastSync > 1;
    }

    /**
     * Get metadata types that have changed since last sync
     * Excludes types marked as skipOnUpdate (like villages) unless never synced
     * @returns Array of metadata types that need updating
     */
    async getChangedMetadataTypes(): Promise<MetadataType[]> {
        const version = await this.getCurrentVersion();
        if (!version) {
            // First sync - include all types
            return [...METADATA_TYPES];
        }

        const changedTypes: MetadataType[] = [];
        const now = dayjs();

        for (const type of METADATA_TYPES) {
            // Skip types that should only sync once (unless never synced)
            if (shouldSkipOnUpdate(type)) {
                const lastSync = version.versions[type];
                if (!lastSync) {
                    // Never synced before, include it
                    changedTypes.push(type);
                }
                // Already synced once, skip on updates
                continue;
            }

            const lastSync = version.versions[type];
            if (!lastSync) {
                changedTypes.push(type);
            } else {
                const lastSyncDate = dayjs(lastSync);
                const hoursSinceSync = now.diff(lastSyncDate, "hours");
                if (hoursSinceSync > 1) {
                    changedTypes.push(type);
                }
            }
        }
        return changedTypes;
    }

    private async getLastSyncTimestamp(
        type: MetadataType,
    ): Promise<string | null> {
        const version = await this.getCurrentVersion();
        return version?.versions[type] || null;
    }

    async checkForUpdates(): Promise<MetadataUpdateInfo> {
        this.setState({ status: "checking" });

        const currentVersion = await this.getCurrentVersion();
        if (!currentVersion) {
            return {
                hasUpdates: true,
                changedTypes: [...METADATA_TYPES],
            };
        }
        const isStale = await this.isMetadataStale();
        return {
            hasUpdates: isStale,
            changedTypes: isStale ? [...METADATA_TYPES] : [],
            lastSync: currentVersion.lastSync,
        };
    }
    private async fetchMetadata(type: MetadataType): Promise<void> {
        let data: any;
        switch (type) {
            case "me":
                data = (await this.engine.query({
                    me: {
                        resource: "me",
                        params: {
                            fields: "organisationUnits[id,name,level,parent,leaf]",
                        },
                    },
                })) as {
                    me: {
                        organisationUnits: OrgUnit[];
                        id: string;
                    };
                };
                break;

            case "programs":
                data = (await this.engine.query({
                    program: {
                        resource: "programs",
                        id: "ueBhWkWll5v",
                        params: {
                            fields: "id,name,programSections[id,name,sortOrder,trackedEntityAttributes[id]],trackedEntityType[id,trackedEntityTypeAttributes[id]],programType,selectEnrollmentDatesInFuture,selectIncidentDatesInFuture,organisationUnits[id,name],programStages[id,repeatable,name,code,programStageDataElements[id,compulsory,renderOptionsAsRadio,dataElement[id],renderType,allowFutureDate],programStageSections[id,name,sortOrder,dataElements[id]]],programTrackedEntityAttributes[id,mandatory,searchable,renderOptionsAsRadio,renderType,sortOrder,allowFutureDate,displayInList,trackedEntityAttribute[id]]",
                        },
                    },
                })) as { program: Program };
                break;

            case "dataElements":
                const dataElementsLastSync =
                    await this.getLastSyncTimestamp(type);
                const dataElementsParams: any = {
                    fields: "id,name,code,valueType,formName,optionSetValue,optionSet[id]",
                    paging: false,
                };
                if (dataElementsLastSync) {
                    dataElementsParams.filter = `lastUpdated:gt:${dataElementsLastSync}`;
                    console.log(
                        `📅 Incremental sync for dataElements since ${dataElementsLastSync}`,
                    );
                }
                data = (await this.engine.query({
                    dataElements: {
                        resource: "dataElements",
                        params: dataElementsParams,
                    },
                })) as { dataElements: { dataElements: DataElement[] } };
                break;

            case "attributes":
                const attributesLastSync =
                    await this.getLastSyncTimestamp(type);
                const attributesParams: any = {
                    fields: "id,name,code,unique,generated,pattern,confidential,valueType,optionSetValue,displayFormName,formName,optionSet[id]",
                    paging: false,
                };
                if (attributesLastSync) {
                    attributesParams.filter = `lastUpdated:gt:${attributesLastSync}`;
                    console.log(
                        `📅 Incremental sync for attributes since ${attributesLastSync}`,
                    );
                }
                data = (await this.engine.query({
                    trackedEntityAttributes: {
                        resource: "trackedEntityAttributes",
                        params: attributesParams,
                    },
                })) as {
                    trackedEntityAttributes: {
                        trackedEntityAttributes: TrackedEntityAttribute[];
                    };
                };
                break;

            case "programRules":
                const programRulesLastSync =
                    await this.getLastSyncTimestamp(type);
                const programRulesFilters = ["program.id:eq:ueBhWkWll5v"];
                if (programRulesLastSync) {
                    programRulesFilters.push(
                        `lastUpdated:gt:${programRulesLastSync}`,
                    );
                    console.log(
                        `📅 Incremental sync for programRules since ${programRulesLastSync}`,
                    );
                }
                data = (await this.engine.query({
                    programRules: {
                        resource: `programRules.json`,
                        params: {
                            filter: programRulesFilters,
                            fields: "*,programRuleActions[*]",
                            paging: false,
                        },
                    },
                })) as { programRules: { programRules: ProgramRule[] } };
                break;

            case "programRuleVariables":
                const programRuleVariablesLastSync =
                    await this.getLastSyncTimestamp(type);
                const programRuleVariablesFilters = [
                    "program.id:eq:ueBhWkWll5v",
                ];
                if (programRuleVariablesLastSync) {
                    programRuleVariablesFilters.push(
                        `lastUpdated:gt:${programRuleVariablesLastSync}`,
                    );
                    console.log(
                        `📅 Incremental sync for programRuleVariables since ${programRuleVariablesLastSync}`,
                    );
                }
                data = (await this.engine.query({
                    programRuleVariables: {
                        resource: `programRuleVariables.json`,
                        params: {
                            filter: programRuleVariablesFilters,
                            fields: "*",
                            paging: false,
                        },
                    },
                })) as {
                    programRuleVariables: {
                        programRuleVariables: ProgramRuleVariable[];
                    };
                };
                break;

            case "optionSets":
                const optionSetsLastSync =
                    await this.getLastSyncTimestamp(type);
                const optionSetsParams: any = {
                    fields: "id,options[id,name,code,sortOrder]",
                    paging: false,
                };
                if (optionSetsLastSync) {
                    optionSetsParams.filter = `lastUpdated:gt:${optionSetsLastSync}`;
                    console.log(
                        `📅 Incremental sync for optionSets since ${optionSetsLastSync}`,
                    );
                }
                data = (await this.engine.query({
                    optionSets: {
                        resource: "optionSets",
                        params: optionSetsParams,
                    },
                })) as {
                    optionSets: {
                        optionSets: {
                            id: string;
                            options: {
                                id: string;
                                name: string;
                                code: string;
                            }[];
                        }[];
                    };
                };
                break;

            case "optionGroups":
                const optionGroupsLastSync =
                    await this.getLastSyncTimestamp(type);
                const optionGroupsParams: any = {
                    fields: "id,options[id,name,code,sortOrder]",
                    paging: false,
                };
                if (optionGroupsLastSync) {
                    optionGroupsParams.filter = `lastUpdated:gt:${optionGroupsLastSync}`;
                }
                data = (await this.engine.query({
                    optionGroups: {
                        resource: "optionGroups",
                        params: optionGroupsParams,
                    },
                })) as {
                    optionGroups: {
                        optionGroups: Array<{
                            id: string;
                            options: {
                                id: string;
                                name: string;
                                code: string;
                            }[];
                        }>;
                    };
                };
                break;
        }
        await this.queueWrite(async () => {
            switch (type) {
                case "me":
                    await db.organisationUnits.bulkPut(
                        data.me.organisationUnits,
                    );
                    break;
                case "programs":
                    await db.programs.put(data.program);
                    break;
                case "dataElements":
                    if (data.dataElements.dataElements.length === 0) {
                        console.log(`⏭️  No updates for ${type}`);
                        return;
                    }
                    await db.dataElements.bulkPut(
                        data.dataElements.dataElements,
                    );
                    break;
                case "attributes":
                    if (
                        data.trackedEntityAttributes.trackedEntityAttributes
                            .length === 0
                    ) {
                        console.log(`⏭️  No updates for ${type}`);
                        return;
                    }
                    await db.trackedEntityAttributes.bulkPut(
                        data.trackedEntityAttributes.trackedEntityAttributes,
                    );
                    break;
                case "programRules":
                    if (data.programRules.programRules.length === 0) {
                        console.log(`⏭️  No updates for ${type}`);
                        return;
                    }
                    await db.programRules.bulkPut(
                        data.programRules.programRules,
                    );
                    break;
                case "programRuleVariables":
                    if (
                        data.programRuleVariables.programRuleVariables
                            .length === 0
                    ) {
                        console.log(`⏭️  No updates for ${type}`);
                        return;
                    }
                    await db.programRuleVariables.bulkPut(
                        data.programRuleVariables.programRuleVariables,
                    );
                    break;
                case "optionSets":
                    if (data.optionSets.optionSets.length === 0) {
                        console.log(`⏭️  No updates for ${type}`);
                        return;
                    }
                    const flattenedOptionSets =
                        data.optionSets.optionSets.flatMap((os: any) =>
                            os.options.map((o: any) => ({
                                ...o,
                                optionSet: os.id,
                            })),
                        );
                    await db.optionSets.bulkPut(flattenedOptionSets);
                    break;
                case "optionGroups":
                    if (data.optionGroups.optionGroups.length === 0) {
                        return;
                    }
                    const flattenedOptionGroups =
                        data.optionGroups.optionGroups.flatMap((og: any) =>
                            og.options.map((o: any) => ({
                                ...o,
                                optionGroup: og.id,
                            })),
                        );
                    await db.optionGroups.bulkPut(flattenedOptionGroups);
                    break;
            }
            const currentTimestamp = new Date().toISOString();
            const version = (await db.metadataVersions.get(
                "metadata-version",
            )) || {
                id: "metadata-version",
                lastSync: currentTimestamp,
                versions: {},
            };

            version.versions[type] = currentTimestamp;
            version.lastSync = currentTimestamp;

            await db.metadataVersions.put(version);
        });
    }
    async syncMetadata(
        types: MetadataType[] = [...METADATA_TYPES],
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> {
        this.setState({ status: "syncing" });

        const total = types.length;
        let completed = 0;

        for (const type of types) {
            const progress: MetadataSyncProgress = {
                total,
                completed,
                current: type,
                percentage: Math.round((completed / total) * 100),
            };

            this.setState({ status: "syncing", progress });
            onProgress?.(progress);
            await this.fetchMetadata(type);
            completed++;
        }

        await this.queueWrite(async () => {
            const version = await db.metadataVersions.get("metadata-version");
            if (version) {
                version.lastSync = new Date().toISOString();
                await db.metadataVersions.put(version);
            }
        });

        const finalProgress: MetadataSyncProgress = {
            total,
            completed,
            current: "Complete",
            percentage: 100,
        };
        this.setState({
            status: "success",
            progress: finalProgress,
            lastSync: dayjs().toISOString(),
        });
        onProgress?.(finalProgress);

        console.log("✅ Metadata sync complete");
    }
    async syncMetadataParallel(
        types: MetadataType[] = [...METADATA_TYPES],
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> {
        this.setState({ status: "syncing" });

        const total = types.length;
        const completedTypes: string[] = [];
        const fetchPromises = types.map(async (type) => {
            await this.fetchMetadata(type);
            completedTypes.push(type);
            const completed = completedTypes.length;

            const progress: MetadataSyncProgress = {
                total,
                completed,
                current: type,
                percentage: Math.round((completed / total) * 100),
            };

            this.setState({ status: "syncing", progress });
            onProgress?.(progress);

            console.log(`✅ ${type} synced (${completed}/${total})`);

            return { type, success: true };
        });
        const results = await Promise.allSettled(fetchPromises);
        const failures = results
            .filter(
                (r) =>
                    r.status === "rejected" ||
                    (r.status === "fulfilled" && !(r.value as any).success),
            )
            .map((r) =>
                r.status === "rejected" ? r.reason : (r as any).value.error,
            );

        if (failures.length > 0) {
            throw new Error(
                `Failed to sync ${failures.length} metadata type(s)`,
            );
        }

        await this.queueWrite(async () => {
            const version = await db.metadataVersions.get("metadata-version");
            if (version) {
                version.lastSync = new Date().toISOString();
                await db.metadataVersions.put(version);
            }
        });

        const finalProgress: MetadataSyncProgress = {
            total,
            completed: completedTypes.length,
            current: "Complete",
            percentage: 100,
        };

        this.setState({
            status: "success",
            progress: finalProgress,
            lastSync: new Date().toISOString(),
        });
        onProgress?.(finalProgress);

        console.log("✅ Metadata sync complete (parallel)");
    }
    async fullSync(
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> {
        console.log("🔄 Starting full metadata sync (batched parallel)...");
        return this.syncMetadataBatched([...METADATA_TYPES], onProgress);
    }
    async forceFullSync(
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> {
        console.log("🔄 Force full sync - clearing version history...");
        await this.deleteAllMetadata();
        return this.syncMetadataBatched([...METADATA_TYPES], onProgress);
    }

    /**
     * Sync all metadata, optionally from the beginning (ignoring lastUpdated cursors).
     * - fromStart: true  → clears all per-type version timestamps, forces full re-fetch
     * - fromStart: false → uses lastUpdated incremental sync (same as syncChangedMetadata)
     */
    async syncAllMetadata(
        options: { fromStart?: boolean } = {},
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> {
        if (options.fromStart) {
            return this.forceFullSync(onProgress);
        }
        return this.syncChangedMetadata(onProgress);
    }

    async syncMetadataBatched(
        types: MetadataType[] = [...METADATA_TYPES],
        onProgress?: (progress: MetadataSyncProgress) => void,
        batchSize: number = 1,
    ): Promise<void> {
        this.setState({ status: "syncing" });

        const total = types.length;
        let completed = 0;

        for (let i = 0; i < types.length; i += batchSize) {
            const batch = types.slice(i, i + batchSize);
            const batchPromises = batch.map(async (type) => {
                await this.fetchMetadata(type);
                completed++;

                const progress: MetadataSyncProgress = {
                    total,
                    completed,
                    current: type,
                    percentage: Math.round((completed / total) * 100),
                };

                this.setState({ status: "syncing", progress });
                onProgress?.(progress);

                console.log(`✅ ${type} synced (${completed}/${total})`);
            });
            await Promise.all(batchPromises);
        }
        await this.queueWrite(async () => {
            const version = await db.metadataVersions.get("metadata-version");
            if (version) {
                version.lastSync = new Date().toISOString();
                await db.metadataVersions.put(version);
            }
        });

        const finalProgress: MetadataSyncProgress = {
            total,
            completed,
            current: "Complete",
            percentage: 100,
        };

        this.setState({
            status: "success",
            progress: finalProgress,
            lastSync: new Date().toISOString(),
        });
        onProgress?.(finalProgress);

        console.log("✅ Metadata sync complete (batched)");
    }
    /**
     * Delete all metadata from local database
     */
    async deleteAllMetadata(): Promise<void> {
        console.log("🗑️ Deleting all metadata...");
        await this.queueWrite(async () => {
            await Promise.all([
                db.programs.clear(),
                db.dataElements.clear(),
                db.trackedEntityAttributes.clear(),
                db.programRules.clear(),
                db.programRuleVariables.clear(),
                db.optionSets.clear(),
                db.optionGroups.clear(),
                db.metadataVersions.clear(),
            ]);
        });
        console.log("✅ All metadata deleted");
    }

    /**
     * Delete and refetch all metadata (full refresh)
     */
    async refetchAllMetadata(
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> {
        console.log("🔄 Starting full metadata refetch...");
        await this.deleteAllMetadata();
        return this.syncMetadataBatched([...METADATA_TYPES], onProgress);
    }

    /**
     * Sync only metadata types that have changed since last sync
     */
    async syncChangedMetadata(
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> {
        const changedTypes = await this.getChangedMetadataTypes();
        if (changedTypes.length === 0) {
            console.log("✅ No metadata updates needed");
            this.setState({
                status: "success",
                lastSync: new Date().toISOString(),
            });
            return;
        }

        console.log(
            `🔄 Syncing ${changedTypes.length} changed metadata types: ${changedTypes.join(", ")}`,
        );
        return this.syncMetadataBatched(changedTypes, onProgress);
    }

    /**
     * Explicitly sync villages (bypasses skipOnUpdate check)
     */
    async syncVillages(
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> {
        console.log("🏘️ Explicitly syncing villages...");
        // return this.syncMetadataBatched(["villages"], onProgress);
    }

    /**
     * Sync specific metadata types explicitly (bypasses skipOnUpdate check)
     */
    async syncSpecificTypes(
        types: MetadataType[],
        onProgress?: (progress: MetadataSyncProgress) => void,
    ): Promise<void> {
        console.log(`🔄 Explicitly syncing: ${types.join(", ")}`);
        return this.syncMetadataBatched(types, onProgress);
    }

    getState(): MetadataSyncState {
        return this.currentState;
    }
}

export function createMetadataSync(
    engine: ReturnType<typeof useDataEngine>,
): MetadataSync {
    return new MetadataSync(engine);
}
