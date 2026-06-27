import { assign, fromPromise, setup } from "xstate";
import {
    DataElement,
    Enrollment,
    Event,
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
    Metadata,
    OrgUnit,
    Program,
    ProgramIndicator,
    ProgramRule,
    ProgramRuleVariable,
    TrackedEntity,
    TrackedEntityAttribute,
} from "../schemas";

import type { useCurrentUserInfo, useDataEngine } from "@dhis2/app-runtime";
import { createActorContext } from "@xstate/react";
import { MessageInstance } from "antd/es/message/interface";
import { Table } from "dexie";
import {
    enrollmentsCollection,
    eventsCollection,
    trackedEntitiesCollection,
} from "../collections";
import { db } from "../db";
import {
    transformEnrollment,
    transformEvent,
    transformTrackedEntity,
} from "../db/transformers";
import { checkInfo, queryInfo } from "../utils/utils";
import {
    DataPullMode,
    DataPushMode,
    MetadataSyncMode,
    shouldRecordDataPush,
    shouldUseLastUpdatedFilter,
} from "./sync-metadata-mode";
import {
    PROGRAM_UID,
    SyncMode,
} from "../sync/config";
import {
    pullEventsIncremental,
    pullTrackedEntitiesIncremental,
} from "../sync/pullData";
import {
    submitTrackerImportAndAwaitReport,
} from "../sync/trackerImport";
import { submitEventDeletes } from "../sync/deletes";
import { acquireSyncLock, buildOwnerId, releaseSyncLock } from "../sync/lock";
import { getSyncDelayMs } from "../sync/scheduler";
import { SyncTelemetryBuilder } from "../sync/telemetry";
import { isSyncBlockedByUpdate } from "../update/syncGuard";
import { probeProgramVersion } from "../sync/programVersionProbe";
import {
    fail as progressFail,
    finish as progressFinish,
    labelFor as progressLabel,
    report as progressReport,
    saving as progressSaving,
    start as progressStart,
} from "../sync/metadataProgress";

function deriveValidIds(program: Program | undefined): {
    validAttributeIds: Set<string>;
    validDataElementsByStage: Map<string, Set<string>>;
} {
    if (!program) {
        return {
            validAttributeIds: new Set(),
            validDataElementsByStage: new Map(),
        };
    }
    return {
        validAttributeIds: new Set(
            program.programTrackedEntityAttributes.map(
                (ptea) => ptea.trackedEntityAttribute.id,
            ),
        ),
        validDataElementsByStage: new Map(
            program.programStages.map((stage) => [
                stage.id,
                new Set(
                    stage.programStageDataElements.map(
                        (psde) => psde.dataElement.id,
                    ),
                ),
            ]),
        ),
    };
}

async function isDhis2Reachable(engine: ReturnType<typeof useDataEngine>) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        return false;
    }

    try {
        await engine.query({
            ping: {
                resource: "me",
                params: {
                    fields: "id",
                },
            },
        });
        return true;
    } catch {
        return false;
    }
}

// Tracker async/sync import is implemented in src/sync/trackerImport.ts —
// the machine calls submitTrackerImportAndAwaitReport directly.

type Resource =
    | "programs"
    | "programStages"
    | "dataElements"
    | "trackedEntityTypes"
    | "optionSets"
    | "programIndicators"
    | "me"
    | "optionGroups"
    | "attributes"
    | "programRuleVariables"
    | "programRules";

export interface SyncContext {
    error: Error | null;
    info: string | undefined;
    engine: ReturnType<typeof useDataEngine>;
    lastDataPull: string | undefined;
    lastDataPush: string | undefined;
    lastMetadataPull: string | undefined;
    metadataSyncMode: MetadataSyncMode;
    dataPullMode: DataPullMode;
    dataPushMode: DataPushMode;
    resources: Resource[];
    user: string;
    orgUnit: string;
    validAttributeIds: Set<string>;
    validDataElementsByStage: Map<string, Set<string>>;
    message: MessageInstance;
    metadata: Partial<Awaited<ReturnType<typeof queryInfo>>>;
    userInfo: ReturnType<typeof useCurrentUserInfo>;
    rawMetadata: Metadata;
}

