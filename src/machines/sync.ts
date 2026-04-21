import { assertEvent, assign, fromPromise, setup } from "xstate";
import {
    DataElement,
    Dhis2Report,
    Enrollment,
    Event,
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
    OrgUnit,
    Program,
    ProgramIndicator,
    ProgramRule,
    ProgramRuleVariable,
    TrackedEntity,
    TrackedEntityAttribute,
} from "../schemas";

import type { useDataEngine } from "@dhis2/app-runtime";
import { createActorContext } from "@xstate/react";
import { Table } from "dexie";
import {
    createEnrollmentCollection,
    createEventCollection,
    createTrackedEntityCollection,
} from "../collections";
import { db, MetadataVersion } from "../db";
import {
    mergeBulkEnrollments,
    mergeBulkEvents,
    mergeBulkTrackedEntities,
} from "../db/merge-utils";
import {
    transformEnrollment,
    transformEvent,
    transformTrackedEntity,
} from "../db/transformers";
import {
    evaluateProgramIndicatorsForEvent,
    evaluateProgramIndicatorsForEvents,
} from "../utils/indicator-utils";
import {
    flattenEnrollment,
    flattenEvent,
    flattenTrackedEntity,
} from "../utils/utils";

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
    engine: ReturnType<typeof useDataEngine>;
    lastDataPull: string | undefined;
    lastDataPush: string | undefined;
    lastMetadataPull: string | undefined;
    skipLastMetadataPull: boolean;
    resources: Resource[];
    interval: number;
    enrollmentsCollection: ReturnType<typeof createEnrollmentCollection>;
    eventsCollection: ReturnType<typeof createEventCollection>;
    trackedEntitiesCollection: ReturnType<typeof createTrackedEntityCollection>;
    user: string;
    orgUnit: string;
    skipLastDataPull: boolean;
    validAttributeIds: Set<string>;
    validDataElementsByStage: Map<string, Set<string>>;
}

const syncReportToLocal = async ({
    entities,
    enrollmentsCollection,
    eventsCollection,
    trackedEntitiesCollection,
    engine,
    validAttributeIds,
    validDataElementsByStage,
}: {
    entities: Array<
        FlattenedTrackedEntity | FlattenedEnrollment | FlattenedEvent
    >;
    enrollmentsCollection: ReturnType<typeof createEnrollmentCollection>;
    eventsCollection: ReturnType<typeof createEventCollection>;
    trackedEntitiesCollection: ReturnType<typeof createTrackedEntityCollection>;
    engine: ReturnType<typeof useDataEngine>;
    validAttributeIds: Set<string>;
    validDataElementsByStage: Map<string, Set<string>>;
}) => {
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
    const response = (await engine.mutate({
        resource: "tracker",
        type: "create",
        data: payload,
        params: {
            async: false,
            importStrategy: "CREATE_AND_UPDATE",
            atomicMode: "OBJECT",
            skipPatternValidation: "true",
            skipSideEffects: "true",
        },
    })) as unknown as Dhis2Report;
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
    eventsCollection,
}: {
    deletedEvents: FlattenedEvent[];
    engine: ReturnType<typeof useDataEngine>;
    eventsCollection: ReturnType<typeof createEventCollection>;
}): Promise<{ succeeded: number; failed: number }> => {
    if (deletedEvents.length === 0) return { succeeded: 0, failed: 0 };

    const response = (await engine.mutate({
        resource: "tracker",
        type: "create",
        data: { events: deletedEvents.map((e) => ({ event: e.event })) },
        params: {
            async: false,
            importStrategy: "DELETE",
            atomicMode: "OBJECT",
        },
    })) as unknown as Dhis2Report;

    const succeededUids = new Set(
        response.bundleReport.typeReportMap.EVENT.objectReports.map(
            (r) => r.uid,
        ),
    );
    const failedUids = new Map(
        response.validationReport.errorReports.map((r) => [r.uid, r.message]),
    );

    for (const uid of succeededUids) {
        const tx = eventsCollection.delete(uid);
        await tx.isPersisted.promise;
        await db.indicatorEvaluations.where("eventId").equals(uid).delete();
    }

    return {
        succeeded: succeededUids.size,
        failed: failedUids.size,
    };
};

