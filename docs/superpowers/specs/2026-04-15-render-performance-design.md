# Render Performance Optimisation — Design Spec

**Date:** 2026-04-15  
**Status:** Approved

## Problem

Two compounding render performance issues cause noticeable lag when typing in form fields and when switching tabs inside the visit modal.

**1. `createChild` and `onFieldChange` are unstable in `MainEventCapture`**

`onFieldChange` is defined as a plain `async` function in the component body (`src/components/main-event-capture.tsx`). Its reference changes on every render. It calls `createChild`, which also has an unstable reference and closes over `trackedEntity`, `form`, `trackedEntitiesCollection`, `enrollmentsCollection`, and `openChildModal`. Any child that receives `onFieldChange` as a prop cannot bail out via `React.memo` because the prop reference is always new.

**2. `tabItems` is rebuilt on every render in `MainEventCapture`**

An IIFE at line 346 runs unconditionally on every render. It sorts all program stages, calls `buildCurrentDataElements()` for each stage, and constructs all tab and section JSX. Any state change — including a single field edit — triggers a full rebuild of the entire tab structure.

**3. `DataElementRenderer` is not memoized**

`DataElementField` (the leaf) is wrapped in `React.memo`, but `DataElementRenderer` is not. With 50+ fields visible at once, every `ruleResult` update causes all of them to re-render — running option filtering, message filtering, and hidden-field logic — even for fields whose rule result did not change.

**Root cause of the useMemo problem**

`tabItems` cannot be memoized with a narrow dep on `ruleResult.hiddenSections` alone, because `ruleResult` is currently threaded into every `DataElementRenderer` as a prop. If `ruleResult` is a dep, `tabItems` rebuilds on every field edit — no benefit. The fix is to remove `ruleResult` from `DataElementRenderer`'s props entirely and have it read `ruleResult` directly from `EventContext`. This decouples tab structure from rule result changes, so `tabItems` only needs to rebuild when sections actually show or hide.

## Solution

Five changes applied in dependency order across three files.

### Change 1 — Stabilise `createChild` with `useCallback`

In `src/components/main-event-capture.tsx`, wrap `createChild` in `useCallback`:

```ts
const createChild = useCallback(async () => {
    // existing body unchanged
}, [trackedEntity, form, trackedEntitiesCollection, enrollmentsCollection, openChildModal]);
```

This must happen before Change 2, since `onFieldChange` calls `createChild`.

### Change 2 — Stabilise `onFieldChange` with `useCallback`

Wrap `onFieldChange` in `useCallback` with deps that reflect its actual closure:

```ts
const onFieldChange = useCallback(async (dataElement: string, value: any) => {
    // existing body unchanged
}, [eventActor, form, createChild]);
```

### Change 3 — Move `ruleResult` into `DataElementRenderer` via context

In `src/components/data-element-renderer.tsx`:

- Remove `ruleResult` from the `DataElementRendererProps` interface
- Remove the `ruleResult` parameter from the destructuring
- Add an internal read from `EventContext`:

```ts
const ruleResult = EventContext.useSelector((state) => state.context.ruleResult);
```

All existing uses of `ruleResult` inside the component body remain unchanged.

Remove the `ruleResult` prop from all `DataElementRenderer` callsites:
- `src/components/main-event-capture.tsx` — inline usages in the IIFE
- `src/components/program-stage-form.tsx` — field render loop

Both callsites are always rendered inside an `EventContext.Provider`, so the context read is safe.

### Change 4 — Memoize `tabItems` with `useMemo`

Replace the IIFE in `src/components/main-event-capture.tsx` with a `useMemo`:

```ts
const tabItems = useMemo(() => {
    // existing IIFE body, unchanged
}, [ruleResult.hiddenSections, services, isMobile, onFieldChange, program, trackedEntity, mainEvent, enrollment]);
```

Because `ruleResult` is no longer passed as a prop to `DataElementRenderer` children inside the memo, `ruleResult` itself is not a dep. Only `ruleResult.hiddenSections` is needed — it controls which sections are included in the tab structure. Normal field edits that do not hide or show sections will not trigger a tab rebuild.

### Change 5 — Wrap `DataElementRenderer` with `React.memo`

In `src/components/data-element-renderer.tsx`, wrap the export:

```ts
export const DataElementRenderer = React.memo(({ ... }) => {
    // existing body unchanged
});
```

The default shallow comparison is sufficient. Since `onFieldChange` is now stable (Change 2) and `ruleResult` is no longer a prop (Change 3), the only props that change between renders are those that genuinely require a field update. `React.memo` prevents re-renders of `DataElementRenderer` instances caused by parent re-renders unrelated to a specific field (e.g. `services` state change, `isMobile` flip).

Note: `ruleResult` context subscriptions inside `DataElementRenderer` (Change 3) still trigger re-renders when `ruleResult` changes — `React.memo` does not block context-driven re-renders. This is correct behaviour: fields must update when program rules change.

## Affected Files

| File | Changes |
|------|---------|
| `src/components/main-event-capture.tsx` | `useCallback` for `createChild` (Change 1); `useCallback` for `onFieldChange` (Change 2); remove `ruleResult` prop from `DataElementRenderer` calls (Change 3); `useMemo` for `tabItems` (Change 4) |
| `src/components/data-element-renderer.tsx` | Remove `ruleResult` from props; add `EventContext.useSelector` (Change 3); wrap with `React.memo` (Change 5) |
| `src/components/program-stage-form.tsx` | Remove `ruleResult` prop from `DataElementRenderer` calls (Change 3) |

## Order of Changes

Changes must be applied in order:

1. `createChild` → `useCallback` (Change 1)
2. `onFieldChange` → `useCallback` (Change 2, depends on stable `createChild`)
3. `ruleResult` moved to context in `DataElementRenderer` + callsites updated (Change 3)
4. `tabItems` → `useMemo` (Change 4, requires stable `onFieldChange` and no `ruleResult` prop in children)
5. `React.memo` on `DataElementRenderer` (Change 5, meaningful only after Changes 2 and 3 stabilise props)

## Trade-offs

- `useMemo` deps must be kept accurate. If new values are added to the tab-building logic, they must be added to the deps array or tabs will show stale content.
- Moving `ruleResult` into `DataElementRenderer` via context couples it to `EventContext`. All `DataElementRenderer` callsites must be inside an `EventContext.Provider` — this is currently true and must remain true.
- `DataElementRenderer` will still re-render on every `ruleResult` change (via context subscription). The performance gain is that this re-render is triggered directly by the context, not cascaded through parent re-renders and `tabItems` rebuilds.
