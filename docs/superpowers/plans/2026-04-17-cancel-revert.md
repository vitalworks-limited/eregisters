# Cancel & Revert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Cancel is clicked on any `DataModal`, new (draft) records are deleted and existing records are restored to their pre-edit state, along with recursive cleanup of any draft child records created during the session.

**Architecture:** A shared `cancelDataModal` utility (plus its helper `deleteRecursiveDraftSubtree`) is added to `src/utils/utils.ts`. `DataModal` gains an optional `onCancel` prop and a `cancelling` state; the Cancel button and `<Modal onCancel>` (X/ESC) are both wired to a new `handleCancel` handler. Five call sites pass the utility as `onCancel`. Two call sites need their `SyncContext.useSelector` expanded to include missing collections before wiring.

**Tech Stack:** React 18, TypeScript, Ant Design 5, TanStack DB (Dexie-backed), XState v5

**Spec:** `docs/superpowers/specs/2026-04-17-cancel-revert-design.md`

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Modify | `src/utils/utils.ts` | Add `deleteRecursiveDraftSubtree` and `cancelDataModal` exports; add collection imports |
| Modify | `src/components/data-modal.tsx` | Add `onCancel` prop, `cancelling` state, `handleCancel`; rewire Cancel button and `<Modal onCancel>` |
| Modify | `src/routes/tracked-entity.tsx` | Wire `onCancel` on visit modal and edit-client modal |
| Modify | `src/components/no-patient-card.tsx` | Expand `SyncContext.useSelector` to include `eventsCollection`; wire `onCancel` |
| Modify | `src/components/program-stage-capture.tsx` | Expand `SyncContext.useSelector` to include `trackedEntitiesCollection` + `enrollmentsCollection`; wire `onCancel` |
| Modify | `src/components/main-event-capture.tsx` | Wire `onCancel` on newborn child modal |

No new files. No machine changes. No schema changes.

---

## Task 1: Add `deleteRecursiveDraftSubtree` to `src/utils/utils.ts`

**Files:**
- Modify: `src/utils/utils.ts`

- [ ] **Step 1: Add collection imports to `utils.ts`**

At the top of `src/utils/utils.ts`, the current imports end around line 19. Add these two lines after the existing `../schemas` import:

```ts
import { createEnrollmentCollection } from "../collections/enrollments";
import { createEventCollection } from "../collections/events";
import { createTrackedEntityCollection } from "../collections/tracked-entities";
```

- [ ] **Step 2: Add `deleteRecursiveDraftSubtree` at the end of `utils.ts`**

Append to the very bottom of `src/utils/utils.ts`:

```ts
/**
 * Recursively deletes all draft descendants of a given event or tracked entity.
 * Deletes children only — does NOT delete the root node itself (caller's responsibility).
 * Uses depth-first order: children are deleted before their parent.
 */
export async function deleteRecursiveDraftSubtree(
    eventId: string | undefined,
    trackedEntityId: string | undefined,
    collections: {
        eventsCollection: ReturnType<typeof createEventCollection>;
        trackedEntitiesCollection: ReturnType<typeof createTrackedEntityCollection>;
        enrollmentsCollection: ReturnType<typeof createEnrollmentCollection>;
    },
): Promise<void> {
    const eventsTable = collections.eventsCollection.utils.getTable();
    const tETable = collections.trackedEntitiesCollection.utils.getTable();
    const enrollmentsTable = collections.enrollmentsCollection.utils.getTable();

    if (eventId) {
        const childEvents = await eventsTable
            .filter(
                (e) =>
                    e.parentEvent === eventId && e.syncStatus === "draft",
            )
            .toArray();
        for (const child of childEvents) {
            await deleteRecursiveDraftSubtree(
                child.event,
                undefined,
                collections,
            );
            const tx = collections.eventsCollection.delete(child.event);
            await tx.isPersisted.promise;
        }
    }

    if (trackedEntityId) {
        const childTEs = await tETable
            .filter(
                (te) =>
                    te.parentEntity === trackedEntityId &&
                    te.syncStatus === "draft",
            )
            .toArray();
        for (const childTE of childTEs) {
            // Delete enrollments for this child TE
            const childEnrollments = await enrollmentsTable
                .where("trackedEntity")
                .equals(childTE.trackedEntity)
                .toArray();
            for (const enrollment of childEnrollments) {
                const tx = collections.enrollmentsCollection.delete(
                    enrollment.enrollment,
                );
                await tx.isPersisted.promise;
            }
            // Delete events for this child TE (recurse into their children first)
            const childEvents = await eventsTable
                .filter(
                    (e) =>
                        e.trackedEntity === childTE.trackedEntity &&
                        e.syncStatus === "draft",
                )
                .toArray();
            for (const event of childEvents) {
                await deleteRecursiveDraftSubtree(
                    event.event,
                    undefined,
                    collections,
                );
                const tx = collections.eventsCollection.delete(event.event);
                await tx.isPersisted.promise;
            }
            // Recurse into child TE's own children, then delete the child TE
            await deleteRecursiveDraftSubtree(
                undefined,
                childTE.trackedEntity,
                collections,
            );
            const tx = collections.trackedEntitiesCollection.delete(
                childTE.trackedEntity,
            );
            await tx.isPersisted.promise;
        }
    }
}
```

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
pnpm build 2>&1 | head -40
```

Expected: build completes (or fails only on pre-existing errors — check that no new errors mention `deleteRecursiveDraftSubtree`).

- [ ] **Step 4: Commit**

```bash
git add src/utils/utils.ts
git commit -m "feat: add deleteRecursiveDraftSubtree utility"
```

---

## Task 2: Add `cancelDataModal` to `src/utils/utils.ts`

**Files:**
- Modify: `src/utils/utils.ts`

- [ ] **Step 1: Append `cancelDataModal` to the bottom of `utils.ts`**

Append directly after `deleteRecursiveDraftSubtree`:

```ts
/**
 * Handles cancel for a DataModal.
 *
 * New record (syncStatus === "draft"):
 *   - Deletes the root record (and its enrollment if it's a TrackedEntity)
 *   - Recursively deletes all draft children
 *
 * Existing record (syncStatus !== "draft"):
 *   - Restores the record to its pre-edit snapshot via insertLocally
 *   - Recursively deletes any draft children created during the session
 *
 * The `data` argument must be the snapshot captured at openModal() time
 * (i.e. the value stored in useModalState's React state).
 */