export type SyncEvent =
    | {
          type: "SYNC_ENTITIES";
          entities: Array<
              FlattenedTrackedEntity | FlattenedEvent | FlattenedEnrollment
          >;
      }
    | {
          type: "PUSH_DATA";
      }
    | { type: "RETRY" }
    | { type: "START_METADATA_SYNC"; user: string }
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
    | { type: "PARENT_READY" }
    | { type: "PARENT_NOT_READY" };
export const syncMachine = setup({
    types: {
        context: {} as SyncContext,
        events: {} as SyncEvent,
        input: {} as {
            engine: ReturnType<typeof useDataEngine>;
            enrollmentsCollection: ReturnType<
                typeof createEnrollmentCollection
            >;
            eventsCollection: ReturnType<typeof createEventCollection>;
            trackedEntitiesCollection: ReturnType<
                typeof createTrackedEntityCollection
            >;
            initialLastMetadataPull?: string;
            initialLastDataPull?: string;
            initialLastDataPush?: string;
            user: string;
            orgUnit: string;
        },
    },

    actions: {
        markAsSuccessful: () => {
            console.log("✅ Sync successful");
        },

        notifySuccess: ({ context }) => {},
        notifyFailure: ({ context }) => {},
        resetLastDataPull: assign({
            lastDataPull: undefined,
        }),

        resetLastMetadataPull: assign({
            lastMetadataPull: undefined,
        }),

        logDirectSync: ({ event }) => {
            assertEvent(event, "SYNC_ENTITIES");
            console.log("Attempting direct sync:", event.entities);
        },

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
        checkIndexDD: fromPromise(
            async ({ input }: { input: { user: string } }) => {
                try {
                    const queries = await Promise.all([
                        db.dataElements.count(),
                        db.trackedEntityAttributes.count(),
                        db.programRules.count(),
                        db.programRuleVariables.count(),
                        db.optionGroups.count(),
                        db.optionSets.count(),
                        db.programs.count(),
                        db.organisationUnits
                            .where({ user: input.user })
                            .count(),
                    ]);
                    const hasEmptyTables = queries.some((a) => a === 0);
                    const metadataVersion =
                        await db.metadataVersions.get("metadata-version");
                    const wasIndexedDBDeleted = !metadataVersion?.lastSync;
                    const [program] = await db.programs.toArray();
                    return {
                        needsSyncing: hasEmptyTables || wasIndexedDBDeleted,
                        metadataVersion: metadataVersion,
                        program,
                    };
                } catch (error) {
                    await db.delete();
                    await db.open();
                    return {
                        needsSyncing: true,
                        metadataVersion: undefined,
                        program: undefined,
                    };
                }
            },
        ),
        pullData: fromPromise<
            void,
            {
                program: string;
                orgUnit: string;
                lastDataPull: string | undefined;
                engine: ReturnType<typeof useDataEngine>;
                enrollmentsCollection: ReturnType<
                    typeof createEnrollmentCollection
                >;
                eventsCollection: ReturnType<typeof createEventCollection>;
                trackedEntitiesCollection: ReturnType<
                    typeof createTrackedEntityCollection
                >;
                skipLastDataPull: boolean;
            }
        >(
            async ({
                input: {
                    lastDataPull,
                    orgUnit,
                    program,
                    engine,
                    enrollmentsCollection,
                    eventsCollection,
                    trackedEntitiesCollection,
                    skipLastDataPull,
                },
            }) => {
                let currentPage = 1;
                const pageSize = 100;
                let hasMoreData = true;

                while (hasMoreData) {
                    const params: Record<string, any> = {
                        program,
                        orgUnits: orgUnit,
                        ouMode: "SELECTED",
                        fields: "*,enrollments[*,events[*]]",
                        page: currentPage,
                        pageSize: pageSize,
                    };

                    if (lastDataPull && !skipLastDataPull) {
                        params.updatedAfter = lastDataPull;
                    }

                    const response = (await engine.query({
                        trackedEntities: {
                            resource: "tracker/trackedEntities",
                            params,
                        },
                    })) as {
                        trackedEntities: { trackedEntities: TrackedEntity[] };
                    };
                    const instances = response.trackedEntities.trackedEntities;

                    const serverTrackedEntities =
                        instances.map(flattenTrackedEntity);
                    const serverEvents = instances.flatMap(({ enrollments }) =>
                        (enrollments ?? []).flatMap(({ events }) =>
                            (events ?? [])
                                .filter((event) => event.occurredAt)
                                .map(flattenEvent),
                        ),
                    );
                    const serverEnrollments = instances.flatMap(
                        ({ enrollments }) => {
                            return (enrollments ?? []).map(flattenEnrollment);
                        },
                    );

                    const teTable: Table<FlattenedTrackedEntity, string> =
                        trackedEntitiesCollection.utils.getTable();
                    const eventTable: Table<FlattenedEvent, string> =
                        eventsCollection.utils.getTable();
                    const enrollTable: Table<FlattenedEnrollment, string> =
                        enrollmentsCollection.utils.getTable();

                    const mergedTrackedEntities =
                        await mergeBulkTrackedEntities(
                            serverTrackedEntities,
                            async (id) => {
                                const result = await teTable.get(id);
                                return result;
                            },
                        );

                    const mergedEvents = await mergeBulkEvents(
                        serverEvents,
                        async (id) => {
                            const result = await eventTable.get(id);
                            return result;
                        },
                    );

                    const mergedEnrollments = await mergeBulkEnrollments(
                        serverEnrollments,
                        async (id) => {
                            const result = await enrollTable.get(id);
                            return result;
                        },
                    );
                    await enrollmentsCollection.utils.bulkInsertLocally(
                        mergedEnrollments,
                    );
                    await trackedEntitiesCollection.utils.bulkInsertLocally(
                        mergedTrackedEntities,
                    );
                    await eventsCollection.utils.bulkInsertLocally(
                        mergedEvents,
                    );

                    // Evaluate indicators for pulled events inline
                    if (mergedEvents.length > 0) {
                        const indicators = await db.programIndicators.toArray();
                        if (indicators.length > 0) {
                            const teMap = new Map(
                                mergedTrackedEntities.map((te) => [
                                    te.trackedEntity,
                                    te,
                                ]),
                            );
                            for (const event of mergedEvents) {
                                const te = teMap.get(event.trackedEntity);
                                if (te) {
                                    const results =
                                        evaluateProgramIndicatorsForEvent(
                                            event,
                                            indicators,
                                            te,
                                        );
                                    await db.indicatorEvaluations.put({
                                        id: event.event,
                                        eventId: event.event,
                                        results,
                                        updatedAt: new Date().toISOString(),
                                        version: 1,
                                    });
                                }
                            }
                        }
                    }

                    hasMoreData = instances.length === pageSize;
                    currentPage++;
                }
            },
        ),
        pullResource: fromPromise<
            { version: MetadataVersion | undefined; program: Program | undefined },
            {
                resources: Resource[];
                engine: ReturnType<typeof useDataEngine>;
                lastMetadataPull: string | undefined;
                skipLastMetadataPull: boolean;
            }
        >(async ({ input }) => {
            const {
                resources,
                engine,
                lastMetadataPull,
                skipLastMetadataPull,
            } = input;
            for (const resource of resources) {
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
                        await db.organisationUnits.bulkPut(
                            me.organisationUnits.map((ou) => ({
                                ...ou,
                                user: me.id,
                            })),
                        );
                        break;

                    case "programs":
                        const { program } = (await engine.query({
                            program: {
                                resource: "programs",
                                id: "ueBhWkWll5v",
                                params: {
                                    fields: "id,name,programSections[id,name,sortOrder,trackedEntityAttributes[id]],trackedEntityType[id,trackedEntityTypeAttributes[id]],programType,selectEnrollmentDatesInFuture,selectIncidentDatesInFuture,organisationUnits[id,name],programStages[id,repeatable,name,code,programStageDataElements[id,compulsory,renderOptionsAsRadio,dataElement[id],renderType,allowFutureDate],programStageSections[id,name,sortOrder,dataElements[id]]],programTrackedEntityAttributes[id,mandatory,searchable,renderOptionsAsRadio,renderType,sortOrder,allowFutureDate,displayInList,trackedEntityAttribute[id]]",
                                },
                            },
                        })) as { program: Program };
                        await db.programs.put(program);
                        break;

                    case "dataElements":
                        const dataElementsParams: any = {
                            fields: "id,name,code,valueType,formName,optionSetValue,optionSet[id]",
                            paging: false,
                        };
                        if (lastMetadataPull && !skipLastMetadataPull) {
                            dataElementsParams.filter = `lastUpdated:gt:${lastMetadataPull}`;
                        }
                        const { dataElements } = (await engine.query({
                            dataElements: {
                                resource: "dataElements",
                                params: dataElementsParams,
                            },
                        })) as {
                            dataElements: {
                                dataElements: DataElement[];
                            };
                        };

                        await db.dataElements.bulkPut(
                            dataElements.dataElements,
                        );
                        break;
                    case "programIndicators":
                        const programIndicatorsParams: any = {
                            fields: "id,name,filter,program,aggregationType,expression",
                            paging: false,
                        };
                        if (lastMetadataPull && !skipLastMetadataPull) {
                            programIndicatorsParams.filter = `lastUpdated:gt:${lastMetadataPull}`;
                        }
                        const { programIndicators } = (await engine.query({
                            programIndicators: {
                                resource: "programIndicators",
                                params: programIndicatorsParams,
                            },
                        })) as {
                            programIndicators: {
                                programIndicators: ProgramIndicator[];
                            };
                        };

                        await db.programIndicators.bulkPut(
                            programIndicators.programIndicators,
                        );
                        break;

                    case "attributes":
                        const attributesParams: any = {
                            fields: "id,name,code,unique,generated,pattern,confidential,valueType,optionSetValue,displayFormName,formName,optionSet[id]",
                            paging: false,
                        };
                        if (lastMetadataPull && !skipLastMetadataPull) {
                            attributesParams.filter = `lastUpdated:gt:${lastMetadataPull}`;
                        }
                        const { trackedEntityAttributes } = (await engine.query(
                            {
                                trackedEntityAttributes: {
                                    resource: "trackedEntityAttributes",
                                    params: attributesParams,
                                },
                            },
                        )) as {
                            trackedEntityAttributes: {
                                trackedEntityAttributes: TrackedEntityAttribute[];
                            };
                        };

                        await db.trackedEntityAttributes.bulkPut(
                            trackedEntityAttributes.trackedEntityAttributes,
                        );
                        break;

                    case "programRules":
                        const programRulesFilters = [
                            "program.id:eq:ueBhWkWll5v",
                        ];
                        if (lastMetadataPull && !skipLastMetadataPull) {
                            programRulesFilters.push(
                                `lastUpdated:gt:${lastMetadataPull}`,
                            );
                        }
                        const { programRules } = (await engine.query({
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

                        await db.programRules.bulkPut(
                            programRules.programRules,
                        );
                        break;

                    case "programRuleVariables":
                        const programRuleVariablesFilters = [
                            "program.id:eq:ueBhWkWll5v",
                        ];
                        if (lastMetadataPull && !skipLastMetadataPull) {
                            programRuleVariablesFilters.push(
                                `lastUpdated:gt:${lastMetadataPull}`,
                            );
                        }
                        const { programRuleVariables } = (await engine.query({
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
                        await db.programRuleVariables.bulkPut(
                            programRuleVariables.programRuleVariables,
                        );
                        break;

                    case "optionSets":
                        const optionSetsParams: any = {
                            fields: "id,options[id,name,code,sortOrder]",
                            paging: false,
                        };
                        if (lastMetadataPull && !skipLastMetadataPull) {
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
                                    }[];
                                }[];
                            };
                        };

                        const flattenedOptionSets =
                            optionSets.optionSets.flatMap((os: any) =>
                                os.options.map((o: any) => ({
                                    ...o,
                                    optionSet: os.id,
                                })),
                            );
                        await db.optionSets.bulkPut(flattenedOptionSets);
                        break;

                    case "optionGroups":
                        const optionGroupsParams: any = {
                            fields: "id,options[id,name,code,sortOrder]",
                            paging: false,
                        };
                        if (lastMetadataPull && !skipLastMetadataPull) {
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
                                    }[];
                                }>;
                            };
                        };

                        const flattenedOptionGroups =
                            optionGroups.optionGroups.flatMap((og: any) =>
                                og.options.map((o: any) => ({
                                    ...o,
                                    optionGroup: og.id,
                                })),
                            );
                        await db.optionGroups.bulkPut(flattenedOptionGroups);
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
                await db.metadataVersions.put(version);
            }

            const version = await db.metadataVersions.get("metadata-version");
            const [program] = await db.programs.toArray();
            return { version, program };
        }),
        deleteAllMetadata: fromPromise(async () => {}),
        deleteAllData: fromPromise<
            void,
            {
                enrollmentsCollection: ReturnType<
                    typeof createEnrollmentCollection
                >;
                eventsCollection: ReturnType<typeof createEventCollection>;
                trackedEntitiesCollection: ReturnType<
                    typeof createTrackedEntityCollection
                >;
            }
        >(
            async ({
                input: {
                    enrollmentsCollection,
                    eventsCollection,
                    trackedEntitiesCollection,
                },
            }) => {
                // enrollmentsCollection.utils.deleteLocally();
            },
        ),

        uploadEntities: fromPromise(
            async ({
                input,
            }: {
                input: {
                    entities: Array<
                        | FlattenedTrackedEntity
                        | FlattenedEnrollment
                        | FlattenedEvent
                    >;
                    engine: ReturnType<typeof useDataEngine>;
                    trackedEntitiesCollection: ReturnType<
                        typeof createTrackedEntityCollection
                    >;
                    enrollmentsCollection: ReturnType<
                        typeof createEnrollmentCollection
                    >;
                    eventsCollection: ReturnType<typeof createEventCollection>;
                    validAttributeIds: Set<string>;
                    validDataElementsByStage: Map<string, Set<string>>;
                };
            }) => {
                const {
                    entities,
                    engine,
                    trackedEntitiesCollection,
                    enrollmentsCollection,
                    eventsCollection,
                    validAttributeIds,
                    validDataElementsByStage,
                } = input;

                const toUpsert = entities.filter(
                    (e) =>
                        !("event" in e) ||
                        (e as FlattenedEvent).syncStatus !== "deleted",
                );
                const toDelete = entities.filter(
                    (e) =>
                        "event" in e &&
                        (e as FlattenedEvent).syncStatus === "deleted",
                ) as FlattenedEvent[];

                let result = { processed: 0, succeeded: 0, failed: 0 };

                if (toUpsert.length > 0) {
                    const upsertResult = await syncReportToLocal({
                        enrollmentsCollection,
                        eventsCollection,
                        trackedEntitiesCollection,
                        entities: toUpsert,
                        engine,
                        validAttributeIds,
                        validDataElementsByStage,
                    });
                    result = {
                        processed: result.processed + upsertResult.processed,
                        succeeded: result.succeeded + upsertResult.succeeded,
                        failed: result.failed + upsertResult.failed,
                    };
                }

                if (toDelete.length > 0) {
                    const deleteResult = await syncDeleteToLocal({
                        deletedEvents: toDelete,
                        engine,
                        eventsCollection,
                    });
                    result = {
                        processed: result.processed + toDelete.length,
                        succeeded: result.succeeded + deleteResult.succeeded,
                        failed: result.failed + deleteResult.failed,
                    };
                }

                return result;
            },
        ),
        processBatchSync: fromPromise(
            async ({
                input,
            }: {
                input: {
                    engine: ReturnType<typeof useDataEngine>;
                    trackedEntitiesCollection: ReturnType<
                        typeof createTrackedEntityCollection
                    >;
                    enrollmentsCollection: ReturnType<
                        typeof createEnrollmentCollection
                    >;
                    eventsCollection: ReturnType<typeof createEventCollection>;
                    validAttributeIds: Set<string>;
                    validDataElementsByStage: Map<string, Set<string>>;
                };
            }) => {
                const {
                    engine,
                    trackedEntitiesCollection,
                    enrollmentsCollection,
                    eventsCollection,
                    validAttributeIds,
                    validDataElementsByStage,
                } = input;

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

                return syncReportToLocal({
                    enrollmentsCollection,
                    trackedEntitiesCollection,
                    eventsCollection,
                    entities: [
                        ...pendingTEs,
                        ...pendingEnrollments,
                        ...pendingEvents,
                    ],
                    engine,
                    validAttributeIds,
                    validDataElementsByStage,
                });
            },
        ),
        evaluateAllIndicators: fromPromise<
            void,
            {
                eventsCollection: ReturnType<typeof createEventCollection>;
                trackedEntitiesCollection: ReturnType<
                    typeof createTrackedEntityCollection
                >;
            }
        >(
            async ({
                input: { eventsCollection, trackedEntitiesCollection },
            }) => {
                const indicators = await db.programIndicators.toArray();

                if (indicators.length === 0) {
                    console.log("No program indicators found");
                    return;
                }
                const eventTable: Table<FlattenedEvent, string> =
                    eventsCollection.utils.getTable();
                const events = await eventTable
                    .filter(
                        (e) =>
                            e.syncStatus === "synced" ||
                            e.syncStatus === "pending",
                    )
                    .toArray();

                if (events.length === 0) {
                    console.log("No events to evaluate");
                    return;
                }
                const trackedEntitiesMap = new Map<
                    string,
                    FlattenedTrackedEntity
                >();
                const uniqueTeIds = [
                    ...new Set(events.map((e) => e.trackedEntity)),
                ];
                const teTable = trackedEntitiesCollection.utils.getTable();

                for (const teId of uniqueTeIds) {
                    const te = await teTable.get(teId);
                    if (te) {
                        for (const event of events.filter(
                            (e) => e.trackedEntity === teId,
                        )) {
                            trackedEntitiesMap.set(event.event, te);
                        }
                    }
                }
                const results = evaluateProgramIndicatorsForEvents(
                    events,
                    indicators,
                    trackedEntitiesMap,
                );
                const evaluations = Array.from(results.entries()).map(
                    ([eventId, indicatorResults]) => ({
                        id: eventId,
                        eventId: eventId,
                        results: indicatorResults,
                        updatedAt: new Date().toISOString(),
                        version: 1,
                    }),
                );

                await db.indicatorEvaluations.bulkPut(evaluations);

                console.log(
                    `✅ Evaluated ${evaluations.length} events for program indicators`,
                );
            },
        ),
        evaluateChangedIndicators: fromPromise<
            void,
            {
                event: FlattenedEvent;
                trackedEntity: FlattenedTrackedEntity;
            }
        >(async ({ input: { event, trackedEntity } }) => {
            const indicators = await db.programIndicators.toArray();

            if (indicators.length === 0) {
                console.log("No program indicators found");
                return;
            }
            const indicatorResults = evaluateProgramIndicatorsForEvent(
                event,
                indicators,
                trackedEntity,
            );
            await db.indicatorEvaluations.put({
                id: event.event,
                eventId: event.event,
                results: indicatorResults,
                updatedAt: new Date().toISOString(),
                version: 1,
            });

            console.log(
                `✅ Evaluated event ${event.event} for ${Object.keys(indicatorResults).length} passing indicators`,
            );
        }),
    },
}).createMachine({
    id: "sync",
    type: "parallel",
    context: ({
        input: {
            engine,
            enrollmentsCollection,
            eventsCollection,
            trackedEntitiesCollection,
            initialLastMetadataPull,
            initialLastDataPull,
            initialLastDataPush,
            user,
            orgUnit,
        },
    }) => {
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
                "programIndicators",
            ],

            interval: 5000,
            enrollmentsCollection,
            eventsCollection,
            trackedEntitiesCollection,
            lastDataPull: initialLastDataPull,
            lastDataPush: initialLastDataPush,
            lastMetadataPull: initialLastMetadataPull,
            skipLastMetadataPull: true,
            user,
            orgUnit,
            skipLastDataPull: true,
            validAttributeIds: new Set<string>(),
            validDataElementsByStage: new Map<string, Set<string>>(),
        };
    },
    states: {
        metadataSync: {
            initial: "idle",
            id: "metadataSync",
            states: {
                idle: {
                    invoke: {
                        src: "checkIndexDD",
                        input: ({ context }) => ({
                            user: context.user,
                        }),
                        onDone: [
                            {
                                target: "fullRefresh",
                                guard: ({ event }) => event.output.needsSyncing,
                                actions: assign(({ event }) => ({
                                    skipLastMetadataPull: false,
                                    lastMetadataPull:
                                        event.output.metadataVersion?.lastSync,
                                    ...deriveValidIds(event.output.program),
                                })),
                            },
                            {
                                target: "waiting",
                                actions: assign(({ event }) => ({
                                    lastMetadataPull:
                                        event.output.metadataVersion?.lastSync,
                                    ...deriveValidIds(event.output.program),
                                })),
                            },
                        ],

                        onError: "failure",
                    },
                    on: {
                        START_METADATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                skipLastMetadataPull: () => true,
                            }),
                        },
                        FULL_METADATA_SYNC: {
                            target: "fullRefresh",
                            actions: assign({
                                skipLastMetadataPull: () => false,
                            }),
                        },
                    },
                },
                fullRefresh: {
                    invoke: {
                        src: "deleteAllMetadata",
                        onDone: "syncing",
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
                                skipLastMetadataPull,
                            },
                        }) => ({
                            resources,
                            engine,
                            lastMetadataPull,
                            skipLastMetadataPull,
                        }),
                        onDone: {
                            actions: assign(({ event }) => ({
                                lastMetadataPull:
                                    event.output?.version?.lastSync,
                                ...deriveValidIds(event.output?.program),
                            })),
                            target: "waiting",
                        },

                        onError: "failure",
                    },
                },
                waiting: {
                    after: {
                        60000: "syncing",
                    },
                    on: {
                        START_METADATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                skipLastMetadataPull: () => true,
                            }),
                        },

                        FULL_METADATA_SYNC: {
                            target: "fullRefresh",
                            actions: assign({
                                skipLastMetadataPull: () => true,
                            }),
                        },
                    },
                },

                failure: {},
            },
        },
        dataSync: {
            initial: "idle",
            id: "dataSync",
            states: {
                idle: {
                    on: {
                        SYNC_ENTITIES: {
                            target: "directSync",
                        },
                        PUSH_DATA: {
                            target: "batchSync",
                        },
                    },
                    after: {
                        30000: { target: "batchSync" },
                    },
                },
                directSync: {
                    entry: "logDirectSync",
                    always: [{ target: "uploadingDirect" }],
                },

                uploadingDirect: {
                    invoke: {
                        src: "uploadEntities",
                        input: ({ context, event }) => {
                            assertEvent(event, "SYNC_ENTITIES");
                            return {
                                entities: event.entities,
                                engine: context.engine,
                                trackedEntitiesCollection:
                                    context.trackedEntitiesCollection,
                                enrollmentsCollection:
                                    context.enrollmentsCollection,
                                eventsCollection: context.eventsCollection,
                                validAttributeIds: context.validAttributeIds,
                                validDataElementsByStage:
                                    context.validDataElementsByStage,
                            };
                        },
                        onDone: {
                            target: "updateLastDataPush",
                        },
                        onError: {
                            target: "idle",
                            actions: ({ event }) => {
                                console.log(
                                    "Direct sync failed, will retry in batch:",
                                    event.error,
                                );
                            },
                        },
                    },
                },

                batchSync: {
                    invoke: {
                        src: "processBatchSync",
                        input: ({ context }) => ({
                            engine: context.engine,
                            trackedEntitiesCollection:
                                context.trackedEntitiesCollection,
                            enrollmentsCollection:
                                context.enrollmentsCollection,
                            eventsCollection: context.eventsCollection,
                            validAttributeIds: context.validAttributeIds,
                            validDataElementsByStage:
                                context.validDataElementsByStage,
                        }),
                        onDone: {
                            target: "updateLastDataPush",
                        },
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
                        60000: "syncing",
                    },
                    on: {
                        START_DATA_SYNC: {
                            target: "syncing",
                        },

                        FULL_DATA_SYNC: {
                            target: "fullRefresh",
                            actions: assign({
                                lastDataPull: () => undefined,
                            }),
                        },
                    },
                },
                fullRefresh: {
                    invoke: {
                        src: "deleteAllData",
                        input: ({
                            context: {
                                enrollmentsCollection,
                                eventsCollection,
                                trackedEntitiesCollection,
                            },
                        }) => ({
                            enrollmentsCollection,
                            eventsCollection,
                            trackedEntitiesCollection,
                        }),
                        onDone: {
                            actions: assign({ skipLastDataPull: false }),
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
                                enrollmentsCollection,
                                eventsCollection,
                                trackedEntitiesCollection,
                                orgUnit,
                                skipLastDataPull,
                            },
                        }) => ({
                            engine,
                            lastDataPull,
                            enrollmentsCollection,
                            eventsCollection,
                            orgUnit,
                            program: "ueBhWkWll5v",
                            trackedEntitiesCollection,
                            skipLastDataPull,
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
                            skipLastDataPull: true,
                        }),
                        "persistSyncState",
                    ],
                    always: "waiting",
                },

                waiting: {
                    after: {
                        60000: "syncing",
                    },
                    on: {
                        START_DATA_SYNC: {
                            target: "syncing",
                        },
                        FULL_DATA_SYNC: {
                            target: "fullRefresh",
                            actions: assign({
                                lastDataPull: () => undefined,
                            }),
                        },
                    },
                },
                failure: {},
            },
        },
        indicatorEvaluation: {
            initial: "idle",
            id: "indicatorEvaluation",
            states: {
                idle: {
                    on: {
                        EVALUATE_INDICATORS: "evaluating",
                        FULL_INDICATOR_SYNC: "fullEvaluation",
                    },
                },
                evaluating: {
                    invoke: {
                        src: "evaluateChangedIndicators",
                        input: ({ event }) => {
                            assertEvent(event, "EVALUATE_INDICATORS");
                            return {
                                event: event.event,
                                trackedEntity: event.trackedEntity,
                            };
                        },
                        onDone: "idle",
                        onError: "failure",
                    },
                },
                fullEvaluation: {
                    invoke: {
                        src: "evaluateAllIndicators",
                        input: ({
                            context: {
                                eventsCollection,
                                trackedEntitiesCollection,
                            },
                        }) => ({
                            eventsCollection,
                            trackedEntitiesCollection,
                        }),
                        onDone: "idle",
                        onError: "failure",
                    },
                },
                failure: {
                    on: {
                        EVALUATE_INDICATORS: "evaluating",
                        FULL_INDICATOR_SYNC: "fullEvaluation",
                    },
                },
            },
        },
    },
});

export const SyncContext = createActorContext(syncMachine);
