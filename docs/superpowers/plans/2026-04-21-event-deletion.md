# Event Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix event deletion so drafts are hard-deleted locally, synced records are deleted on DHIS2 and then cleaned up locally, child events are handled recursively, and deleted events never appear in any table.

**Architecture:** A new `deleteEventWithChildren` utility handles the local deletion decision tree (draft → hard delete, synced → mark deleted). A new `syncDeleteToLocal` helper in the sync machine sends `importStrategy: "DELETE"` batches to DHIS2 and hard-deletes confirmed records. All four event query sites filter out `syncStatus === "deleted"` via `not(eq(...))`.

**Tech Stack:** TypeScript, XState v5, TanStack DB (Dexie), React, DHIS2 app-runtime, Ant Design

**Spec:** `docs/superpowers/specs/2026-04-21-event-deletion-design.md`

---

## File Map

| File | Change |
| --- | --- |
| `src/utils/utils.ts` | Add `deleteEventWithChildren` function |
| `src/routes/tracked-entity.tsx` | Replace inline delete logic with `deleteEventWithChildren` |
| `src/components/program-stage-capture.tsx` | Fix draft check; use `deleteEventWithChildren`; add `syncActor`; add `not` filter |
| `src/machines/sync.ts` | Add `syncDeleteToLocal`; update `uploadEntities`; update `processBatchSync` |
| `src/components/relation.tsx` | Add `not(eq(..., "deleted"))` filter |
| `src/components/relationship-event.tsx` | Add `not(eq(..., "deleted"))` filter to both event queries |

---

## Task 1: Add `deleteEventWithChildren` to `src/utils/utils.ts`

**Files:**
- Modify: `src/utils/utils.ts`

This replaces the current ad-hoc inline delete code with one well-defined function. It walks both the `parentEvent` (event-children) and `parentEntity` (TE-children with their events) dimensions, applies draft/pending/synced rules, and returns a list of events marked `"deleted"` that the caller must sync.

- [ ] **Step 1: Add the function after `deleteRecursiveDraftSubtree` (around line 1290)**

```ts
/**
 * Deletes an event and its full subtree (both parentEvent and parentEntity dimensions).
 * - Draft/pending events are hard-deleted locally immediately.
 * - Synced/failed events are marked syncStatus="deleted" for DHIS2 deletion.
 * Returns the list of non-draft events marked for deletion so callers can trigger sync.
 */
export async function deleteEventWithChildren(
    eventId: string,
    collections: {
        eventsCollection: ReturnType<typeof createEventCollection>;
        trackedEntitiesCollection: ReturnType<
            typeof createTrackedEntityCollection
        >;
        enrollmentsCollection: ReturnType<typeof createEnrollmentCollection>;
    },
): Promise<{ markedDeleted: FlattenedEvent[] }> {
    const eventsTable: DexieTable<FlattenedEvent, string> =
        collections.eventsCollection.utils.getTable();
    const teTable: DexieTable<FlattenedTrackedEntity, string> =
        collections.trackedEntitiesCollection.utils.getTable();
    const enrollmentsTable: DexieTable<FlattenedEnrollment, string> =
        collections.enrollmentsCollection.utils.getTable();

    const markedDeleted: FlattenedEvent[] = [];

    // Get the root event to know its trackedEntity (needed for TE-children dimension)
    const rootEvent = await eventsTable.get(eventId);
    if (!rootEvent) return { markedDeleted };

    // --- Recursive helper ---
    async function processEvent(event: FlattenedEvent): Promise<void> {
        // 1. Event-children dimension: events whose parentEvent === this event
        const directChildEvents = await eventsTable
            .filter((e) => e.parentEvent === event.event)
            .toArray();
        for (const child of directChildEvents) {
            await processEvent(child);
        }

        // 2. TE-children dimension: TEs whose parentEntity === this event's trackedEntity
        //    then process all events belonging to those child TEs
        const childTEs = await teTable
            .filter((te) => te.parentEntity === event.trackedEntity)
            .toArray();
        for (const childTE of childTEs) {
            // Find all events for this child TE
            const childTEEvents = await eventsTable
                .filter((e) => e.trackedEntity === childTE.trackedEntity)
                .toArray();
            for (const childTEEvent of childTEEvents) {
                await processEvent(childTEEvent);
            }
            // Clean up the child TE's enrollments
            const childEnrollments = await enrollmentsTable
                .where("trackedEntity")
                .equals(childTE.trackedEntity)
                .toArray();
            for (const enrollment of childEnrollments) {
                if (
                    enrollment.syncStatus === "draft" ||
                    enrollment.syncStatus === "pending"
                ) {
                    const tx = collections.enrollmentsCollection.delete(
                        enrollment.enrollment,
                    );
                    await tx.isPersisted.promise;
                } else {
                    const tx = collections.enrollmentsCollection.update(
                        enrollment.enrollment,
                        (d) => {
                            d.syncStatus = "deleted";
                        },
                    );
                    await tx.isPersisted.promise;
                }
            }
            // Clean up the child TE itself
            if (
                childTE.syncStatus === "draft" ||
                childTE.syncStatus === "pending"
            ) {
                const tx = collections.trackedEntitiesCollection.delete(
                    childTE.trackedEntity,
                );
                await tx.isPersisted.promise;
            } else {
                const tx = collections.trackedEntitiesCollection.update(
                    childTE.trackedEntity,
                    (d) => {
                        d.syncStatus = "deleted";
                    },
                );
                await tx.isPersisted.promise;
            }
        }

        // 3. Now handle this event itself (after its children are processed)
        if (
            event.syncStatus === "draft" ||
            event.syncStatus === "pending"
        ) {
            const tx = collections.eventsCollection.delete(event.event);
            await tx.isPersisted.promise;
            await db.indicatorEvaluations
                .where("eventId")
                .equals(event.event)
                .delete();
        } else {
            const tx = collections.eventsCollection.update(
                event.event,
                (d) => {
                    d.syncStatus = "deleted";
                },
            );
            await tx.isPersisted.promise;
            markedDeleted.push({ ...event, syncStatus: "deleted" });
        }
    }

    await processEvent(rootEvent);
    return { markedDeleted };
}
```