export async function cancelDataModal(
    data: FlattenedEvent | FlattenedTrackedEntity,
    collections: {
        eventsCollection: ReturnType<typeof createEventCollection>;
        trackedEntitiesCollection: ReturnType<typeof createTrackedEntityCollection>;
        enrollmentsCollection: ReturnType<typeof createEnrollmentCollection>;
    },
): Promise<void> {
    if ("event" in data) {
        // FlattenedEvent branch
        if (data.syncStatus === "draft") {
            const tx = collections.eventsCollection.delete(data.event);
            await tx.isPersisted.promise;
        } else {
            await collections.eventsCollection.utils.insertLocally(data);
        }
        await deleteRecursiveDraftSubtree(data.event, undefined, collections);
    } else if ("trackedEntityType" in data) {
        // FlattenedTrackedEntity branch
        if (data.syncStatus === "draft") {
            const tx = collections.trackedEntitiesCollection.delete(
                data.trackedEntity,
            );
            await tx.isPersisted.promise;
            // Delete the linked enrollment (guard: enrollment may not exist)
            const enrollmentsTable =
                collections.enrollmentsCollection.utils.getTable();
            const enrollment = await enrollmentsTable
                .where("trackedEntity")
                .equals(data.trackedEntity)
                .first();
            if (enrollment) {
                const etx = collections.enrollmentsCollection.delete(
                    enrollment.enrollment,
                );
                await etx.isPersisted.promise;
            }
        } else {
            await collections.trackedEntitiesCollection.utils.insertLocally(
                data,
            );
        }
        await deleteRecursiveDraftSubtree(
            undefined,
            data.trackedEntity,
            collections,
        );
    }
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
pnpm build 2>&1 | head -40
```

Expected: no new errors involving `cancelDataModal`.

- [ ] **Step 3: Commit**

```bash
git add src/utils/utils.ts
git commit -m "feat: add cancelDataModal utility"
```

---

## Task 3: Update `DataModal` with `onCancel` support

**Files:**
- Modify: `src/components/data-modal.tsx`

Current state: Cancel button calls `onClose()` directly; `<Modal onCancel={onClose}>`.

- [ ] **Step 1: Add `onCancel` to the props interface**

In `src/components/data-modal.tsx`, find the `DataModalProps` interface (lines 12–26) and add the new optional prop:

```ts
interface DataModalProps<T extends FlattenedTrackedEntity | FlattenedEvent> {
    open: boolean;
    data: T | null;
    onClose: () => void;
    onCancel?: () => Promise<void>;   // ← add this line
    onSave: (currentInfo: {
        values: Record<string, any>;
        addAnother?: boolean;
    }) => void | Promise<void>;
    enrollment: FlattenedEnrollment | null;
    title?: string;
    children: (form: FormInstance) => React.ReactNode;
    submitButtonText?: string;
    hasAddAnother?: boolean;
    status?: string;
}
```

- [ ] **Step 2: Destructure `onCancel` and add `cancelling` state**

This is a targeted insertion — do NOT replace the entire destructure block. The current signature already destructures `open`, `onClose`, `onSave`, `title`, `children`, `submitButtonText`, `hasAddAnother`, `status`. Note that `data` and `enrollment` are in the interface but are not destructured (they are not used in the component body directly) — do not add or remove them.

Find exactly this line in the function signature:
```ts
    onClose,
```

And change it to:
```ts
    onClose,
    onCancel,
```

Then find the existing line:
```ts
    const [loading, setLoading] = useState(false);
```

And add the `cancelling` state on the next line:
```ts
    const [loading, setLoading] = useState(false);
    const [cancelling, setCancelling] = useState(false);
```

- [ ] **Step 3: Add `handleCancel` after the `handleOk` function**

After the closing `};` of `handleOk` (around line 74), add:

```ts
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

- [ ] **Step 4: Rewire `<Modal onCancel>` and the Cancel button**

Change the `<Modal>` element's `onCancel` prop from `onClose` to `handleCancel`:
```tsx
// Before:
onCancel={onClose}
// After:
onCancel={handleCancel}
```

Change the Cancel `<Button>`'s `onClick` from `onClose()` to `handleCancel()`, and add `loading` and `disabled`:
```tsx
// Before:
<Button
    onClick={() => {
        onClose();
    }}
    style={{
        borderRadius: 8,
        ...(isMobile && { width: "100%" }),
    }}
>
    Cancel
</Button>

// After:
<Button
    onClick={handleCancel}
    loading={cancelling}
    disabled={cancelling || loading}
    style={{
        borderRadius: 8,
        ...(isMobile && { width: "100%" }),
    }}
>
    Cancel
</Button>
```

- [ ] **Step 5: Build to verify no TypeScript errors**

```bash
pnpm build 2>&1 | head -40
```

Expected: no new errors. All existing call sites still compile because `onCancel` is optional.

- [ ] **Step 6: Commit**

```bash
git add src/components/data-modal.tsx
git commit -m "feat: add onCancel prop and cancelling state to DataModal"
```

---

## Task 4: Wire `onCancel` on the visit modal in `tracked-entity.tsx`

**Files:**
- Modify: `src/routes/tracked-entity.tsx`

This is the first `DataModal` in `tracked-entity.tsx` — the visit (event) modal. The `data` variable is a `FlattenedEvent`. It can be either new (syncStatus="draft") or existing.

- [ ] **Step 1: Import `cancelDataModal`**

At the top of `src/routes/tracked-entity.tsx`, find the existing import from `../utils/utils`:
```ts
import { createEmptyEvent } from "../utils/utils";
```

Add `cancelDataModal`:
```ts
import { cancelDataModal, createEmptyEvent } from "../utils/utils";
```

- [ ] **Step 2: Add `onCancel` to the visit DataModal**

