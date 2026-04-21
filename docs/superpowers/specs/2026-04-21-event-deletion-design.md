# Event Deletion Design

**Date:** 2026-04-21
**Scope:** Events (program stage rows) including their child events, child tracked entities, and their enrollments

---

## Problem

Deletion is broken in four ways:

1. Records marked `syncStatus: "deleted"` are never queried by the sync machine — they never reach DHIS2.
2. The DHIS2 payload has no deletion strategy, so even if records were sent, DHIS2 would not delete them.
3. Deleted records still appear in all event tables (no filter in queries).
4. Child events of a deleted parent are not handled — only draft children are cleaned up today.

There is also a pre-existing bug in `program-stage-capture.tsx`: the delete handler unconditionally sets `syncStatus = "deleted"` without first checking for `"draft"`. This is fixed as part of this work.

---

## Rules

| Record state | Action on delete |
| --- | --- |
| `syncStatus === "draft"` | Hard-delete from local DB immediately. Do **not** send to DHIS2. |
| `syncStatus === "pending"` | Mark `syncStatus = "deleted"`. This guards against a race condition where the record is already in-flight to DHIS2 inside a running `uploadEntities` actor. After marking deleted it will be picked up by the next batch cycle. |
| `syncStatus === "synced"` or `"failed"` | Mark `syncStatus = "deleted"`. Sync to DHIS2 with `importStrategy: "DELETE"`. Hard-delete locally only after DHIS2 confirms success. |
| Child event or child TE, any state | Apply the same draft/pending/synced rules above to each child entity type. |

---

## Section 1 — Deletion Trigger

### New utility: `deleteEventWithChildren`

**File:** `src/utils/utils.ts`

A new async function replaces the ad-hoc delete code in both `tracked-entity.tsx` and `program-stage-capture.tsx`.

```ts
deleteEventWithChildren(
  eventId: string,
  collections: { eventsCollection, trackedEntitiesCollection, enrollmentsCollection },
): Promise<{ markedDeleted: FlattenedEvent[] }>
```

**Algorithm (depth-first, leaves before root):**

1. Collect the full event subtree rooted at `eventId` by walking two dimensions — this mirrors the existing `deleteRecursiveDraftSubtree` pattern in `utils.ts` (lines 1206–1290):

   - **Event-children dimension:** find all events where `event.parentEvent === eventId`.
   - **TE-children dimension:** find all tracked entities where `te.parentEntity === rootEvent.trackedEntity`, then for each such child TE, find all events where `event.trackedEntity === childTE.trackedEntity` (not a second `parentEvent` filter — all events that belong to that child TE).
   - Recurse into each found event's own subtree.

2. Process children before the root (leaves first).

3. For each event in the tree, apply the rules from the table above:
   - `"draft"` → hard-delete via `eventsCollection.delete(id)`. Delete the corresponding evaluations via `db.indicatorEvaluations.where("eventId").equals(id).delete()`.
   - `"pending"`, `"synced"`, or `"failed"` → update `syncStatus = "deleted"`. Add to `markedDeleted`.

4. For each child TE found in step 1 (the TE-children dimension), also clean up its enrollment rows and its own TE row:
   - Find enrollments: `enrollmentsTable.where("trackedEntity").equals(childTE.trackedEntity).toArray()`
   - For `"draft"` enrollments: hard-delete via `enrollmentsCollection.delete(id)`
   - For non-draft enrollments: mark `syncStatus = "deleted"` (handled by enrollment sync, out of scope of this spec)
   - Apply the same draft/non-draft rule to the child TE row itself via `trackedEntitiesCollection`

5. Return `{ markedDeleted }`.

   Note: The `hardDeleted` IDs must **not** be passed to `SYNC_ENTITIES` — those records no longer exist in the local DB.

   Note: `indicatorEvaluations` cleanup for `markedDeleted` events (those awaiting server confirmation) is delegated to `syncDeleteToLocal` (step 3 of Section 2).

### UI components

Both `tracked-entity.tsx` and `program-stage-capture.tsx` replace their current inline delete logic with a call to `deleteEventWithChildren`.

`program-stage-capture.tsx` currently has no `syncActor` reference. It must obtain one via `SyncContext.useActorRef()` at the top of its component function. `SyncContext` is already exported from `src/machines/sync.ts`.

After `deleteEventWithChildren` returns, if `markedDeleted.length > 0`:

```ts
syncActor.send({ type: "SYNC_ENTITIES", entities: markedDeleted });
```

This triggers an immediate DELETE sync instead of waiting for the 30-second batch.

---

## Section 2 — Sync Machine

### New helper: `syncDeleteToLocal`

**File:** `src/machines/sync.ts`

Extracted alongside `syncReportToLocal`:

```ts
syncDeleteToLocal({
  deletedEvents: FlattenedEvent[],
  engine,
  eventsCollection,
}): Promise<{ succeeded: number; failed: number }>
```

**Implementation:**

1. Send to DHIS2:

   ```ts
   engine.mutate({
     resource: "tracker",
     type: "create",
     data: { events: deletedEvents.map(e => ({ event: e.event })) },
     params: {
       async: false,
       importStrategy: "DELETE",
       atomicMode: "OBJECT",
     },
   })
   ```

   Using `atomicMode: "OBJECT"` ensures one bad UID does not block the rest.