- [ ] **Step 2: Add `db` import to `utils.ts`**

`src/utils/utils.ts` does **not** currently import `db`. Add the import after the existing collection imports (around line 24):

```ts
import { db } from "../db";
```

The `DexieTable` type is already imported via `import { Table as DexieTable } from "dexie"` at line 2.

- [ ] **Step 3: Commit**

```bash
git add src/utils/utils.ts
git commit -m "feat: add deleteEventWithChildren utility for recursive event deletion"
```

---

## Task 2: Replace delete logic in `src/routes/tracked-entity.tsx`

**Files:**
- Modify: `src/routes/tracked-entity.tsx`

The existing inline delete handler (~lines 251–265) checks for `"draft"` but doesn't recurse into children and doesn't trigger immediate sync. Replace it entirely with `deleteEventWithChildren`.

- [ ] **Step 1: Import `deleteEventWithChildren` at the top of the file**

Add to the existing import from `../utils/utils`:

```ts
import {
    // ...existing imports...
    deleteEventWithChildren,
} from "../utils/utils";
```

- [ ] **Step 2: Get `syncActor` reference if not already present**

Near the top of the component function, find where `SyncContext.useActorRef()` is called (it already exists in this file). Make sure it is accessible in the `onConfirm` callback scope.

- [ ] **Step 3: Replace the inline delete handler**

Find the `Popconfirm` block containing the delete logic (~lines 246–271) and replace the `onConfirm` body:

```ts
onConfirm={async () => {
    try {
        const { markedDeleted } = await deleteEventWithChildren(
            record.event,
            {
                eventsCollection,
                trackedEntitiesCollection,
                enrollmentsCollection,
            },
        );
        if (markedDeleted.length > 0) {
            syncActor.send({
                type: "SYNC_ENTITIES",
                entities: markedDeleted,
            });
        }
        message.success("Event deleted");
    } catch (error) {
        console.error("Failed to delete event:", error);
        message.error("Failed to delete event");
    }
}}
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/tracked-entity.tsx
git commit -m "feat: use deleteEventWithChildren in tracked-entity delete handler"
```

---

## Task 3: Fix delete handler in `src/components/program-stage-capture.tsx`

**Files:**
- Modify: `src/components/program-stage-capture.tsx`

Two fixes: (1) the current handler unconditionally marks `syncStatus = "deleted"` without checking for drafts, and (2) it doesn't recurse into children. Replace with `deleteEventWithChildren`. `SyncContext` is already imported (line 23) but `useActorRef()` is not yet called.

- [ ] **Step 1: Import `deleteEventWithChildren`**

Add to the existing import from `../utils/utils`:

```ts
import {
    // ...existing imports...
    deleteEventWithChildren,
} from "../utils/utils";
```

- [ ] **Step 2: Add `syncActor` inside the component function**

In the component body, after the existing `SyncContext.useSelector(...)` calls, add:

```ts
const syncActor = SyncContext.useActorRef();
```

- [ ] **Step 3: Get `enrollmentsCollection` and `trackedEntitiesCollection` from context**

The existing `SyncContext.useSelector` already pulls `eventsCollection`. Extend it to also pull the other two collections needed by `deleteEventWithChildren`:

```ts
const { eventsCollection, enrollmentsCollection, trackedEntitiesCollection } =
    SyncContext.useSelector((a) => ({
        eventsCollection: a.context.eventsCollection,
        enrollmentsCollection: a.context.enrollmentsCollection,
        trackedEntitiesCollection: a.context.trackedEntitiesCollection,
    }));
```

- [ ] **Step 4: Replace the delete `onConfirm` body**

Find the `Popconfirm` delete handler (~lines 150–165) and replace its `onConfirm`:

```ts
onConfirm={async () => {
    try {
        const { markedDeleted } = await deleteEventWithChildren(
            record.event,
            {
                eventsCollection,
                trackedEntitiesCollection,
                enrollmentsCollection,
            },
        );
        if (markedDeleted.length > 0) {
            syncActor.send({
                type: "SYNC_ENTITIES",
                entities: markedDeleted,
            });
        }
        message.success("Event deleted");
    } catch (error) {
        console.error("Failed to delete event:", error);
        message.error("Failed to delete event");
    }
}}
```

- [ ] **Step 5: Add `not` import and filter deleted events from the stage query**

In the import line at the top:

```ts
import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
```

Then update the `useLiveSuspenseQuery` event query (~line 96):

```ts
const { data: events } = useLiveSuspenseQuery((q) =>
    q.from({ event: eventsCollection }).where(({ event }) => {
        return and(
            eq(event.programStage, programStage.id),
            eq(event.parentEvent, mainEvent.event),
            not(eq(event.syncStatus, "deleted")),
        );
    }),
);
```

- [ ] **Step 6: Commit**

```bash
git add src/components/program-stage-capture.tsx
git commit -m "feat: fix program-stage-capture delete handler and filter deleted events"
```

---

## Task 4: Add `syncDeleteToLocal` to `src/machines/sync.ts`

**Files:**
- Modify: `src/machines/sync.ts`

Add the helper that sends a DELETE batch to DHIS2 and hard-deletes confirmed records locally.

