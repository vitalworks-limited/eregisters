# Render Performance Optimisation — Design Spec

**Date:** 2026-04-15  
**Status:** Approved

## Problem

Two compounding render performance issues cause noticeable lag when typing in form fields and when switching tabs inside the visit modal:

**1. `onFieldChange` is unstable in `MainEventCapture`**

`onFieldChange` is defined as a plain `async` function in the component body (`src/components/main-event-capture.tsx`). Its reference changes on every render. Any child that receives it as a prop cannot bail out via `React.memo` because the prop reference is always new — defeating memoization downstream.

**2. `tabItems` is rebuilt on every render in `MainEventCapture`**

An IIFE at line 346 runs unconditionally on every render. It sorts all program stages, calls `buildCurrentDataElements()` for each stage, and constructs all tab/section JSX including `DataElementRenderer` and `ProgramStageCapture` instances. Any state change — including a single field edit — triggers a full rebuild of the entire tab structure.

**3. `DataElementRenderer` is not memoized**

`DataElementField` (the leaf component) is wrapped in `React.memo`, but `DataElementRenderer` is not. With 50+ fields visible at once, every `ruleResult` update causes all of them to re-render and re-run their option filtering, message filtering, and hidden-field logic — even for fields whose rule result slice did not change.

## Solution

Three targeted changes, applied in dependency order:

### Change 1 — Stabilise `onFieldChange` with `useCallback`

In `src/components/main-event-capture.tsx`, wrap `onFieldChange` in `useCallback`:

```ts
const onFieldChange = useCallback(async (dataElement: string, value: any) => {
    // existing body unchanged
}, [eventActor, form, trackedEntity.trackedEntity, mainEvent.event]);
```

This makes the reference stable across renders where those deps haven't changed — which is the case for all renders triggered by `ruleResult` updates from field edits.

### Change 2 — Memoize `tabItems` with `useMemo`

Replace the IIFE that builds tab items with a `useMemo`. The deps are the values that legitimately require a tab rebuild:

```ts
const tabItems = useMemo(() => {
    // existing IIFE body, unchanged
}, [ruleResult.hiddenSections, services, isMobile, onFieldChange, program, trackedEntity, mainEvent, enrollment]);
```

Tab structure only rebuilds when:
- Sections are hidden/shown by program rules (`ruleResult.hiddenSections`)
- The service type selection changes (`services`) — controls which stages appear
- Layout changes between mobile and desktop (`isMobile`)
- The underlying data changes (`program`, `trackedEntity`, `mainEvent`, `enrollment`)

Normal field edits that don't affect section visibility will not trigger a tab rebuild.

### Change 3 — Memoize `DataElementRenderer` with `React.memo`

In `src/components/data-element-renderer.tsx`, wrap the component export with `React.memo`:

```ts
export const DataElementRenderer = React.memo(({ ... }) => {
    // existing body unchanged
});
```

The default shallow comparison is sufficient. Since `onFieldChange` is now stable (Change 1) and all other props (`ruleResult`, `currentDataElements`, `sectionLength`, `form`) are either stable references or change only when the field genuinely needs updating, `DataElementRenderer` will skip re-renders for fields unaffected by a given rule result change.

## Affected Files

| File | Change |
|------|--------|
| `src/components/main-event-capture.tsx` | `useCallback` for `onFieldChange`; `useMemo` for `tabItems` |
| `src/components/data-element-renderer.tsx` | Wrap export with `React.memo` |

## What Does Not Change

- The logic inside `onFieldChange` is unchanged
- The tab structure logic (stage ordering, section filtering, hidden section handling) is unchanged
- `DataElementField` (already memoized) is unchanged
- All callsites of `DataElementRenderer` and `MainEventCapture` are unchanged
- `ProgramStageForm` (which also renders `DataElementRenderer`) is unchanged — it gets the memo benefit automatically

## Order of Changes

Changes must be applied in order: Change 1 → Change 2 → Change 3. Change 2 depends on `onFieldChange` being stable (Change 1), and Change 3 depends on `onFieldChange` being stable when passed as a prop (also Change 1).

## Trade-offs

- `useMemo` deps must be kept accurate. If a new value is added to the tab-building logic in the future, it must be added to the deps array or tabs will show stale content. The existing ESLint exhaustive-deps rule (if configured) will catch this.
- The default shallow comparison in `React.memo` compares props by reference. `ruleResult` is passed as the whole object — if the XState actor creates a new `ruleResult` object on every transition (even unchanged content), `DataElementRenderer` will still re-render. This is acceptable: the actor only transitions on `FIELD_CHANGED`, so re-renders are at most one per field edit, not continuous.