Find the first `<DataModal<FlattenedEvent>` (around line 425). It currently has `onClose={() => { closeModal(); }}`. Add `onCancel` alongside it:

```tsx
<DataModal<FlattenedEvent>
    open={isOpen}
    status={currentEvent?.syncStatus}
    data={data}
    onClose={() => {
        closeModal();
    }}
    onCancel={() =>
        cancelDataModal(data!, {
            eventsCollection,
            trackedEntitiesCollection,
            enrollmentsCollection,
        })
    }
    enrollment={enrollment}
    ...
```

- [ ] **Step 3: Build to verify**

```bash
pnpm build 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/tracked-entity.tsx
git commit -m "feat: wire cancel-revert on visit modal in tracked-entity"
```

---

## Task 5: Wire `onCancel` on the edit-client modal in `tracked-entity.tsx`

**Files:**
- Modify: `src/routes/tracked-entity.tsx`

The second `DataModal` in `tracked-entity.tsx` — edits an existing tracked entity. `data` is always an existing record (syncStatus ≠ "draft"), so `cancelDataModal` will restore the snapshot.

- [ ] **Step 1: Add `onCancel` to the edit-client DataModal**

Find the second `<DataModal<FlattenedTrackedEntity>` (around line 569). Add `onCancel`:

```tsx
<DataModal<FlattenedTrackedEntity>
    open={trackedEntityIsOpen}
    data={trackedEntityData}
    onClose={closeTrackedEntityModal}
    onCancel={() =>
        cancelDataModal(trackedEntityData!, {
            eventsCollection,
            trackedEntitiesCollection,
            enrollmentsCollection,
        })
    }
    enrollment={enrollment}
    ...
```

- [ ] **Step 2: Build to verify**

```bash
pnpm build 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/tracked-entity.tsx
git commit -m "feat: wire cancel-revert on edit-client modal in tracked-entity"
```

---

## Task 6: Expand selector and wire `onCancel` in `no-patient-card.tsx`

**Files:**
- Modify: `src/components/no-patient-card.tsx`

Current `SyncContext.useSelector` only extracts `enrollmentsCollection` and `trackedEntitiesCollection`. `eventsCollection` is needed for the recursive child-event cleanup.

- [ ] **Step 1: Expand the `SyncContext.useSelector` call**

Find lines 29–33 in `src/components/no-patient-card.tsx`:
```ts
const { enrollmentsCollection, trackedEntitiesCollection } =
    SyncContext.useSelector((a) => ({
        enrollmentsCollection: a.context.enrollmentsCollection,
        trackedEntitiesCollection: a.context.trackedEntitiesCollection,
    }));
```

Replace with:
```ts
const { enrollmentsCollection, trackedEntitiesCollection, eventsCollection } =
    SyncContext.useSelector((a) => ({
        enrollmentsCollection: a.context.enrollmentsCollection,
        trackedEntitiesCollection: a.context.trackedEntitiesCollection,
        eventsCollection: a.context.eventsCollection,
    }));
```

- [ ] **Step 2: Import `cancelDataModal`**

Find the existing import from `../utils/utils`:
```ts
import {
    createEmptyEnrollment,
    createEmptyTrackedEntity,
} from "../utils/utils";
```

Add `cancelDataModal`:
```ts
import {
    cancelDataModal,
    createEmptyEnrollment,
    createEmptyTrackedEntity,
} from "../utils/utils";
```

- [ ] **Step 3: Add `onCancel` to the DataModal**

Find the `<DataModal<FlattenedTrackedEntity>` (around line 116). Add `onCancel`:

```tsx
<DataModal<FlattenedTrackedEntity>
    open={isOpen}
    data={trackedEntity}
    onClose={closeModal}
    onCancel={() =>
        cancelDataModal(trackedEntity!, {
            eventsCollection,
            trackedEntitiesCollection,
            enrollmentsCollection,
        })
    }
    enrollment={enrollment}
    ...
```

- [ ] **Step 4: Build to verify**

```bash
pnpm build 2>&1 | head -40
```

- [ ] **Step 5: Commit**