- [ ] **Step 1: Add `syncDeleteToLocal` just below `syncReportToLocal`**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/machines/sync.ts
git commit -m "feat: add syncDeleteToLocal helper for DHIS2 event deletion"
```

---

## Task 5: Update `uploadEntities` actor to partition by `syncStatus`

**Files:**
- Modify: `src/machines/sync.ts`

**Prerequisite:** Task 4 (`syncDeleteToLocal`) must be complete first — this task calls it.

Without this, deleted events passed via `SYNC_ENTITIES` would be sent to DHIS2 as `CREATE_AND_UPDATE`, corrupting data.

- [ ] **Step 1: Find the `uploadEntities` fromPromise actor body**

Look for the block starting with `uploadEntities: fromPromise(`. Inside the async body, find the call to `syncReportToLocal`.

- [ ] **Step 2: Replace the single `syncReportToLocal` call with partitioned logic**

Replace:

```ts
const result = await syncReportToLocal({
    enrollmentsCollection,
    eventsCollection,
    trackedEntitiesCollection,
    entities,
    engine,
    validAttributeIds,
    validDataElementsByStage,
});

return result;
```

With:

```ts
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
```

- [ ] **Step 3: Commit**

```bash
git add src/machines/sync.ts
git commit -m "feat: partition uploadEntities to route deleted events to DELETE batch"
```

---

## Task 6: Update `processBatchSync` to pick up deleted events

**Files:**

- Modify: `src/machines/sync.ts`

The 30-second batch cycle must also process events with `syncStatus === "deleted"` for retry and for cases where the user deletes without network.

- [ ] **Step 1: Find the `processBatchSync` fromPromise actor body**

Look for `processBatchSync: fromPromise(`. Inside, find the three `pendingXxx` queries and the `syncReportToLocal` call at the end.

- [ ] **Step 2: Add the deleted events query after the existing pending queries**

After:

```ts
const pendingEvents = await eventTable
    .filter((e) => e.syncStatus === "pending" && !!e.occurredAt)
    .toArray();
```

Add:

```ts
const deletedEvents = await eventTable
    .filter((e) => e.syncStatus === "deleted")
    .toArray();
```

- [ ] **Step 3: Run both batches and aggregate results**

Replace the existing `return syncReportToLocal(...)` call with:

```ts
const upsertResult = await syncReportToLocal({
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

const deleteResult = await syncDeleteToLocal({
    deletedEvents,
    engine,
    eventsCollection,
});

return {
    processed: upsertResult.processed + deletedEvents.length,
    succeeded: upsertResult.succeeded + deleteResult.succeeded,
    failed: upsertResult.failed + deleteResult.failed,
};
```

- [ ] **Step 4: Commit**

```bash
git add src/machines/sync.ts
git commit -m "feat: processBatchSync now sends DELETE batch for syncStatus=deleted events"
```

---

## Task 7: Filter deleted events from all query sites

**Files:**

- Modify: `src/components/relation.tsx`
- Modify: `src/components/relationship-event.tsx`
- Modify: `src/routes/tracked-entity.tsx`

`program-stage-capture.tsx` was already updated in Task 3.

### `relation.tsx`

- [ ] **Step 1: Add `not` to the import**

```ts
import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
```

- [ ] **Step 2: Update the `childEvent` query to exclude deleted events**

```ts
const { data: childEvent } = useLiveSuspenseQuery(
    (q) =>
        q
            .from({ events: eventsCollection })
            .where(({ events }) =>
                and(
                    eq(events.parentEvent, mainEvent.event),
                    eq(events.trackedEntity, trackedEntity.trackedEntity),
                    not(eq(events.syncStatus, "deleted")),
                ),
            )
            .findOne(),
    [trackedEntity.trackedEntity, mainEvent.event],
);
```

### `relationship-event.tsx`

- [ ] **Step 3: Update import to add `and` and `not`**

The file currently has `import { eq, useLiveSuspenseQuery } from "@tanstack/react-db"`. Replace with:

```ts
import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
```

- [ ] **Step 4: Update the `children` (tracked entities) query**

The `children` query at lines 38-44 loads child tracked entities — add a filter to exclude any whose `syncStatus === "deleted"`:

```ts
const { data: children } = useLiveSuspenseQuery((q) =>
    q
        .from({ trackedEntity: trackedEntitiesCollection })
        .where(({ trackedEntity }) =>
            and(
                eq(trackedEntity.parentEntity, tei.trackedEntity),
                not(eq(trackedEntity.syncStatus, "deleted")),
            ),
        ),
);

- [ ] **Step 5: Update the `events` query to exclude deleted events**

```ts
const { data: events } = useLiveSuspenseQuery((q) =>
    q
        .from({ event: eventsCollection })
        .where(({ event }) =>
            and(
                eq(event.parentEvent, mainEvent.event),
                not(eq(event.syncStatus, "deleted")),
            ),
        ),
);
```

### `tracked-entity.tsx`

- [ ] **Step 6: Add `not` to the import and filter both event queries**

The existing import is `import { and, eq, useLiveSuspenseQuery } from "@tanstack/react-db"`. Add `not`:

```ts
import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
```

There are two event queries that need filtering (lines 122–136 and 138–148):

**Query 1** — the stage events list:

```ts
const { data: events } = useLiveSuspenseQuery(
    (q) => {
        return q
            .from({ events: eventsCollection })
            .where(({ events }) =>
                and(
                    eq(events.trackedEntity, tei),
                    eq(events.programStage, "K2nxbE9ubSs"),
                    eq(events.orgUnit, id),
                    not(eq(events.syncStatus, "deleted")),
                ),
            )
            .orderBy(({ events }) => events.occurredAt, "desc");
    },
    [tei],
);
```

**Query 2** — the current/selected event:

```ts
const { data: currentEvent } = useLiveSuspenseQuery(
    (q) => {
        return q
            .from({ events: eventsCollection })
            .where(({ events }) =>
                and(
                    eq(events.event, data?.event),
                    eq(events.orgUnit, id),
                    not(eq(events.syncStatus, "deleted")),
                ),
            )
            .findOne();
    },
    [data?.event],
);
```

- [ ] **Step 7: Commit all filter changes**

```bash
git add src/components/relation.tsx src/components/relationship-event.tsx src/routes/tracked-entity.tsx
git commit -m "feat: filter syncStatus=deleted events from all query sites"
```

---

## Verification Checklist

After all tasks are complete, manually verify:

- [ ] Create an event with a child event (both `syncStatus = "draft"`). Delete the parent — both disappear from the table immediately with no DHIS2 call.
- [ ] Sync a parent+child pair to DHIS2 (both reach `syncStatus = "synced"`). Delete the parent — both disappear from the table immediately. Press "Push Data" — verify the DHIS2 network call uses `importStrategy: "DELETE"`. After success, confirm they are gone from the local DB.
- [ ] Mixed tree: parent `"synced"`, child `"draft"`. Delete parent — child is hard-deleted immediately, parent is marked `"deleted"`. Next push sends only the parent to DHIS2.
- [ ] Confirm deleted events do not reappear in `program-stage-capture`, the main event table in `tracked-entity`, the `relation` component, or the `relationship-event` tabs.
- [ ] Confirm TypeScript builds with no new errors: `npx tsc --noEmit`