2. Parse the response using the same pattern as `syncReportToLocal`:
   - **Success set:** UIDs in `bundleReport.typeReportMap.EVENT.objectReports`
   - **Failure set:** UIDs in `validationReport.errorReports` (mapped by `uid`)
   - Records not in either set are treated as failed.

3. For each UID in the success set:
   - Hard-delete from local DB: `eventsCollection.delete(uid)`
   - Delete stale evaluations: `await db.indicatorEvaluations.where("eventId").equals(uid).delete()` — the primary key of `indicatorEvaluations` is `id`, not `eventId`, so `db.indicatorEvaluations.delete(uid)` would silently no-op.

4. For each UID in the failure set: leave as `syncStatus: "deleted"` for retry.

5. Return `{ succeeded: successSet.size, failed: failureSet.size }`.

### `uploadEntities` actor — direct sync path

**File:** `src/machines/sync.ts`

Entities must be **partitioned before** calling `syncReportToLocal`, otherwise `deleted` events would be sent with `importStrategy: "CREATE_AND_UPDATE"` — actively corrupting DHIS2 data.

```ts
const toUpsert = entities.filter(
  e => !("event" in e) || (e as FlattenedEvent).syncStatus !== "deleted"
);
const toDelete = entities.filter(
  e => "event" in e && (e as FlattenedEvent).syncStatus === "deleted"
) as FlattenedEvent[];

if (toUpsert.length > 0) {
  await syncReportToLocal({ entities: toUpsert, engine, ...collections, ...validIds });
}
if (toDelete.length > 0) {
  await syncDeleteToLocal({ deletedEvents: toDelete, engine, eventsCollection });
}
```

The return value is the combined stats from both calls.

### `processBatchSync` actor

**File:** `src/machines/sync.ts`

After the existing `pendingEvents` query, add:

```ts
const deletedEvents = await eventTable
  .filter(e => e.syncStatus === "deleted")
  .toArray();
```

Run the create/update batch first (existing behavior), then run the delete batch via `syncDeleteToLocal`. The final return value aggregates both:

```ts
return {
  processed: upsertResult.processed + deletedEvents.length,
  succeeded: upsertResult.succeeded + deleteResult.succeeded,
  failed: upsertResult.failed + deleteResult.failed,
};
```

---

## Section 3 — UI Filter

Every query that loads events for display must exclude `syncStatus === "deleted"` records. The `@tanstack/react-db` library exports a `not` operator that composes with `eq`:

```ts
import { eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
// ...
.where(({ events }) => not(eq(events.syncStatus, "deleted")))
```

| File | Change |
| --- | --- |
| `src/components/program-stage-capture.tsx` | Add `not(eq(events.syncStatus, "deleted"))` filter to the event query |
| `src/routes/tracked-entity.tsx` | Add the same filter to all event queries |
| `src/components/relation.tsx` | Add the same filter to the event query (~lines 42–53) |
| `src/components/relationship-event.tsx` | Add the same filter to both event queries (~lines 38–49) |

---

## Data Flow

```text
User clicks Delete
      │
      ▼
deleteEventWithChildren(eventId)
      │
      ├─ draft events/TEs/enrollments → hard-delete local DB + indicatorEvaluations
      └─ pending/synced/failed events → syncStatus = "deleted"
              │
              ▼
    send SYNC_ENTITIES({ entities: markedDeleted })
              │
              ▼
    uploadEntities actor
              │
       partition by syncStatus
              │
      ┌───────┴────────┐
      ▼                ▼
 syncReportToLocal   syncDeleteToLocal
 CREATE_AND_UPDATE   DELETE, atomicMode=OBJECT
                       │
                ┌──────┴──────┐
                ▼             ▼
           success:        failure:
         hard-delete      leave as
         + indicators     "deleted"
           cleanup        for retry
```

---

## Error Handling

- DHIS2 DELETE uses `atomicMode: "OBJECT"` — one bad UID does not block other deletions.
- Failed deletions stay as `syncStatus: "deleted"` and are retried by `processBatchSync` every 30 seconds.
- `"pending"` events are marked `"deleted"` (not hard-deleted) to avoid a race condition with an in-flight `uploadEntities` actor that already has the entity in its closure. The batch cycle will process the deletion after the in-flight call completes.

---

## Verification

1. Create an event with a child event (both `syncStatus = "draft"`).
   - Delete the parent — both are hard-deleted from the local DB immediately. Neither appears in any event table.
2. Sync a parent+child pair to DHIS2 (both `syncStatus = "synced"`).
   - Delete the parent — both are marked `syncStatus = "deleted"` and disappear from all event tables immediately.
   - Trigger "Push Data" — both are sent to DHIS2 with `importStrategy: "DELETE"`. After success, both are hard-deleted from local DB and their `indicatorEvaluations` rows are removed.
3. Mixed tree: parent is `"synced"`, child is `"draft"`.
   - Delete the parent — child is hard-deleted immediately, parent is marked `"deleted"` and synced to DHIS2 on next push.
4. Delete an event while a batch sync is in flight (`syncStatus = "pending"`).
   - Event is marked `"deleted"` (not hard-deleted). After the in-flight sync resolves, the next batch cycle sends the DELETE to DHIS2.
5. Confirm DELETE retries on the next 30-second batch cycle if the DHIS2 call fails.
6. Confirm deleted events do not appear in `program-stage-capture`, `tracked-entity`, `relation`, or `relationship-event` components.