const syncReportToLocal = async ({
    entities,
    engine,
    validAttributeIds,
    validDataElementsByStage,
}: {
    entities: Array<
        FlattenedTrackedEntity | FlattenedEnrollment | FlattenedEvent
    >;
    engine: ReturnType<typeof useDataEngine>;
    validAttributeIds: Set<string>;
    validDataElementsByStage: Map<string, Set<string>>;
}) => {
    const reachable = await isDhis2Reachable(engine);
    if (!reachable) {
        return { processed: 0, succeeded: 0, failed: 0 };
    }

    const payload = entities.reduce<{
        trackedEntities: TrackedEntity[];
        enrollments: Enrollment[];
        events: Event[];
    }>(
        (acc, entity) => {
            if ("trackedEntityType" in entity) {
                acc.trackedEntities.push(
                    transformTrackedEntity(entity, validAttributeIds),
                );
            } else if ("enrolledAt" in entity) {
                acc.enrollments.push(
                    transformEnrollment(entity, validAttributeIds),
                );
            } else if ("event" in entity) {
                const stageIds =
                    validDataElementsByStage.get(entity.programStage) ??
                    new Set<string>();
                acc.events.push(transformEvent(entity, stageIds));
            }
            return acc;
        },
        {
            trackedEntities: [],
            enrollments: [],
            events: [],
        },
    );
    const response = await submitTrackerImportAndAwaitReport({
        engine,
        data: payload,
        params: {
            importStrategy: "CREATE_AND_UPDATE",
            atomicMode: "OBJECT",
            skipPatternValidation: true,
            skipSideEffects: true,
            reportMode: "ERRORS",
        },
        background: true,
    });
    if (!response) {
        // Async import accepted; we will reconcile when the job completes.
        return { processed: entities.length, succeeded: 0, failed: 0 };
    }
    const failedResponses = new Map(
        response.validationReport.errorReports.map((a) => [a.uid, a.message]),
    );

    const syncedEvents = new Set(
        response.bundleReport.typeReportMap.EVENT.objectReports.map(
            (a) => a.uid,
        ),
    );
    const syncedEnrollments = new Set(
        response.bundleReport.typeReportMap.ENROLLMENT.objectReports.map(
            (a) => a.uid,
        ),
    );

    const syncedEntities = new Set(
        response.bundleReport.typeReportMap.TRACKED_ENTITY.objectReports.map(
            (a) => a.uid,
        ),
    );

    const updatedEntities: FlattenedTrackedEntity[] = entities.flatMap((a) => {
        if ("trackedEntityType" in a && failedResponses.has(a.trackedEntity)) {
            return {
                ...a,
                syncStatus: "failed",
                lastSynced: new Date().toISOString(),
                syncError: failedResponses.get(a.trackedEntity),
            };
        } else if (
            "trackedEntityType" in a &&
            syncedEntities.has(a.trackedEntity)
        ) {
            return {
                ...a,
                syncStatus: "synced",
                lastSynced: new Date().toISOString(),
                syncError: failedResponses.get(a.trackedEntity),
            };
        }
        return [];
    });

    const updatedEnrolments: FlattenedEnrollment[] = entities.flatMap((a) => {
        if ("enrolledAt" in a && failedResponses.has(a.enrollment)) {
            return {
                ...a,
                syncStatus: "failed",
                lastSynced: new Date().toISOString(),
                syncError: failedResponses.get(a.enrollment),
            };
        } else if ("enrolledAt" in a && syncedEnrollments.has(a.enrollment)) {
            return {
                ...a,
                syncStatus: "synced",
                lastSynced: new Date().toISOString(),
                syncError: failedResponses.get(a.enrollment),
            };
        }
        return [];
    });

    const updatedEvents: FlattenedEvent[] = entities.flatMap((a) => {
        if ("event" in a && failedResponses.has(a.event)) {
            return {
                ...a,
                syncStatus: "failed",
                lastSynced: new Date().toISOString(),
                syncError: failedResponses.get(a.event),
            };
        } else if ("event" in a && syncedEvents.has(a.event)) {
            return {
                ...a,
                syncStatus: "synced",
                lastSynced: new Date().toISOString(),
                syncError: failedResponses.get(a.event),
            };
        }
        return [];
    });

    await trackedEntitiesCollection.utils.bulkUpdateLocally(updatedEntities);
    await enrollmentsCollection.utils.bulkUpdateLocally(updatedEnrolments);
    await eventsCollection.utils.bulkUpdateLocally(updatedEvents);

    return {
        processed: entities.length,
        succeeded:
            syncedEntities.size + syncedEnrollments.size + syncedEvents.size,
        failed: failedResponses.size,
    };
};

const syncDeleteToLocal = async ({
    deletedEvents,
    engine,
}: {
    deletedEvents: FlattenedEvent[];
    engine: ReturnType<typeof useDataEngine>;
}): Promise<{ succeeded: number; failed: number }> => {
    if (deletedEvents.length === 0) return { succeeded: 0, failed: 0 };

    const reachable = await isDhis2Reachable(engine);
    if (!reachable) {
        return { succeeded: 0, failed: 0 };
    }

    const { succeeded, failed } = await submitEventDeletes({
        engine,
        deletedEvents,
    });

    return {
        succeeded: succeeded.size,
        failed: failed.size,
    };
};

type SyncEvent =
    | {
          type: "PUSH_DATA";
      }
    | { type: "RETRY" }
    | { type: "START_METADATA_SYNC" }
    | { type: "START_DATA_SYNC" }
    | { type: "FULL_METADATA_SYNC" }
    | { type: "FULL_DATA_SYNC" }
    | {
          type: "EVALUATE_INDICATORS";
          event: FlattenedEvent;
          trackedEntity: FlattenedTrackedEntity;
      }
    | { type: "FULL_INDICATOR_SYNC" }
    | { type: "CANCEL" }
    | { type: "NETWORK_RECONNECT" }
    | { type: "PARENT_READY" }
    | { type: "PARENT_NOT_READY" };
