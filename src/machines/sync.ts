import { assertEvent, assign, fromPromise, setup } from "xstate";
import {
    DataElement,
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
import { db } from "../db";
import {
    transformEnrollment,
    transformEvent,
    transformTrackedEntity,
} from "../db/transformers";
import {
    flattenEnrollment,
    flattenEvent,
    flattenTrackedEntity,
} from "../utils/utils";
import {
    createEnrollmentCollection,
    createEventCollection,
    createTrackedEntityCollection,
} from "../collections";
import {
    mergeBulkEvents,
    mergeBulkTrackedEntities,
    mergeBulkEnrollments,
} from "../db/merge-utils";
import { Table } from "dexie";

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
    retryCount: number;
    maxRetries: number;
    baseDelay: number;
    error: Error | null;
    engine: ReturnType<typeof useDataEngine>;
    currentIndex: number;
    lastDataPull: string | undefined;
    lastMetadataPull: string | undefined;
    resources: Resource[];
    interval: number;
    syncType: "incremental" | "full";

    enrollmentsCollection: ReturnType<typeof createEnrollmentCollection>;
    eventsCollection: ReturnType<typeof createEventCollection>;
    trackedEntitiesCollection: ReturnType<typeof createTrackedEntityCollection>;

    orgUnit: string;

    lastBatchSync: string | undefined;
}

