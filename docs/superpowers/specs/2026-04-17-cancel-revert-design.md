# Cancel & Revert Design Spec

**Date:** 2026-04-17
**Status:** Approved

## Problem

Clicking Cancel on any `DataModal` currently just closes the modal. For new records this leaves orphaned draft data in the local DB. For existing records any in-progress edits (persisted field-by-field by the XState machine) are left in place — the record is dirtied with no way to undo.

## Solution

Add an `onCancel` prop to `DataModal`. Wire it at each of the five call sites using a shared `cancelDataModal` utility that handles both revert (existing records) and delete (new records), plus recursive cleanup of any draft children created during the session.

---

## Behaviour

### New record (`data.syncStatus === "draft"` at modal-open time)

Cancel deletes the main record and its entire draft subtree — all descendants reachable via `parentEvent` / `parentEntity` links whose `syncStatus === "draft"`.

### Existing record (`data.syncStatus !== "draft"`)

Cancel restores the record to the snapshot captured at `openModal()` time via `insertLocally(data)`, then deletes any draft children created during the session using the same recursive cleanup. Note: even for an existing record the child-subtree cleanup is meaningful — draft children created in a prior session (e.g. a newborn registered but never saved) will be cleaned up here.

### Unchanged

Clicking Save is unaffected. Call sites that do not provide `onCancel` keep current behaviour (modal closes immediately).

---

## Snapshot safety

`useModalState` stores `data` in plain React `useState`. It is set once at `openModal()` call time and is never updated reactively. This makes it a safe pre-edit snapshot regardless of what the XState machine or TanStack DB reactive queries do afterward. The machine's own `event`/`trackedEntity` context is **not** used as the revert source because rule assignments run on machine entry and may already have mutated the persisted record before the user edits anything.

---

## New functions in `src/utils/utils.ts`

### `deleteRecursiveDraftSubtree`

```typescript
async function deleteRecursiveDraftSubtree(
    eventId: string | undefined,
    trackedEntityId: string | undefined,
    collections: {
        eventsCollection: ReturnType<typeof createEventCollection>;
        trackedEntitiesCollection: ReturnType<typeof createTrackedEntityCollection>;
        enrollmentsCollection: ReturnType<typeof createEnrollmentCollection>;
    },
): Promise<void>
```

This function deletes **only the descendants** of the given node — it does **not** delete the node itself. The caller (`cancelDataModal`) is responsible for deleting the root record.

Traversal order (depth-first, children before parent):

**For `eventId`:**
1. Find draft child events: `eventsTable.filter(e => e.parentEvent === eventId && e.syncStatus === "draft")`
2. For each child event: `deleteRecursiveDraftSubtree(child.event, undefined, collections)` then `eventsCollection.delete(child.event)`

**For `trackedEntityId`:**
1. Find draft child TEs: `tETable.filter(te => te.parentEntity === trackedEntityId && te.syncStatus === "draft")`
2. For each child TE:
   - Find its enrollments: `enrollmentsTable.where("trackedEntity").equals(childTE.trackedEntity).toArray()` → delete each
   - Find its events: `eventsTable.filter(e => e.trackedEntity === childTE.trackedEntity)` → for each: `deleteRecursiveDraftSubtree(event.event, undefined, collections)` then `eventsCollection.delete(event.event)`
   - `deleteRecursiveDraftSubtree(undefined, childTE.trackedEntity, collections)`
   - `trackedEntitiesCollection.delete(childTE.trackedEntity)`

Uses `collection.utils.getTable()` (raw Dexie table) for filtering, consistent with the pattern already in `tracked-entity.tsx`.

---

### `cancelDataModal`

```typescript
async function cancelDataModal(
    data: FlattenedEvent | FlattenedTrackedEntity,
    collections: {
        eventsCollection: ReturnType<typeof createEventCollection>;
        trackedEntitiesCollection: ReturnType<typeof createTrackedEntityCollection>;
        enrollmentsCollection: ReturnType<typeof createEnrollmentCollection>;
    },
): Promise<void>
```