const syncMachine = setup({
    types: {
        context: {} as SyncContext,
        events: {} as SyncEvent,
        input: {} as {
            engine: ReturnType<typeof useDataEngine>;
            initialLastMetadataPull?: string;
            initialLastDataPull?: string;
            initialLastDataPush?: string;
            user: string;
            orgUnit: string;
            message: MessageInstance;
            userInfo: ReturnType<typeof useCurrentUserInfo>;
        },
    },

    actions: {
        markAsSuccessful: () => {},

        notifySuccess: ({ context }) => {
            context.message.success(context.info);
        },
        notifyFailure: ({ context }) => {
            context.message.error(context.error?.message);
        },
        resetLastDataPull: assign({
            lastDataPull: undefined,
        }),

        resetLastMetadataPull: assign({
            lastMetadataPull: undefined,
        }),

        persistSyncState: ({ context }) => {
            db.syncState.put({
                id: "current",
                status: "idle",
                isOnline: true,
                isSyncing: false,
                lastPullAt: context.lastDataPull,
                lastPushAt: context.lastDataPush,
                pendingCount: 0,
                updatedAt: new Date().toISOString(),
            });
        },
    },
    actors: {
        checkIndexDB: fromPromise<
            Awaited<ReturnType<typeof checkInfo>>,
            {
                user: string;
                id: string;
                engine: ReturnType<typeof useDataEngine>;
                program: string;
            }
        >(async ({ input: { user, id, engine, program } }) => {
            // Cheap server probe — does the program version differ from
            // what we have stored? Undefined means probe failed (offline
            // or transient), in which case checkInfo will fall back to
            // the legacy 24h timer.
            const remoteProgramSummary = await probeProgramVersion(
                engine,
                program,
            );
            return checkInfo({
                user,
                id,
                remoteProgramSummary,
            });
        }),
        queryIndexDB: fromPromise<
            Awaited<ReturnType<typeof queryInfo>>,
            { user: string; id: string }
        >(async ({ input: { id, user } }) => {
            return queryInfo(user, id);
        }),
        pullData: fromPromise<
            void,
            {
                program: string;
                orgUnit: string;
                lastDataPull: string | undefined;
                engine: ReturnType<typeof useDataEngine>;
                dataPullMode: DataPullMode;
                user?: string;
            }
        >(
            async ({
                input: {
                    lastDataPull,
                    orgUnit,
                    program,
                    engine,
                    dataPullMode,
                    user,
                },
            }) => {
                // Phase 17: stop running old sync code once a new build
                // has been deployed — the safe refresh flow will reload
                // the page so the new bundle takes over.
                if (isSyncBlockedByUpdate()) {
                    return;
                }

                // Per-device lock: prevent duplicate concurrent sync across
                // tabs/reloads. If we cannot acquire, skip silently — the
                // other tab is already syncing.
                const ownerId = buildOwnerId({ userUid: user });
                const acquired = await acquireSyncLock(
                    "background-data-pull",
                    ownerId,
                    30 * 60 * 1000,
                );
                if (!acquired) {
                    return;
                }

                const telemetry = new SyncTelemetryBuilder("data-pull", {
                    orgUnitUid: orgUnit,
                    userUid: user,
                });

                try {
                    const mode: SyncMode =
                        dataPullMode === "full"
                            ? "full-manual-admin"
                            : "incremental";

                    const tePull = await pullTrackedEntitiesIncremental({
                        engine,
                        program,
                        orgUnit,
                        lastDataPull,
                        mode,
                    });
                    telemetry
                        .incr("pagesPulled", tePull.pages)
                        .incr(
                            "trackedEntitiesPulled",
                            tePull.trackedEntitiesPulled,
                        );

                    const eventsPull = await pullEventsIncremental({
                        engine,
                        program,
                        orgUnit,
                        lastEventPull: lastDataPull,
                        mode,
                    });
                    telemetry
                        .incr("pagesPulled", eventsPull.pages)
                        .incr("eventsPulled", eventsPull.eventsPulled);
                } finally {
                    await releaseSyncLock("background-data-pull", ownerId);
                    await telemetry.finish();
                }
            },
        ),
        saveMetadata: fromPromise<void, Metadata>(async ({ input }) => {
            await db.organisationUnits.bulkPut(input.organisationUnits);
            await db.programs.bulkPut(input.programs);
            await db.dataElements.bulkPut(input.dataElements);
            await db.programIndicators.bulkPut(input.programIndicators);
            await db.trackedEntityAttributes.bulkPut(
                input.trackedEntityAttributes,
            );
            await db.programRules.bulkPut(input.programRules);
            await db.programRuleVariables.bulkPut(input.programRuleVariables);
            await db.optionSets.bulkPut(input.optionSets);
            await db.optionGroups.bulkPut(input.optionGroups);

            // Capture program.version + lastUpdated on the metadataVersion
            // row so the next app load's probe can short-circuit when the
            // server hasn't moved.
            const programPayload = input.programs?.[0] as
                | { version?: number; lastUpdated?: string }
                | undefined;
            if (
                programPayload &&
                input.metadataVersion?.[0] &&
                typeof programPayload.version === "number"
            ) {
                input.metadataVersion[0].programVersion = programPayload.version;
                input.metadataVersion[0].programLastUpdated =
                    programPayload.lastUpdated;
            }
            await db.metadataVersions.bulkPut(input.metadataVersion);
            progressFinish();
        }),
        pullResource: fromPromise<
            Metadata,
            {
                resources: Resource[];
                engine: ReturnType<typeof useDataEngine>;
                lastMetadataPull: string | undefined;
                metadataSyncMode: MetadataSyncMode;
            }
        >(async ({ input }) => {
            const { resources, engine, lastMetadataPull, metadataSyncMode } =
                input;

            const results: Metadata = {
                dataElements: [],
                optionGroups: [],
                optionSets: [],
                organisationUnits: [],
                programs: [],
                programIndicators: [],
                programRules: [],
                programRuleVariables: [],
                trackedEntityAttributes: [],
                metadataVersion: [],
            };
            progressStart(resources);
            let stepIndex = 0;
            for (const resource of resources) {
                progressReport(stepIndex, progressLabel(resource));
                stepIndex += 1;
                switch (resource) {
                    case "me":
                        const { me } = (await engine.query({
                            me: {
                                resource: "me",
                                params: {
                                    fields: "id,organisationUnits[id,name,level,parent,leaf]",
                                },
                            },
                        })) as {
                            me: {
                                organisationUnits: OrgUnit[];
                                id: string;
                            };
                        };

                        results.organisationUnits = me.organisationUnits.map(
                            (ou) => ({
                                ...ou,
                                user: me.id,
                            }),
                        );
                        break;

                    case "programs":
                        const { program } = (await engine.query({
                            program: {
                                resource: "programs",
                                id: "ueBhWkWll5v",
                                params: {
                                    fields: "id,name,version,lastUpdated,programSections[id,name,sortOrder,trackedEntityAttributes[id]],trackedEntityType[id,trackedEntityTypeAttributes[id]],programType,selectEnrollmentDatesInFuture,selectIncidentDatesInFuture,organisationUnits[id,name],programStages[id,repeatable,name,code,programStageDataElements[id,compulsory,renderOptionsAsRadio,dataElement[id],renderType,allowFutureDate],programStageSections[id,name,sortOrder,dataElements[id]]],programTrackedEntityAttributes[id,mandatory,searchable,renderOptionsAsRadio,renderType,sortOrder,allowFutureDate,displayInList,trackedEntityAttribute[id]]",
                                },
                            },
                        })) as { program: Program };
                        results.programs = [program];
                        break;

                    case "dataElements":
                        const dataElementsParams: any = {
                            fields: "id,name,code,valueType,formName,optionSetValue,optionSet[id]",
                            paging: false,
                        };

                        if (
                            shouldUseLastUpdatedFilter(
                                metadataSyncMode,
                                lastMetadataPull,
                            )
                        ) {
                            dataElementsParams.filter = `lastUpdated:gt:${lastMetadataPull}`;
                        }
                        const {
                            dataElements: { dataElements },
                        } = (await engine.query({
                            dataElements: {
                                resource: "dataElements",
                                params: dataElementsParams,
                            },
                        })) as {
                            dataElements: {
                                dataElements: DataElement[];
                            };
                        };

                        results.dataElements = dataElements;
                        break;
                    case "programIndicators":
                        const programIndicatorsParams: any = {
                            fields: "id,name,filter,program,aggregationType,expression",
                            paging: false,
                        };
                        if (
                            shouldUseLastUpdatedFilter(
                                metadataSyncMode,
                                lastMetadataPull,
                            )
                        ) {
                            programIndicatorsParams.filter = `lastUpdated:gt:${lastMetadataPull}`;
                        }
                        const {
                            programIndicators: { programIndicators },
                        } = (await engine.query({
                            programIndicators: {
                                resource: "programIndicators",
                                params: programIndicatorsParams,
                            },
                        })) as {
                            programIndicators: {
                                programIndicators: ProgramIndicator[];
                            };
                        };

                        results.programIndicators = programIndicators;

                        break;

                    case "attributes":
                        const attributesParams: any = {
                            fields: "id,name,code,unique,generated,pattern,confidential,valueType,optionSetValue,displayFormName,formName,optionSet[id]",
                            paging: false,
                        };
                        if (
                            shouldUseLastUpdatedFilter(
                                metadataSyncMode,
                                lastMetadataPull,
                            )
                        ) {
                            attributesParams.filter = `lastUpdated:gt:${lastMetadataPull}`;
                        }
                        const {
                            trackedEntityAttributes: {
                                trackedEntityAttributes,
                            },
                        } = (await engine.query({
                            trackedEntityAttributes: {
                                resource: "trackedEntityAttributes",
                                params: attributesParams,
                            },
                        })) as {
                            trackedEntityAttributes: {
                                trackedEntityAttributes: TrackedEntityAttribute[];
                            };
                        };

                        results.trackedEntityAttributes =
                            trackedEntityAttributes;
                        break;

                    case "programRules":
                        const programRulesFilters = [
                            "program.id:eq:ueBhWkWll5v",
                        ];
                        if (
                            shouldUseLastUpdatedFilter(
                                metadataSyncMode,
                                lastMetadataPull,
                            )
                        ) {
                            programRulesFilters.push(
                                `lastUpdated:gt:${lastMetadataPull}`,
                            );
                        }
                        const {
                            programRules: { programRules },
                        } = (await engine.query({
                            programRules: {
                                resource: `programRules.json`,
                                params: {
                                    filter: programRulesFilters,
                                    fields: "*,programRuleActions[*]",
                                    paging: false,
                                },
                            },
                        })) as {
                            programRules: {
                                programRules: ProgramRule[];
                            };
                        };

                        results.programRules = programRules;

                        break;

                    case "programRuleVariables":
                        const programRuleVariablesFilters = [
                            "program.id:eq:ueBhWkWll5v",
                        ];
                        if (
                            shouldUseLastUpdatedFilter(
                                metadataSyncMode,
                                lastMetadataPull,
                            )
                        ) {
                            programRuleVariablesFilters.push(
                                `lastUpdated:gt:${lastMetadataPull}`,
                            );
                        }
                        const {
                            programRuleVariables: { programRuleVariables },
                        } = (await engine.query({
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

                        results.programRuleVariables = programRuleVariables;
                        break;

                    case "optionSets":
                        const optionSetsParams: any = {
                            fields: "id,options[id,name,code,sortOrder]",
                            paging: false,
                        };
                        if (
                            shouldUseLastUpdatedFilter(
                                metadataSyncMode,
                                lastMetadataPull,
                            )
                        ) {
                            optionSetsParams.filter = `lastUpdated:gt:${lastMetadataPull}`;
                        }
                        const { optionSets } = (await engine.query({
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
                                        sortOrder: number;
                                    }[];
                                }[];
                            };
                        };

                        const flattenedOptionSets =
                            optionSets.optionSets.flatMap((os) =>
                                os.options.map((o) => ({
                                    ...o,
                                    optionSet: os.id,
                                })),
                            );
                        results.optionSets = flattenedOptionSets;
                        break;

                    case "optionGroups":
                        const optionGroupsParams: any = {
                            fields: "id,options[id,name,code,sortOrder]",
                            paging: false,
                        };
                        if (
                            shouldUseLastUpdatedFilter(
                                metadataSyncMode,
                                lastMetadataPull,
                            )
                        ) {
                            optionGroupsParams.filter = `lastUpdated:gt:${lastMetadataPull}`;
                        }
                        const { optionGroups } = (await engine.query({
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
                                        sortOrder: number;
                                    }[];
                                }>;
                            };
                        };

                        const flattenedOptionGroups =
                            optionGroups.optionGroups.flatMap((og) =>
                                og.options.map((o) => ({
                                    ...o,
                                    optionGroup: og.id,
                                })),
                            );
                        results.optionGroups = flattenedOptionGroups;
                        break;
                }

                const currentTimestamp = new Date().toISOString();
                let version = await db.metadataVersions.get("metadata-version");
                if (version === undefined) {
                    version = {
                        id: "metadata-version",
                        lastSync: currentTimestamp,
                        versions: {},
                    };
                }
                version.versions[resource] = currentTimestamp;
                version.lastSync = currentTimestamp;
                results.metadataVersion = [version];
            }
            progressSaving();
            return results;
        }),
        deleteAllMetadata: fromPromise(async () => {
            await db.organisationUnits.clear();
            await db.programs.clear();
            await db.dataElements.clear();
            await db.programIndicators.clear();
            await db.trackedEntityAttributes.clear();
            await db.programRules.clear();
            await db.programRuleVariables.clear();
            await db.optionSets.clear();
            await db.optionGroups.clear();
            await db.metadataVersions.clear();
        }),
        deleteAllData: fromPromise<void>(async () => {}),
        processBatchSync: fromPromise(
            async ({
                input,
            }: {
                input: {
                    engine: ReturnType<typeof useDataEngine>;
                    validAttributeIds: Set<string>;
                    validDataElementsByStage: Map<string, Set<string>>;
                };
            }) => {
                // Phase 17 guard: do not push old payloads using stale
                // code once a new version has been deployed.
                if (isSyncBlockedByUpdate()) {
                    return { processed: 0, succeeded: 0, failed: 0 };
                }

                const { engine, validAttributeIds, validDataElementsByStage } =
                    input;

                const teTable: Table<FlattenedTrackedEntity, string> =
                    trackedEntitiesCollection.utils.getTable();
                const eventTable: Table<FlattenedEvent, string> =
                    eventsCollection.utils.getTable();
                const enrollTable: Table<FlattenedEnrollment, string> =
                    enrollmentsCollection.utils.getTable();

                const pendingTEs = await teTable
                    .filter((e) => e.syncStatus === "pending")
                    .toArray();

                const pendingEnrollments = await enrollTable
                    .filter((e) => e.syncStatus === "pending" && !!e.enrolledAt)
                    .toArray();

                const pendingEvents = await eventTable
                    .filter((e) => e.syncStatus === "pending" && !!e.occurredAt)
                    .toArray();

                const deletedEvents = await eventTable
                    .filter((e) => e.syncStatus === "deleted")
                    .toArray();

                if (
                    pendingTEs.length === 0 &&
                    pendingEnrollments.length === 0 &&
                    pendingEvents.length === 0 &&
                    deletedEvents.length === 0
                ) {
                    return { processed: 0, succeeded: 0, failed: 0 };
                }

                let upsertResult = { processed: 0, succeeded: 0, failed: 0 };
                if (
                    pendingTEs.length > 0 ||
                    pendingEnrollments.length > 0 ||
                    pendingEvents.length > 0
                ) {
                    upsertResult = await syncReportToLocal({
                        entities: [
                            ...pendingTEs,
                            ...pendingEnrollments,
                            ...pendingEvents,
                        ],
                        engine,
                        validAttributeIds,
                        validDataElementsByStage,
                    });
                }

                let deleteResult = { succeeded: 0, failed: 0 };
                if (deletedEvents.length > 0) {
                    deleteResult = await syncDeleteToLocal({
                        deletedEvents,
                        engine,
                    });
                }

                return {
                    processed:
                        upsertResult.processed +
                        deleteResult.succeeded +
                        deleteResult.failed,
                    succeeded: upsertResult.succeeded + deleteResult.succeeded,
                    failed: upsertResult.failed + deleteResult.failed,
                };
            },
        ),
    },
    delays: {
        // Background data PUSH: every ~30 min with small jitter once the
        // first scheduled slot has passed. We keep the recurring cadence
        // short so users see push progress.
        dataSyncInterval: () =>
            1000 * 60 * 30 + Math.random() * 1000 * 60 * 5,
        // Background data PULL: recurring cadence used after the first
        // scheduled slot pull has happened. We keep this at ~30 min so
        // facilities don't constantly hit the tracker endpoint.
        dataPullInterval: () =>
            1000 * 60 * 30 + Math.random() * 1000 * 60 * 5,
        // Initial PULL on app open: defer to the facility's scheduled
        // sync slot (see src/sync/scheduler.ts). This is the change that
        // stops hundreds of facilities all hitting DHIS2 simultaneously
        // when working hours begin. Capped at 2h so off-slot users still
        // sync that day.
        initialDataPullDelay: ({ context }) => {
            const ctx = context as SyncContext;
            const delay = getSyncDelayMs({
                orgUnitUid: ctx.orgUnit,
                userUid: ctx.user,
            });
            return Math.min(delay, 1000 * 60 * 60 * 2);
        },
    },
}).createMachine({
    /** @xstate-layout N4IgpgJg5mDOIC5SwJ4DsDGA6AtmALgIYSFEDK62AlhADZgDEEA9mmFlWgG7MDW7qTLgLFShCkJr0EnHhlJVWAbQAMAXVVrEoAA7NYVfIrTaQAD0QBmAEwBGLCoAsANgAcrlbduXbAVl+WjgA0ICiItiq+jg6WAJwqAOy2Cc6+7gC+6SGC2HhEJOSUHHSMLGwc3HwCRXmihZIlMpXyRsrqSrZaSCB6Bq0m3RYI1q6WWAmxqd7x1nYJrsGh4bau1uNuNrbxo76Z2TUiBeJFUoxgAE7nzOdYOrSkAGbXOFg5wvliEtSNsswtxppNKZeoZjKYhpsHC53J5vH4AoswghRq4sL55t44o50a5bHsQG9akcvsV6AwyAAVACCACUKQB9ACyAFFqQARKnU+lkACaADkAMJA7og-rgxAJMZRXxeFQqWKWZzWRzykJI2wq6LeVKOWIRWzOTz4wmHT4nEoMABiAFUADK2pmsqkcrm8wXC3T6UGscUISwJLDWVIqDwTZwJXWqpYIPwTcZ2Gx6lRK2LWY0HD71bCwQhcThQRmmohMVjsX78V4ZurHIQ5vNoAtFwhNOQKNoadTAr1iwbhVzOLUq5ypGWWVyxSZq8KOLZYVPjw16xz99NCIlmoQARwArhcUPmAJJoCBgMxsgBCJfK5eqa6bJJ3e8Px9PF5bfzbaEBnZF3bBvZjftB2TEdvHHSdo2SawxiSVwEgSaxYQWFZV1ye8ikfc59wbI8TzPS8LiuG47keZ5KzvTMa2wTDsKgXDX3Pd9-nbD0ej-H0ANmBJfDnZNrAnBUokcCMpxjGcA0cEZJnlDUVyyAkq2JIoT3oIwG0LSirzLSoKxNSiSRUgh8w06smM-b8uk9Pp-1AIYNRGLANWTfwXFiXFHERadLB4zxZliFx7N8FRLFQ95qwMsBVOMpsGEI65bnufAnnOF49PC5TIqM9SmzM-oLK7ayONs6cHKckdXPczzAPHKE3DcqZhLxeS0qU2tKHzLSKh4XTFI3bN2obXKAXaH8rO9AZioQeJYkDXFuPReZfGVBJRLhVFEI8nxJjmSZQvXLNyIwDqym07rbzQ-SihyfMhpYzoCvG313HsJx3GxJUuOE1aZRmraEIWBJImTELmt6g7robWLLnikikrIlq+sOm7fmYr8RsstjCom8xEFWX7HH9cNdQQiMVsgxCeIjYT0RnKIvDTUGKPSoQAHdCFBSHKVpBkWXZTkqW5fkhVGzHHoAgcVHGXFlSW5dlwHVaB2iRqQw8ILrHRXZGYu5nsDZjmoCtO0HV551+cF90RdFGycb9Pw5zSHxcU8Anh0VjysEajaB0CRw9vQ1n2bUw2zFgIh8HYQgHgj84AApDTlFQAEoGARg79eD1jraK23IScNwPC8Hx-ECVaCeiby-A8SwVGg8dQta74yTdAV6WZPkKQPTvmTILP2OxoZEMloLE4NHwh6W0SNcBrA4KCmvnECGW-e1rBG9JRgAAVrTIAAJekXSpPusd9Ie0UTzxF9sCfrCnhesH9dX4lp+CV-2IR19OBhQ-DyPo4uWONdE4pzeJ-Eox8xaTTPiPOUY9r5ykntGWYaRZ7cVrtLSYLgG6IwgFQc4YAMD4C+AwCBPZJrDmcLPfOAkAjcVcL4Ke6I1iP2CsmEm8Etbv2wOvbcdxmDEHzGyPBBD8CdRvIdNeiNeG0H4bghsQj8GENumjDsGNs4D2WIkRyctDQRH8kGMmSJlR2HPkGSwlcogTmwQdaRsjBHCMIVDIiCVSIpQkTwvhAj5EOPwMo-Kv4T7i38p7R+cJF6+FiOiKeKoeJpAicOZc1gOEgy4ZIg6AAjUgGAAAWxCTpdSqO4xGmT8A5K+H49GD0yG2woVQ1yE5aFxKnkGewLCRjX0wc4axVEsAlLKZQJxMNErJVSspYpWTcmUAqaoqpNtB5ynPqPK+N8p4Gh4vxZw8QIiBEiE1VJHiChgFtIQMObIxCb23LAbJJCrb919PAmadg4LcWgvZWIU9861XiJEeYIZfBdNXkcC5tBaAb3JNSOkB9zYt1IXM8IqY5yphWLEQG44FhBm+i9C+iF+KKhed04FoKv42ntFC10QtYU5zsgiicTyUUhjcpJZw0SxgfTiBMOw6sIwEu3CCsFP9SB-xjvHC+ICxlEEJRvSlGiYw0qReOVFjKMVIOCdfaCbkky6lGDyvlDxeW0BpGAB4+CrliJ0udNJhBJV6pBYa41cBsnTOlb6JU0RgrxAjIqccQUGHRi2oGGBgRvJhhSQpD+5z9VYBtQao1JrrlxWIsM+G4qrWRujXauNTrbmBPIcqGIHrXbesiFPJI4wYEazrqkUNoCI18ohobfJ4ia0SsjfWrNai7kAQiEGB+Mo0hJPgp4fsoklqomHBqReE4fCpABfs2toL62DMTa40Z4aW11oGlAdtsyqXhFrpQixqx4KAxWMy6My57AGgnTXaWgRZ1hu4fOrAvDDnHNOfOm5Hac22z0WsGcKoFjCU1L6pEw4eI2FxMXRCY43A6tBRnDqXNIWHwtsLL9kCf1yrpYq9FZ6kRRDGIkSD8o4LeVg4Cp9CHIYkodChmF2aMPUrWLS5FOGmWiUCPYNlE5VjGIVHBrAVGQ5h0FVgKOwqE5yjFWu1NfKhPOq7Vh1jDLcOiV1LEjEQDuKSU1pkeSaBmAnngN0HIO6ZUAFoUGSl1FsaDGsZKiXM3mi+tmBJjn7NWsGVEzO+nMxEcYgQ9SpmCvZvUoluIvU01iHEeyH1hTAfQHzAEEKrRrr9a+Mplz0OSf7S6tZczRUoklyaBphKOXs95bE-FoJVWmDxSSC5a4IRHLl3WWAaLPjwheYrtsKaogCEmSUOpatxGY1JQ0SSgwl1a+vQywcTJHB63ZU9jk57LTcHXQxJVogpD8gTMc3aZuI3rUtxAM4xiKm8v6DVF6FaQUkjtpUyRX42f8kd9OQd8ynYQIvAMgN1PevcGkPD4QUhSjxv8lE813s9IeOzWg258HfeWjNaEHgmX+A1GXa+Dh5jSWPQ1t+cXG7I9q5E-r9S0gzkmMkbpJJTjfZS0gyIqICYorSMFf50E6fKR8V8b7BMeL0KiHQyMkpXCMLK3PVhrD0SeZkySWxXioAKJEd99wqJxzJh02slU7ykGSUlk4A0kTJgymnjzoQfTJmYAFyYtBcphwISCqmKqsxFSoK5cuKmsXm09JfYKt9+Azktqud97wtcQkvM2Sid6zSe1tKSAify96-eEtJ6JRensBKhkTs4LwRO0+RoZwExjiBgm6ieaGeCowRIG61O7lFSKvcCfTbGh1AuvAOCI1sGcIWaYceCmiOIzkfqKh9gJk7pfqlDEA45TwOJFwRGHeemqeoJ38QWPEOIAmA8RyDyH2TtBw8rB4ovEYipZgDiVJnrRMWgHDg877lNkqhOM9vtGKIax-oR419iJIre8OiOYAJ+9CWA5+owH01+H+SIwkzGBeSozy-YkwCQem6QQAA */
    id: "sync",
    type: "parallel",
    context: ({ input: { engine, user, orgUnit, message, userInfo } }) => {
        return {
            engine,
            error: null,
            resources: [
                "me",
                "programs",
                "programStages",
                "dataElements",
                "optionSets",
                "optionGroups",
                "attributes",
                "programRuleVariables",
                "programRules",
            ],

            enrollmentsCollection,
            eventsCollection,
            trackedEntitiesCollection,
            lastDataPull: undefined,
            lastDataPush: undefined,
            lastMetadataPull: undefined,
            metadataSyncMode: "full",
            dataPullMode: "incremental",
            dataPushMode: "batch",
            user,
            orgUnit,
            validAttributeIds: new Set<string>(),
            validDataElementsByStage: new Map<string, Set<string>>(),
            message,
            info: undefined,
            metadata: {},
            userInfo,
            rawMetadata: {
                dataElements: [],
                optionGroups: [],
                optionSets: [],
                organisationUnits: [],
                programs: [],
                programIndicators: [],
                programRules: [],
                programRuleVariables: [],
                trackedEntityAttributes: [],
                metadataVersion: [],
            },
        };
    },
    states: {
        metadataSync: {
            initial: "idle",
            id: "metadataSync",
            states: {
                idle: {
                    invoke: {
                        src: "checkIndexDB",
                        input: ({ context }) => {
                            return {
                                user: context.user,
                                id: context.orgUnit,
                                engine: context.engine,
                                // Hard-coded program id matches the rest of
                                // the app (App.tsx, hooks, sync flow).
                                program: "ueBhWkWll5v",
                            };
                        },
                        onDone: [
                            {
                                target: "queryingIndexDB",
                                guard: ({ event }) => {
                                    return !event.output.needsSyncing;
                                },
                                actions: assign(({ event }) => {
                                    return {
                                        lastMetadataPull:
                                            event.output.metadataVersion
                                                ?.lastSync,
                                        lastDataPull:
                                            event.output.syncStatus?.lastPullAt,
                                        lastDataPush:
                                            event.output.syncStatus?.lastPushAt,
                                        ...deriveValidIds(event.output.program),
                                    };
                                }),
                            },
                            {
                                target: "syncing",
                                guard: ({ event }) => {
                                    return event.output.needsSyncing;
                                },

                                actions: assign(({ event }) => {
                                    const mode =
                                        event.output.hasEmptyTables ||
                                        event.output.wasIndexedDBDeleted
                                            ? "full"
                                            : "incremental"; // !syncedWithin24Hours but tables populated → incremental
                                    return {
                                        metadataSyncMode: mode,
                                        lastMetadataPull:
                                            event.output.metadataVersion
                                                ?.lastSync,
                                        ...deriveValidIds(event.output.program),
                                    };
                                }),
                            },
                        ],

                        onError: "failure",
                    },
                    on: {
                        START_METADATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                metadataSyncMode: () => "incremental",
                            }),
                        },
                        FULL_METADATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                metadataSyncMode: () => "full",
                            }),
                        },
                    },
                },
                savingMetadata: {
                    invoke: {
                        src: "saveMetadata",
                        input: ({ context: { rawMetadata } }) => {
                            return rawMetadata;
                        },
                        onDone: {
                            target: "queryingIndexDB",
                        },
                    },
                },
                queryingIndexDB: {
                    invoke: {
                        src: "queryIndexDB",
                        input: ({ context }) => {
                            return {
                                user: context.user,
                                id: context.orgUnit,
                            };
                        },
                        onDone: {
                            target: "waiting",
                            actions: assign(({ event }) => {
                                return {
                                    metadata: event.output,
                                    ...deriveValidIds(event.output.program),
                                };
                            }),
                        },
                        onError: "failure",
                    },
                },
                deletingMetadata: {
                    invoke: {
                        src: "deleteAllMetadata",
                        onDone: "savingMetadata",
                        onError: "failure",
                    },
                },

                syncing: {
                    invoke: {
                        src: "pullResource",
                        input: ({
                            context: {
                                engine,
                                resources,
                                lastMetadataPull,
                                metadataSyncMode,
                            },
                        }) => {
                            return {
                                resources,
                                engine,
                                lastMetadataPull,
                                metadataSyncMode,
                            };
                        },

                        onDone: [
                            {
                                guard: ({ context: { metadataSyncMode } }) => {
                                    return metadataSyncMode === "incremental";
                                },

                                actions: assign(({ event }) => ({
                                    lastMetadataPull:
                                        event.output.metadataVersion[0]
                                            .lastSync,
                                    rawMetadata: event.output,
                                })),
                                target: "savingMetadata",
                            },
                            {
                                guard: ({ context: { metadataSyncMode } }) => {
                                    return metadataSyncMode === "full";
                                },

                                actions: assign(({ event }) => ({
                                    lastMetadataPull:
                                        event.output.metadataVersion[0]
                                            .lastSync,
                                    rawMetadata: event.output,
                                })),
                                target: "deletingMetadata",
                            },
                        ],

                        onError: "failure",
                    },
                },
                waiting: {
                    on: {
                        START_METADATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                metadataSyncMode: () => "incremental",
                            }),
                        },

                        FULL_METADATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                metadataSyncMode: () => "full",
                            }),
                        },
                    },
                },

                failure: {
                    // Without these, a single transient error (offline, 4xx)
                    // permanently bricks metadata sync because XState
                    // silently drops unhandled events.
                    on: {
                        START_METADATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                metadataSyncMode: () => "incremental",
                            }),
                        },
                        FULL_METADATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                metadataSyncMode: () => "full",
                            }),
                        },
                        NETWORK_RECONNECT: {
                            target: "syncing",
                            actions: assign({
                                metadataSyncMode: () => "incremental",
                            }),
                        },
                    },
                },
            },
        },
        dataSync: {
            initial: "idle",
            id: "dataSync",
            states: {
                idle: {
                    on: {
                        PUSH_DATA: {
                            target: "batchSync",
                            actions: assign({
                                dataPushMode: () => "batch",
                            }),
                        },
                        NETWORK_RECONNECT: {
                            target: "batchSync",
                            actions: assign({
                                dataPushMode: () => "batch",
                            }),
                        },
                    },
                    after: {
                        dataSyncInterval: {
                            target: "batchSync",
                            actions: assign({
                                dataPushMode: () => "batch",
                            }),
                        },
                    },
                },

                batchSync: {
                    invoke: {
                        src: "processBatchSync",
                        input: ({ context }) => ({
                            engine: context.engine,
                            validAttributeIds: context.validAttributeIds,
                            validDataElementsByStage:
                                context.validDataElementsByStage,
                        }),
                        onDone: [
                            {
                                guard: ({ event }) =>
                                    shouldRecordDataPush(event.output),
                                target: "updateLastDataPush",
                            },
                            {
                                target: "idle",
                            },
                        ],
                        onError: {
                            target: "idle",
                            actions: ({ event }) => {
                                console.error("Batch sync error:", event.error);
                            },
                        },
                    },
                },

                updateLastDataPush: {
                    entry: [
                        assign({
                            lastDataPush: () => new Date().toISOString(),
                        }),
                        "persistSyncState",
                    ],
                    always: "idle",
                },
            },
        },
        dataPull: {
            initial: "idle",
            id: "dataPull",
            states: {
                idle: {
                    after: {
                        // Defer the initial data pull to the facility's
                        // scheduled sync slot (spec §4). Manual sync via
                        // START_DATA_SYNC / NETWORK_RECONNECT still works
                        // immediately.
                        initialDataPullDelay: "syncing",
                    },
                    on: {
                        START_DATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                dataPullMode: () => "incremental",
                            }),
                        },

                        FULL_DATA_SYNC: {
                            target: "fullRefresh",
                            actions: assign({
                                dataPullMode: () => "full",
                            }),
                        },

                        NETWORK_RECONNECT: {
                            target: "syncing",
                            actions: assign({
                                dataPullMode: () => "incremental",
                            }),
                        },
                    },
                },
                fullRefresh: {
                    invoke: {
                        src: "deleteAllData",
                        onDone: {
                            target: "syncing",
                        },
                        onError: "failure",
                    },
                },

                syncing: {
                    invoke: {
                        src: "pullData",
                        input: ({
                            context: {
                                engine,
                                lastDataPull,
                                orgUnit,
                                dataPullMode,
                                user,
                            },
                        }) => ({
                            engine,
                            lastDataPull,
                            orgUnit,
                            program: PROGRAM_UID,
                            dataPullMode,
                            user,
                        }),

                        onDone: {
                            target: "updateLastDataPull",
                        },

                        onError: "failure",
                    },
                },
                updateLastDataPull: {
                    entry: [
                        assign({
                            lastDataPull: () => new Date().toISOString(),
                            dataPullMode: () => "incremental",
                        }),
                        "persistSyncState",
                    ],
                    always: "waiting",
                },

                waiting: {
                    after: {
                        dataPullInterval: {
                            target: "syncing",
                            actions: assign({
                                dataPullMode: () => "incremental",
                            }),
                        },
                    },
                    on: {
                        START_DATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                dataPullMode: () => "incremental",
                            }),
                        },
                        FULL_DATA_SYNC: {
                            target: "fullRefresh",
                            actions: assign({
                                dataPullMode: () => "full",
                            }),
                        },
                        NETWORK_RECONNECT: {
                            target: "syncing",
                            actions: assign({
                                dataPullMode: () => "incremental",
                            }),
                        },
                    },
                },
                failure: {
                    // Same recovery pattern as metadataSync.failure — a
                    // dead-end here means the "Pull data" button (and any
                    // automatic NETWORK_RECONNECT) silently no-ops after
                    // the first failed pull.
                    on: {
                        START_DATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                dataPullMode: () => "incremental",
                            }),
                        },
                        FULL_DATA_SYNC: {
                            target: "fullRefresh",
                            actions: assign({
                                dataPullMode: () => "full",
                            }),
                        },
                        NETWORK_RECONNECT: {
                            target: "syncing",
                            actions: assign({
                                dataPullMode: () => "incremental",
                            }),
                        },
                    },
                },
            },
        },
    },
});

export const SyncContext = createActorContext(syncMachine);
