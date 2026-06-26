import type { useDataEngine } from "@dhis2/app-runtime";
import { Table } from "dexie";
import {
    enrollmentsCollection,
    eventsCollection,
    trackedEntitiesCollection,
} from "../collections";
import {
    mergeBulkEnrollments,
    mergeBulkEvents,
    mergeBulkTrackedEntities,
} from "../db/merge-utils";
import {
    Event,
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
    TrackedEntity,
} from "../schemas";
import {
    flattenEnrollment,
    flattenEvent,
    flattenTrackedEntity,
} from "../utils/utils";
import {
    DEFAULT_EVENT_PULL_PAGE_SIZE,
    DEFAULT_TRACKER_PULL_PAGE_SIZE,
    EVENT_SYNC_FIELDS,
    MAX_EVENT_PULL_PAGE_SIZE,
    MAX_TRACKER_PULL_PAGE_SIZE,
    SyncMode,
    TRACKED_ENTITY_SYNC_FIELDS,
    resolveUpdatedAfter,
} from "./config";
import { shouldContinueDataPull } from "../machines/sync-metadata-mode";

type Engine = ReturnType<typeof useDataEngine>;

export interface PullResult {
    pages: number;
    trackedEntitiesPulled: number;
    eventsPulled: number;
    enrollmentsPulled: number;
}

/**
 * Pull tracked entities + shallow enrollments incrementally.
 *
 * Why: production showed `fields=*,enrollments[*,events[*]]` and
 * `pageSize=100`. We now use a minimal field set, a smaller page size,
 * and never include nested events.
 *
 * Events are pulled separately via `pullEventsIncremental`.
 */
export async function pullTrackedEntitiesIncremental({
    engine,
    program,
    orgUnit,
    lastDataPull,
    mode = "incremental",
    pageSize = DEFAULT_TRACKER_PULL_PAGE_SIZE,
}: {
    engine: Engine;
    program: string;
    orgUnit: string;
    lastDataPull: string | undefined;
    mode?: SyncMode;
    pageSize?: number;
}): Promise<PullResult> {
    const safePageSize = Math.min(
        Math.max(1, pageSize),
        MAX_TRACKER_PULL_PAGE_SIZE,
    );

    const updatedAfter = resolveUpdatedAfter(lastDataPull, mode);

    let currentPage = 1;
    let hasMore = true;
    const result: PullResult = {
        pages: 0,
        trackedEntitiesPulled: 0,
        eventsPulled: 0,
        enrollmentsPulled: 0,
    };

    while (hasMore) {
        const params: Record<string, any> = {
            program,
            orgUnits: orgUnit,
            ouMode: "SELECTED",
            fields: TRACKED_ENTITY_SYNC_FIELDS,
            page: currentPage,
            pageSize: safePageSize,
        };
        if (updatedAfter) {
            params.updatedAfter = updatedAfter;
        }

        const response = (await engine.query({
            trackedEntities: {
                resource: "tracker/trackedEntities",
                params,
            },
        })) as {
            trackedEntities: {
                pager?: {
                    page?: number;
                    pageSize?: number;
                    pageCount?: number;
                    nextPage?: string;
                    total?: number;
                };
                trackedEntities: TrackedEntity[];
            };
        };

        const { trackedEntities: instances } = response.trackedEntities;
        const pager = response.trackedEntities.pager;

        const serverTrackedEntities = instances.map(flattenTrackedEntity);
        const serverEnrollments = instances.flatMap(({ enrollments }) =>
            (enrollments ?? []).map(flattenEnrollment),
        );

        const teTable: Table<FlattenedTrackedEntity, string> =
            trackedEntitiesCollection.utils.getTable();
        const enrollTable: Table<FlattenedEnrollment, string> =
            enrollmentsCollection.utils.getTable();

        const mergedTrackedEntities = await mergeBulkTrackedEntities(
            serverTrackedEntities,
            async (id) => teTable.get(id),
        );

        const mergedEnrollments = await mergeBulkEnrollments(
            serverEnrollments,
            async (id) => enrollTable.get(id),
        );

        await enrollmentsCollection.utils.bulkInsertLocally(mergedEnrollments);
        await trackedEntitiesCollection.utils.bulkInsertLocally(
            mergedTrackedEntities,
        );

        result.pages += 1;
        result.trackedEntitiesPulled += instances.length;
        result.enrollmentsPulled += serverEnrollments.length;

        hasMore = shouldContinueDataPull({
            receivedCount: instances.length,
            pageSize: safePageSize,
            pager,
        });
        currentPage += 1;
    }

    return result;
}

/**
 * Pull events incrementally via tracker/events.
 *
 * Why: previously events came nested inside trackedEntities. That endpoint
 * had to load and serialize every event for every TE on every page. The
 * dedicated tracker/events endpoint with `updatedAfter` is much cheaper.
 */
export async function pullEventsIncremental({
    engine,
    program,
    orgUnit,
    lastEventPull,
    mode = "incremental",
    pageSize = DEFAULT_EVENT_PULL_PAGE_SIZE,
}: {
    engine: Engine;
    program: string;
    orgUnit: string;
    lastEventPull: string | undefined;
    mode?: SyncMode;
    pageSize?: number;
}): Promise<PullResult> {
    const safePageSize = Math.min(
        Math.max(1, pageSize),
        MAX_EVENT_PULL_PAGE_SIZE,
    );

    const updatedAfter = resolveUpdatedAfter(lastEventPull, mode);

    let currentPage = 1;
    let hasMore = true;
    const result: PullResult = {
        pages: 0,
        trackedEntitiesPulled: 0,
        eventsPulled: 0,
        enrollmentsPulled: 0,
    };

    while (hasMore) {
        const params: Record<string, any> = {
            program,
            orgUnit,
            orgUnitMode: "SELECTED",
            fields: EVENT_SYNC_FIELDS,
            page: currentPage,
            pageSize: safePageSize,
        };
        if (updatedAfter) {
            params.updatedAfter = updatedAfter;
        }

        const response = (await engine.query({
            events: {
                resource: "tracker/events",
                params,
            },
        })) as {
            events: {
                pager?: {
                    page?: number;
                    pageSize?: number;
                    pageCount?: number;
                    nextPage?: string;
                    total?: number;
                };
                events?: Event[];
                instances?: Event[];
            };
        };

        const raw = response.events.events ?? response.events.instances ?? [];
        const pager = response.events.pager;

        const serverEvents = raw
            .filter((event) => event.occurredAt)
            .map(flattenEvent);

        const eventTable: Table<FlattenedEvent, string> =
            eventsCollection.utils.getTable();

        const mergedEvents = await mergeBulkEvents(
            serverEvents,
            async (id) => eventTable.get(id),
        );

        await eventsCollection.utils.bulkInsertLocally(mergedEvents);

        result.pages += 1;
        result.eventsPulled += serverEvents.length;

        hasMore = shouldContinueDataPull({
            receivedCount: raw.length,
            pageSize: safePageSize,
            pager,
        });
        currentPage += 1;
    }

    return result;
}
