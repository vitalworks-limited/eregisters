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

Cancel restores the record to the snapshot captured at `openModal()` time via `insertLocally(data)`, then deletes any draft children created during the session using the same recursive cleanup.

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

Traversal order (depth-first, children before parent):

**For `eventId`:**
1. Find draft child events where `parentEvent === eventId && syncStatus === "draft"`
2. For each child: recurse `deleteRecursiveDraftSubtree(child.event, undefined, collections)`
3. Delete child event

**For `trackedEntityId`:**
1. Find draft child TEs where `parentEntity === trackedEntityId && syncStatus === "draft"`
2. For each child TE:
   - Find and delete its enrollments
   - Find its events, recurse on each, then delete each event
   - Recurse `deleteRecursiveDraftSubtree(undefined, childTE.trackedEntity, collections)`
   - Delete child TE

Uses `collection.utils.getTable()` (Dexie table) for filtering, consistent with the pattern in `tracked-entity.tsx`.

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

**FlattenedEvent (`"event" in data`):**
- If `data.syncStatus === "draft"`: `eventsCollection.delete(data.event)`
- Else: `eventsCollection.utils.insertLocally(data)` — restores original dataValues
- Then: `deleteRecursiveDraftSubtree(data.event, undefined, collections)`

**FlattenedTrackedEntity (`"trackedEntity" in data`):**
- If `data.syncStatus === "draft"`:
  - `trackedEntitiesCollection.delete(data.trackedEntity)`
  - Delete the linked enrollment from `enrollmentsCollection`
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

Cancel button handler:

```typescript
const handleCancel = async () => {
    setCancelling(true);
    try { await onCancel?.(); } finally { setCancelling(false); }
    onClose();
};
```

Cancel button receives `loading={cancelling}` and `disabled={cancelling || loading}`.

No other `DataModal` changes. `onClose` still fires after `onCancel` resolves.

---

## Call sites

Five `DataModal` instances are updated. Collections are already in scope at each site via `SyncContext.useSelector` — no new props or context required.

| File | Modal purpose | Record type | Is new? |
|------|--------------|-------------|---------|
| `src/routes/tracked-entity.tsx` | Visit (add/edit) | `FlattenedEvent` | `data.syncStatus === "draft"` |
| `src/routes/tracked-entity.tsx` | Edit client profile | `FlattenedTrackedEntity` | never |
| `src/components/no-patient-card.tsx` | Register new client | `FlattenedTrackedEntity` | always |
| `src/components/program-stage-capture.tsx` | Stage event | `FlattenedEvent` | always |
| `src/components/main-event-capture.tsx` | Newborn child | `FlattenedTrackedEntity` | always |

Each adds:

```tsx
onCancel={() => cancelDataModal(data!, {
    eventsCollection,
    trackedEntitiesCollection,
    enrollmentsCollection,
})}
```

---

## What does not change

- XState machines (`event-form.ts`, `tracked-entity-form.ts`) — untouched
- `onSave` logic at any call site — untouched
- `destroyOnHidden={true}` on `DataModal` — stays
- All prop signatures other than the new optional `onCancel`