export type SyncEvent =
    | {
          type: "QUEUE";
          entity: FlattenedTrackedEntity | FlattenedEvent | FlattenedEnrollment;
      }
    | {
          type: "SYNC_ENTITIES";
          entities: Array<
              FlattenedTrackedEntity | FlattenedEvent | FlattenedEnrollment
          >;
      }
    | { type: "RETRY" }
    | { type: "START_METADATA_SYNC" }
    | { type: "START_DATA_SYNC" }
    | { type: "FULL_METADATA_SYNC" }
    | { type: "FULL_DATA_SYNC" }
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
            orgUnit: string;
            initialLastMetadataPull?: string;
            initialLastDataPull?: string;
        },
    },

    actions: {
        incrementRetry: assign({
            retryCount: ({ context }) => context.retryCount + 1,
        }),
        resetRetry: assign({
            retryCount: 0,
            error: null,
        }),
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
    },
    actors: {
        checkIndexDD: fromPromise(
            async ({ input }: { input: { lastMetadataPull?: string } }) => {
                const queries = await Promise.all([
                    db.dataElements.count(),
                    db.trackedEntityAttributes.count(),
                    db.programRules.count(),
                    db.programRuleVariables.count(),
                    db.optionGroups.count(),
                    db.optionSets.count(),
                    db.programs.count(),
                    db.organisationUnits.count(),
                ]);
                // Check if any essential metadata tables are empty
                const hasEmptyTables = queries.some((a) => a === 0);

                // Check if metadataVersion exists in IndexedDB
                const metadataVersion =
                    await db.metadataVersions.get("metadata-version");

                // If context has lastMetadataPull but DB doesn't, it means IndexedDB was deleted
                const wasIndexedDBDeleted =
                    input.lastMetadataPull !== undefined &&
                    !metadataVersion?.lastSync;

                // Need to sync if: tables are empty OR IndexedDB was manually deleted
                return hasEmptyTables || wasIndexedDBDeleted;
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

                    if (lastDataPull) {
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
                            (events ?? []).map(flattenEvent),
                        ),
                    );
                    const serverEnrollments = instances.flatMap(
                        ({ enrollments }) => {
                            return (enrollments ?? []).map(flattenEnrollment);
                        },
                    );

                    const teTable = trackedEntitiesCollection.utils.getTable();
                    const eventTable = eventsCollection.utils.getTable();
                    const enrollTable = enrollmentsCollection.utils.getTable();

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
                    hasMoreData = instances.length === pageSize;
                    currentPage++;
                }
            },
        ),
        pullResource: fromPromise<
            void,
            {
                resource: Resource;
                engine: ReturnType<typeof useDataEngine>;
                lastMetadataPull: string | undefined;
            }
        >(async ({ input }) => {
            const { resource, engine, lastMetadataPull } = input;
            switch (resource) {
                case "me":
                    const { me } = (await engine.query({
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
                    if (lastMetadataPull) {
                        dataElementsParams.filter = `lastUpdated:gt:${lastMetadataPull}`;
                    }
                    const { dataElements } = (await engine.query({
                        dataElements: {
                            resource: "dataElements",
                            params: dataElementsParams,
                        },
                    })) as {
                        dataElements: { dataElements: DataElement[] };
                    };

                    await db.dataElements.bulkPut(dataElements.dataElements);
                    break;
                case "programIndicators":
                    const programIndicatorsParams: any = {
                        fields: "id,name,filter,program,aggregationType,expression",
                        paging: false,
                    };
                    if (lastMetadataPull) {
                        programIndicatorsParams.filter = `lastUpdated:gt:${lastMetadataPull}`;
                    }
                    const { programIndicators } = (await engine.query({
                        dataElements: {
                            resource: "dataElements",
                            params: programIndicatorsParams,
                        },
                    })) as {
                        programIndicators: { programIndicators: ProgramIndicator[] };
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
                    if (lastMetadataPull) {
                        attributesParams.filter = `lastUpdated:gt:${lastMetadataPull}`;
                    }
                    const { trackedEntityAttributes } = (await engine.query({
                        trackedEntityAttributes: {
                            resource: "trackedEntityAttributes",
                            params: attributesParams,
                        },
                    })) as {
                        trackedEntityAttributes: {
                            trackedEntityAttributes: TrackedEntityAttribute[];
                        };
                    };

                    await db.trackedEntityAttributes.bulkPut(
                        trackedEntityAttributes.trackedEntityAttributes,
                    );
                    break;

                case "programRules":
                    const programRulesFilters = ["program.id:eq:ueBhWkWll5v"];
                    if (lastMetadataPull) {
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
                        programRules: { programRules: ProgramRule[] };
                    };

                    await db.programRules.bulkPut(programRules.programRules);
                    break;

                case "programRuleVariables":
                    const programRuleVariablesFilters = [
                        "program.id:eq:ueBhWkWll5v",
                    ];
                    if (lastMetadataPull) {
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
                    if (lastMetadataPull) {
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

                    const flattenedOptionSets = optionSets.optionSets.flatMap(
                        (os: any) =>
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
                    if (lastMetadataPull) {
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
            const version = (await db.metadataVersions.get(
                "metadata-version",
            )) || {
                id: "metadata-version",
                lastSync: currentTimestamp,
                versions: {},
            };
            version.versions[resource] = currentTimestamp;
            version.lastSync = currentTimestamp;
            await db.metadataVersions.put(version);
        }),
        deleteAllMetadata: fromPromise(async () => {
            await db.programs.clear();
            await db.dataElements.clear();
            await db.optionSets.clear();
        }),
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
                };
            }) => {
                const {
                    entities,
                    engine,
                    trackedEntitiesCollection,
                    enrollmentsCollection,
                    eventsCollection,
                } = input;
                const payload = entities.reduce(
                    (acc, entity) => {
                        if ("trackedEntityType" in entity) {
                            acc.trackedEntities.push(
                                transformTrackedEntity(entity),
                            );
                        } else if ("enrolledAt" in entity) {
                            acc.enrollments.push(transformEnrollment(entity));
                        } else if ("event" in entity) {
                            acc.events.push(transformEvent(entity));
                        }

                        return acc;
                    },
                    {
                        trackedEntities: [] as TrackedEntity[],
                        enrollments: [] as Enrollment[],
                        events: [] as Event[],
                    },
                );

                await engine.mutate({
                    resource: "tracker",
                    type: "create",
                    data: payload,
                    params: {
                        async: false,
                        importStrategy: "CREATE_AND_UPDATE",
                    },
                });

                // Update entity status after successful upload
                await Promise.all(
                    entities.flatMap((entity) => {
                        if ("trackedEntityType" in entity) {
                            return trackedEntitiesCollection.utils.updateLocally(
                                entity.trackedEntity,
                                {
                                    syncStatus: "synced",
                                    lastSynced: new Date().toISOString(),
                                    syncError: "",
                                },
                            );
                        }
                        if ("enrolledAt" in entity) {
                            return enrollmentsCollection.utils.updateLocally(
                                entity.enrollment,
                                {
                                    syncStatus: "synced",
                                    lastSynced: new Date().toISOString(),
                                    syncError: "",
                                },
                            );
                        }
                        if ("event" in entity) {
                            return eventsCollection.utils.updateLocally(
                                entity.event,
                                {
                                    syncStatus: "synced",
                                    lastSynced: new Date().toISOString(),
                                    syncError: "",
                                },
                            );
                        }
                        return [];
                    }),
                );

                return { success: true };
            },
        ),
        updateEntityToSynced: fromPromise(
            async ({
                input,
            }: {
                input: {
                    entities: Array<
                        | FlattenedTrackedEntity
                        | FlattenedEnrollment
                        | FlattenedEvent
                    >;
                    trackedEntitiesCollection: ReturnType<
                        typeof createTrackedEntityCollection
                    >;
                    enrollmentsCollection: ReturnType<
                        typeof createEnrollmentCollection
                    >;
                    eventsCollection: ReturnType<typeof createEventCollection>;
                };
            }) => {
                const {
                    entities,
                    trackedEntitiesCollection,
                    enrollmentsCollection,
                    eventsCollection,
                } = input;

                await Promise.all(
                    entities.flatMap((entity) => {
                        if ("trackedEntityType" in entity) {
                            return trackedEntitiesCollection.utils.updateLocally(
                                entity.trackedEntity,
                                {
                                    syncStatus: "synced",
                                    lastSynced: new Date().toISOString(),
                                    syncError: "",
                                },
                            );
                        }
                        if ("enrolledAt" in entity) {
                            return enrollmentsCollection.utils.updateLocally(
                                entity.enrollment,
                                {
                                    syncStatus: "synced",
                                    lastSynced: new Date().toISOString(),
                                    syncError: "",
                                },
                            );
                        }
                        if ("event" in entity) {
                            return eventsCollection.utils.updateLocally(
                                entity.event,
                                {
                                    syncStatus: "synced",
                                    lastSynced: new Date().toISOString(),
                                    syncError: "",
                                },
                            );
                        }
                        return [];
                    }),
                );

                return { success: true };
            },
        ),
        processBatchSync: fromPromise(
            async ({
                input,
            }: {
                input: {
                    engine: any;
                    trackedEntitiesCollection: ReturnType<
                        typeof createTrackedEntityCollection
                    >;
                    enrollmentsCollection: ReturnType<
                        typeof createEnrollmentCollection
                    >;
                    eventsCollection: ReturnType<typeof createEventCollection>;
                };
            }) => {
                const {
                    engine,
                    trackedEntitiesCollection,
                    enrollmentsCollection,
                    eventsCollection,
                } = input;

                const teTable: Table<FlattenedTrackedEntity, string> =
                    trackedEntitiesCollection.utils.getTable();
                const eventTable: Table<FlattenedEvent, string> =
                    eventsCollection.utils.getTable();
                const enrollTable: Table<FlattenedEnrollment, string> =
                    enrollmentsCollection.utils.getTable();

                // 1. Query collections for pending entities
                const pendingTEs = await teTable
                    .where({ syncStatus: "pending" })
                    .toArray();

                const pendingEnrollments = await enrollTable
                    .where({ syncStatus: "pending" })
                    .toArray();

                const pendingEvents = await eventTable
                    .where({ syncStatus: "pending" })
                    .toArray();

                if (
                    pendingTEs.length === 0 &&
                    pendingEnrollments.length === 0 &&
                    pendingEvents.length === 0
                ) {
                    console.log("No pending entities to sync");
                    return { processed: 0, succeeded: 0, failed: 0 };
                }

                console.log(
                    `Batch syncing: ${pendingTEs.length} TEs, ${pendingEnrollments.length} enrollments, ${pendingEvents.length} events`,
                );

                // 2. Filter by dependencies
                const teIds = new Set(pendingTEs.map((te) => te.trackedEntity));

                // Enrollments: only if parent TE is synced OR in this batch
                const validEnrollments: FlattenedEnrollment[] = [];
                for (const enr of pendingEnrollments) {
                    if (teIds.has(enr.trackedEntity)) {
                        validEnrollments.push(enr);
                    } else {
                        const te = trackedEntitiesCollection.get(
                            enr.trackedEntity,
                        );
                        if (te?.syncStatus === "synced") {
                            validEnrollments.push(enr);
                        }
                    }
                }

                const enrollIds = new Set(
                    validEnrollments.map((e) => e.enrollment),
                );
                const validEvents: FlattenedEvent[] = [];
                for (const evt of pendingEvents) {
                    if (enrollIds.has(evt.enrollment)) {
                        validEvents.push(evt);
                    } else {
                        const enr = enrollmentsCollection.get(evt.enrollment);
                        if (enr?.syncStatus === "synced") {
                            validEvents.push(evt);
                        }
                    }
                }

                if (
                    pendingTEs.length === 0 &&
                    validEnrollments.length === 0 &&
                    validEvents.length === 0
                ) {
                    console.log(
                        "No entities ready to sync (dependencies not met)",
                    );
                    return { processed: 0, succeeded: 0, failed: 0 };
                }

                // 3. Build flat batch payload
                const payload = {
                    trackedEntities: pendingTEs.map(transformTrackedEntity),
                    enrollments: validEnrollments.map(transformEnrollment),
                    events: validEvents.map(transformEvent),
                };

                // 4. Send to DHIS2
                await engine.mutate({
                    resource: "tracker",
                    type: "create",
                    data: payload,
                    params: {
                        async: false,
                        importStrategy: "CREATE_AND_UPDATE",
                    },
                });
                let succeeded = 0;
                let failed = 0;

                await trackedEntitiesCollection.utils.bulkUpdateLocally(
                    pendingTEs.map((a) => ({
                        ...a,
                        syncStatus: "synced",
                        lastSynced: new Date().toISOString(),
                        syncError: "",
                    })),
                );
                await enrollmentsCollection.utils.bulkUpdateLocally(
                    validEnrollments.map((a) => ({
                        ...a,
                        syncStatus: "synced",
                        lastSynced: new Date().toISOString(),
                        syncError: "",
                    })),
                );
                await eventsCollection.utils.bulkUpdateLocally(
                    validEvents.map((a) => ({
                        ...a,
                        syncStatus: "synced",
                        lastSynced: new Date().toISOString(),
                        syncError: "",
                    })),
                );

                return {
                    processed:
                        pendingTEs.length +
                        validEnrollments.length +
                        validEvents.length,
                    succeeded,
                    failed,
                };
            },
        ),
    },
    delays: {
        RETRY_DELAY: ({ context }) => {
            return Math.min(
                context.baseDelay * Math.pow(2, context.retryCount - 1),
                10000,
            );
        },
    },
}).createMachine({
    /** @xstate-layout N4IgpgJg5mDOIC5SwJ4DsDGA6AtmALgIYSFEDK62AlhADZgDEEA9mmFlWgG7MDW7qTLgLFShCkJr0EnHhlJVWAbQAMAXVVrEoAA7NYVfIrTaQAD0QAWAMwqsATnsAmAIz3rTgKzX7nvwBoQFEQXF08XLBUADk9nTxtLewB2FycAXzTAwWw8IhJySg46RhY2Dm4+AULc0QLJYpkK+SNldSUXLSQQPQMWky6LBBs7R1d3Lx8-T0DghBdrWywF+xVPJ0sVADZNpy2MrOqRfPFCqUYwACcL5gusHVpSADMbnCxs4TyxCWoG2WZm4yaTSmHqGYymQbDBzONweby+AJBRC7dZYcKeTYuJLhGLRdKZEDvGrHb5FegMMgAFQAggAlSkAfQAsgBRGkAEWpNIZZAAmgA5ADCwK6oL6EKsi1GsImCOmSIQviiWCx9k2KRUapUSR8+0Jh0+dR+5IAYgBVAAyFuZbOpnO5fKFIt0+jBrAlQylMPG8KmMxCq0sWE2HiS9iiTk2ficXj1RKOX0KjwArrRaLSwI8LnAABZMVjsP78N4G2onIQptMZrO5xpyBStDTqEGu8UDEJrf0IJw+eyRHwuTHWHYYmxx0skpOp9OZ7OwPOXa63e5PF4loTExMV6fVuc5uv-BtoIHN0Wt8Htz0jb1wyaI2a7JJOSJhTFRYY2NXjjcJo3rjCcFAWBsGY+AZrAzDJhcGCMM63Tnu6l7zM4kRJFE8wRpGTgrPKD6RkkaJhE+lghpG2qeN+OS-uW2DZIBwFgKB4GQdBsEdC2vQXqAgwhnY1g2NizirLsuHInCWBJFGT7WBG4bhJslEfGWpJ0WgQE6DucAsTB+ZlEWVQ-oaNH-vRGlVlpUEwQeAKNnBYpceYAYqNYWARuhliRjY1iSZYXY9j4WCRp4xFYtsY4EvGRkqZQpmaRBlnnFcNx3A8+DPBcryRcphSqepcXaWA1lHienQupxiHcSEMkEdq6EyTGOw4X5MZ2CoRE9k+WySVEimbn+uVvPgNxgMxCUMHZCH9JVczRHY77ecFlguJYOpJL5CrrJYQZofYg4uOhMTYRREUTlu2DJjo+RgBahCwPgAAK07jaeZVulNjlzOGc1OHVWr7e41hdliKita+g6bFswVrb11GkgA7oQYJqRSNL0jaHJctSPICsKL3weV72DGETh+VtmxogOOxOGtiQkTDUWFAjSNQAw5pWujdqY9jTp4-ZFUfWEUR9tYsQyW1URhikSRA9hLnWKklhREL6GDvL9PZUITNGMjZh3aQ7CEI8+CXAAFBDIMqAAlAwWWTpriPa1AE0Ex6YT2EGIvuFE4uS1iQOeN7ElRpimKeFsqSKXbxqMI6goMiy-KUgAksnLJkM7b0ekkOqBSGHmODYwWOF28syRJ2KST97hoeFBxCFHZKMLrRDG1ghvGxcJu2Bb1vvA3ZwZ2203Zy5kb8dh7si2G9gl5qETU8FmLhvt3jHXX2ANxAVDZhg+DfM9pX45nl4rM+P2bEr2GbIku0l-9gUVyGl-Z+GkdnVgF20MwxCAey29gLvXShYKjFj7u-T+38t5qT-jvfARU+glQ4sfaaS1nxJBUK4DEYYSILBcLPAOwYsRrAwdidY6w35-ggT-aB-9AGLmSiuNKa4wGUPuJA3+tC4F-BsseNovNJoeg8gRRI8tiLDjDI+PyKwPabHdgiFYgYKHGQAEakAwDmfepRgE8FAYUBuqj8DqO+PAwEfDD580JogdUcsL5RG8lGd8HVZ4g1cg1fiSt3ayIUideu78DFGMoAwehy5UrpUynovxaiNGUBMbZfhLtLwjwcKXcMGodRKz8lEC+kQlptQcZiRWSjHppkbijOkjJ7RY1joPBygxF4OEsN4BY4ivBRi7AAWnBq5fOqQti9h+tYIp05Sls2tJU7muNzECMvPU92TSFjqlaaJBAnTBxLB6S4bUN8nzePXlgY4xTaClObvrNuRtTbmxBr3CJRBDmNxqfzOpkkGnzJaRiZZnS+weLQj4VY8QJYuCGSUysM4azziAeUHRBkN5iDuSC3ctZuHFTMUgoeAsQYEWDj9VYK93B4IVOEQK3gybe32tqEMQKjnwtnLmIJSUQmrgyv+fZsLhnUrBfuJFCCUVngSdNTZ2pgwYmxTiUW+LZguWxPxRpHiJbbEHJSkyyMtGQsqMyg5wzcqxN4U2KZfKBZLQiGHH5cRdpRhJhtHsrlxHuXkpifaircp0qXClRl4TfG3M1TFNS2rEG8uQQa0IaJao+C8GazsCpQpLBtasHwOo2pJEVRdK6N07rslZWmA+qLakhBWuTJaGwVjOGvjPBUw47Bh2lULNCl9LCKq1oBMpaNxnVPiQGp55M5nNLeW0jaZcJhbXfDKtYgyfEws9SUhtyNRkMhbTjB5liECzMad2xZ7y-KYs2a4dBfSIyjr2RqydDtG0nNbu3C5FsrY2xuYQO5U6nZtrRR2l5q6nzrsjSsCSxKVpNJhKOgkaBmAQDgKYbI2bHmIHacOPsIYA4hijO4KGHT+IREcThFIsQslhHVlHcDi6oOuGDCLLJw5RZIYVBLOwr5-IBywmhHD78zh4Y9O06mLlYMkYQ1PaWCpfCYuFQsWjOx6NjqUg3dle5mNIQjARZafT3k+Bkss0IiQ0Q7EVjWiekYGP9W9VAKTKDUjQjGLeOUzV5gvgxHY4KawVM6eMgNECYELKsQMx9Ei14TOyj9BtGVSwVjESpskNe+pDIa1onpu4+UEpucGGGFyqod3rFiJiHjD5u6EWCj2Qcdjva7NC1RBmQgBp3WGqNVz-qn0hDcM+La3gYzIQWoDXzBCL49l2t5ESPVRN9WMsm-WqaHrTlix2d2SxRakolskP2lq-DBj3btEGMl8u23fvekbcwtpBlSPtb2S3ZpRCBh4YWvyR0X2iDEezpJHiI1oFBMAG23Yewmz7abaXkTagiG1DE+0BwBaUd8Db-EsCJGco19CmoA4buziDpaMlkiKwLgD04xQNs7DsF4KYK1s4xnlpk6+DSMII6Fu7ZH9dOGA8qzmmay1AqeJiCI5yCw75eBVFkzyOPY0rZvaSKhUCoAwIAfgDbEYQcrBSTJTZSpZ5hAklkjBK6Aa+DJ9gfx0TMAbccARTrEPVh2I2O97sjhlTTzcDqbyiRAWicPbQDbGxyYpDlez4OCyOleA9vnVYGHwyYnxAejNRymNU4g0MNCsOmlYnLX4XwHSUJZLzmGd82daqKok7mDb8WJJqgUd4LJvgLWzCM5Wur8X4jm0TdbgPSr9PB8XakbCIP5rBeSORZrheYiRCyWhFQW1lhzKTZdAbt18Dponbb2vrtgpGotmStwdjkgl12J39UdVnK+DrZXsfWB1sT8vI07a+1uo7Bd8OPy3kHDOUHfxWRaxuv+63zdqgd3syPan8GkGs-wxxqBtk6IK+mfwZrD4gZBAA */
    id: "sync",
    type: "parallel",
    context: ({
        input: {
            engine,
            enrollmentsCollection,
            eventsCollection,
            trackedEntitiesCollection,
            orgUnit,
            initialLastMetadataPull,
            initialLastDataPull,
        },
    }) => {
        return {
            engine,
            entity: null,
            entityType: undefined,
            error: null,
            retryCount: 0,
            maxRetries: 6,
            parentId: null,
            baseDelay: 0,
            entities: [],
            resources: [
                "programs",
                "programStages",
                "dataElements",
                "trackedEntityTypes",
                "optionSets",
                "programIndicators",
                "me",
                "optionGroups",
                "attributes",
                "programRuleVariables",
                "programRules",
            ],

            currentIndex: 0,
            interval: 5000,
            syncType: "incremental",
            enrollmentsCollection,
            eventsCollection,
            trackedEntitiesCollection,
            lastDataPull: initialLastDataPull,
            lastMetadataPull: initialLastMetadataPull,
            lastBatchSync: undefined,
            orgUnit,
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
                            lastMetadataPull: context.lastMetadataPull,
                        }),
                        onDone: [
                            {
                                target: "fullRefresh",
                                guard: ({ event }) => event.output,
                                actions: assign({
                                    lastMetadataPull: undefined,
                                }),
                            },
                            {
                                target: "waiting",
                            },
                        ],

                        onError: "failure",
                    },
                    on: {
                        START_METADATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                currentIndex: () => 0,
                            }),
                        },
                        FULL_METADATA_SYNC: {
                            target: "fullRefresh",
                            actions: assign({
                                currentIndex: () => 0,
                                lastMetadataPull: () => undefined,
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
                    initial: "nextResource",
                    states: {
                        nextResource: {
                            always: [
                                {
                                    guard: ({ context }) =>
                                        context.currentIndex >=
                                        context.resources.length,
                                    target: "#metadataSync.updateLastPull",
                                },
                                { target: "pullResource" },
                            ],
                        },

                        pullResource: {
                            invoke: {
                                src: "pullResource",
                                input: ({
                                    context: {
                                        engine,
                                        resources,
                                        currentIndex,
                                        lastMetadataPull,
                                    },
                                }) => ({
                                    resource: resources[currentIndex],
                                    engine,
                                    lastMetadataPull,
                                }),

                                onDone: {
                                    target: "storeResource",
                                },

                                onError: "#metadataSync.failure",
                            },
                        },

                        storeResource: {
                            always: {
                                target: "nextResource",
                                actions: assign({
                                    currentIndex: ({ context }) =>
                                        context.currentIndex + 1,
                                }),
                            },
                        },
                    },
                },

                updateLastPull: {
                    entry: assign({
                        lastMetadataPull: () => new Date().toISOString(),
                        currentIndex: () => 0,
                    }),
                    always: "waiting",
                },

                waiting: {
                    after: {
                        60000: "syncing",
                    },
                    on: {
                        START_METADATA_SYNC: {
                            target: "syncing",
                            actions: assign({
                                syncType: () => "incremental",
                                currentIndex: () => 0,
                            }),
                        },

                        FULL_METADATA_SYNC: {
                            target: "fullRefresh",
                            actions: assign({
                                syncType: () => "full",
                                currentIndex: () => 0,
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
                            };
                        },
                        onDone: {
                            target: "idle",
                            actions: () => {
                                console.log("✅ Direct sync successful");
                            },
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
                        }),
                        onDone: {
                            target: "idle",
                            actions: assign({
                                lastBatchSync: () => new Date().toISOString(),
                            }),
                        },
                        onError: {
                            target: "idle",
                            actions: ({ event }) => {
                                console.error("Batch sync error:", event.error);
                            },
                        },
                    },
                }
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
                        onDone: "syncing",
                        onError: "failure",
                    },
                },

                syncing: {
                    invoke: {
                        src: "pullData",
                        input: ({
                            context: {
                                engine,
                                resources,
                                currentIndex,
                                lastDataPull,
                                enrollmentsCollection,
                                eventsCollection,
                                trackedEntitiesCollection,
                                orgUnit,
                            },
                        }) => ({
                            resource: resources[currentIndex],
                            engine,
                            lastDataPull,
                            enrollmentsCollection,
                            eventsCollection,
                            orgUnit,
                            program: "ueBhWkWll5v",
                            trackedEntitiesCollection,
                            updatedAfter: undefined,
                        }),

                        onDone: {
                            target: "updateLastDataPull",
                        },

                        onError: "#dataPull.failure",
                    },
                },
                updateLastDataPull: {
                    entry: assign({
                        lastDataPull: () => new Date().toISOString(),
                    }),
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
    },
});

export const SyncContext = createActorContext(syncMachine);