Discriminant matches the codebase convention (`tracked-entity.tsx` line 493, `sync.ts` lines 99/148/156) — both `FlattenedEvent` and `FlattenedTrackedEntity` share a `trackedEntity` field, so `"trackedEntity" in data` is always true and cannot be used:

```typescript
if ("event" in data) {
    // FlattenedEvent branch
} else if ("trackedEntityType" in data) {
    // FlattenedTrackedEntity branch
}
```

**FlattenedEvent (`"event" in data`):**
- If `data.syncStatus === "draft"`: `eventsCollection.delete(data.event)`
- Else: `eventsCollection.utils.insertLocally(data)` — restores original dataValues
- Then: `deleteRecursiveDraftSubtree(data.event, undefined, collections)`

**FlattenedTrackedEntity (`"trackedEntityType" in data`):**
- If `data.syncStatus === "draft"`:
  - `trackedEntitiesCollection.delete(data.trackedEntity)`
  - Look up the enrollment: `enrollmentsCollection.utils.getTable().where("trackedEntity").equals(data.trackedEntity).first()` → if found, delete it (guard against missing enrollment with `if (enrollment)`)
- Else: `trackedEntitiesCollection.utils.insertLocally(data)` — restores original attributes
- Then: `deleteRecursiveDraftSubtree(undefined, data.trackedEntity, collections)`

---

## `DataModal` changes — `src/components/data-modal.tsx`

Add one optional prop:

```typescript
onCancel?: () => Promise<void>;
```

Add `cancelling` boolean state (separate from `loading`):

```typescript
const [cancelling, setCancelling] = useState(false);
```

Cancel button handler — `onClose` is inside the `try` block so it only fires on success; a failed cancel (e.g. Dexie error) leaves the modal open:

```typescript
const handleCancel = async () => {
    setCancelling(true);
    try {
        await onCancel?.();
        onClose();
    } finally {
        setCancelling(false);
    }
};
```

Cancel button receives `loading={cancelling}` and `disabled={cancelling || loading}`.

The `<Modal>` element's `onCancel` prop (currently wired to `onClose`, handles the X button and ESC key) must also be updated to call `handleCancel` instead of `onClose` — otherwise the X button and ESC key bypass the revert logic entirely.

No other `DataModal` changes. If `onCancel` is not provided, `onClose()` fires immediately (current behaviour preserved).

---

## Call sites

Five `DataModal` instances are updated. Each passes:

```tsx
onCancel={() => cancelDataModal(data!, {
    eventsCollection,
    trackedEntitiesCollection,
    enrollmentsCollection,
})}
```

**Important — selector expansions required at two sites before wiring:**

- `src/components/no-patient-card.tsx`: current `SyncContext.useSelector` only extracts `enrollmentsCollection` and `trackedEntitiesCollection`. Must add `eventsCollection` to the selector (needed for recursive child-event cleanup).
- `src/components/program-stage-capture.tsx`: current `SyncContext.useSelector` only extracts `eventsCollection`. Must add `trackedEntitiesCollection` and `enrollmentsCollection`.

| File | Modal purpose | Record type | Is new? | Notes |
|------|--------------|-------------|---------|-------|
| `src/routes/tracked-entity.tsx` | Visit (add/edit) | `FlattenedEvent` | `data.syncStatus === "draft"` | Handles both new and existing visits |
| `src/routes/tracked-entity.tsx` | Edit client profile | `FlattenedTrackedEntity` | never | Child-subtree cleanup still runs and is meaningful |
| `src/components/no-patient-card.tsx` | Register new client | `FlattenedTrackedEntity` | always | Expand selector to include `eventsCollection` |
| `src/components/program-stage-capture.tsx` | Stage event | `FlattenedEvent` | always | Expand selector to include `trackedEntitiesCollection` + `enrollmentsCollection` |
| `src/components/main-event-capture.tsx` | Newborn child | `FlattenedTrackedEntity` | always | All three collections already available |

---

## What does not change

- XState machines (`event-form.ts`, `tracked-entity-form.ts`) — untouched
- `onSave` logic at any call site — untouched
- `destroyOnHidden={true}` on `DataModal` — stays
- All prop signatures other than the new optional `onCancel`
