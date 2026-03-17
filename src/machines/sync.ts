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
import { db, MetadataVersion } from "../db";
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
import {
    evaluateProgramIndicatorsForEvent,
    evaluateProgramIndicatorsForEvents,
} from "../utils/indicator-utils";
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
    error: Error | null;
    engine: ReturnType<typeof useDataEngine>;
    lastDataPull: string | undefined;
    lastMetadataPull: string | undefined;
    skipLastMetadataPull: boolean;
    resources: Resource[];
    interval: number;
    enrollmentsCollection: ReturnType<typeof createEnrollmentCollection>;
    eventsCollection: ReturnType<typeof createEventCollection>;
    trackedEntitiesCollection: ReturnType<typeof createTrackedEntityCollection>;
    user: string;
    orgUnit: string;
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
                    return {
                        needsSyncing: hasEmptyTables || wasIndexedDBDeleted,
                        metadataVersion: metadataVersion,
                    };
                } catch (error) {
                    await db.delete();
                    await db.open();
                    return {
                        needsSyncing: true,
                        metadataVersion: undefined,
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
            MetadataVersion | undefined,
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
            }

            const version = await db.metadataVersions.get("metadata-version");
            return version;
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

                const pendingEvents = (
                    await eventTable.where({ syncStatus: "pending" }).toArray()
                ).filter((event) => event.occurredAt);

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
                // 1. Get all program indicators from db
                const indicators = await db.programIndicators.toArray();

                if (indicators.length === 0) {
                    console.log("No program indicators found");
                    return;
                }

                // 2. Get all synced/pending events
                const eventTable = eventsCollection.utils.getTable();
                const events = await eventTable
                    .where("syncStatus")
                    .anyOf(["synced", "pending"])
                    .toArray();

                if (events.length === 0) {
                    console.log("No events to evaluate");
                    return;
                }

                // 3. Build tracked entities map
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

                // 4. Evaluate indicators
                const results = evaluateProgramIndicatorsForEvents(
                    events,
                    indicators,
                    trackedEntitiesMap,
                );

                // 5. Store results in database
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
            // 1. Get all program indicators
            const indicators = await db.programIndicators.toArray();

            if (indicators.length === 0) {
                console.log("No program indicators found");
                return;
            }

            // 2. Evaluate indicators for this single event
            const indicatorResults = evaluateProgramIndicatorsForEvent(
                event,
                indicators,
                trackedEntity,
            );

            // 3. Store result using event ID as primary key
            await db.indicatorEvaluations.put({
                id: event.event, // Event ID as primary key (ensures uniqueness)
                eventId: event.event, // Same value for querying
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
            lastMetadataPull: initialLastMetadataPull,
            skipLastMetadataPull: true,
            user,
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
                                })),
                            },
                            {
                                target: "waiting",
                                actions: assign(({ event }) => ({
                                    lastMetadataPull:
                                        event.output.metadataVersion?.lastSync,
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
                                lastMetadataPull: event.output?.lastSync,
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
                        },
                        onError: {
                            target: "idle",
                            actions: ({ event }) => {
                                console.error("Batch sync error:", event.error);
                            },
                        },
                    },
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
                                lastDataPull,
                                enrollmentsCollection,
                                eventsCollection,
                                trackedEntitiesCollection,
                                orgUnit,
                            },
                        }) => ({
                            engine,
                            lastDataPull,
                            enrollmentsCollection,
                            eventsCollection,
                            orgUnit,
                            program: "ueBhWkWll5v",
                            trackedEntitiesCollection,
                        }),

                        onDone: {
                            target: "updateLastDataPull",
                        },

                        onError: "failure",
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