```bash
git add src/components/no-patient-card.tsx
git commit -m "feat: wire cancel-revert on register-client modal in no-patient-card"
```

---

## Task 7: Expand selector and wire `onCancel` in `program-stage-capture.tsx`

**Files:**
- Modify: `src/components/program-stage-capture.tsx`

Current `SyncContext.useSelector` (line 56–58) only extracts `eventsCollection`. Need `trackedEntitiesCollection` and `enrollmentsCollection` for the utility.

- [ ] **Step 1: Expand the `SyncContext.useSelector` call**

Find lines 56–58:
```ts
const eventsCollection = SyncContext.useSelector(
    (a) => a.context.eventsCollection,
);
```

Replace with:
```ts
const { eventsCollection, trackedEntitiesCollection, enrollmentsCollection } =
    SyncContext.useSelector((a) => ({
        eventsCollection: a.context.eventsCollection,
        trackedEntitiesCollection: a.context.trackedEntitiesCollection,
        enrollmentsCollection: a.context.enrollmentsCollection,
    }));
```

- [ ] **Step 2: Import `cancelDataModal`**

Find the existing import from `../utils/utils`:
```ts
import { createEmptyEvent } from "../utils/utils";
```

Add `cancelDataModal`:
```ts
import { cancelDataModal, createEmptyEvent } from "../utils/utils";
```

- [ ] **Step 3: Add `onCancel` to the DataModal**

Find the `<DataModal<FlattenedEvent>` (around line 238). Add `onCancel`:

```tsx
<DataModal<FlattenedEvent>
    open={isOpen}
    data={data}
    onClose={closeModal}
    onCancel={() =>
        cancelDataModal(data!, {
            eventsCollection,
            trackedEntitiesCollection,
            enrollmentsCollection,
        })
    }
    enrollment={enrollment}
    ...
```

- [ ] **Step 4: Build to verify**

```bash
pnpm build 2>&1 | head -40
```

- [ ] **Step 5: Commit**

```bash
git add src/components/program-stage-capture.tsx
git commit -m "feat: wire cancel-revert on stage-event modal in program-stage-capture"
```

---

## Task 8: Wire `onCancel` in `main-event-capture.tsx`

**Files:**
- Modify: `src/components/main-event-capture.tsx`

All three collections are already extracted via `SyncContext.useSelector` (lines 156–163). No selector change needed.

- [ ] **Step 1: Import `cancelDataModal`**

Find the existing import from `../utils/utils` (around line 24–31). Add `cancelDataModal`:

```ts
import {
    buildCurrentDataElements,
    cancelDataModal,
    createEmptyEnrollment,
    createEmptyEvent,
    createEmptyTrackedEntity,
    createGetValueProps,
    createNormalize,
} from "../utils/utils";
```

- [ ] **Step 2: Add `onCancel` to the DataModal**

Find the `<DataModal<FlattenedTrackedEntity>` for the newborn child (around line 515). Add `onCancel`:

```tsx
<DataModal<FlattenedTrackedEntity>
    open={childIsOpen}
    data={childData}
    onClose={closeChildModal}
    onCancel={() =>
        cancelDataModal(childData!, {
            eventsCollection,
            trackedEntitiesCollection,
            enrollmentsCollection,
        })
    }
    hasAddAnother={true}
    enrollment={childEnrollment}
    ...
```

- [ ] **Step 3: Build to verify**

```bash
pnpm build 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add src/components/main-event-capture.tsx
git commit -m "feat: wire cancel-revert on newborn-child modal in main-event-capture"
```

---

## Final verification checklist

- [ ] Open a new visit for an existing client, edit fields, click Cancel → record should revert to original values in the visit list
- [ ] Create a new visit ("Add new visit"), fill some fields, click Cancel → the draft event should disappear from the visit list
- [ ] Create a new visit that triggers a newborn child, then cancel the visit → child tracked entity and enrollment should be gone
- [ ] Register a new client, fill partial details, click Cancel → client should not appear in the client list
- [ ] Open a stage event (e.g. TB medications), edit, click Cancel → event should revert
- [ ] Press ESC or click X on any modal → same revert behaviour as Cancel button
