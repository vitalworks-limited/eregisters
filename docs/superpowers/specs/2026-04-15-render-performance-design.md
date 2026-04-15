# Render Performance Optimisation — Design Spec

**Date:** 2026-04-15  
**Status:** Approved

## Problem

Three compounding issues cause render lag when typing in form fields and when switching tabs inside the visit modal.

**1. `createChild` is unstable**

`createChild` in `src/components/main-event-capture.tsx` is a plain `async` function defined in the component body. Its reference changes on every render. `onFieldChange` calls `createChild`, so `onFieldChange` cannot be stabilised until `createChild` is.

**2. `onFieldChange` is unstable**

`onFieldChange` is also a plain `async` function. Its reference changes on every render, meaning any child that receives it as a prop cannot bail out of re-renders via `React.memo`.

**3. `tabItems` is rebuilt on every render**

An IIFE at line 346 of `main-event-capture.tsx` runs unconditionally on every render. It sorts all program stages, calls `buildCurrentDataElements()` for each stage, and constructs all tab and section JSX. `MainEventCapture` subscribes to several `Form.useWatch` values (`weightForAge`, `bmi`, `bmiForAge`, `services`, `ageAtVisit`). When any of these change, `MainEventCapture` re-renders and the IIFE rebuilds the full tab structure — even though those field values do not affect which tabs or sections are shown.

**4. `DataElementRenderer` is not memoized**

`DataElementField` (the leaf) is wrapped in `React.memo`, but `DataElementRenderer` is not. Parent re-renders from `Form.useWatch` cause all `DataElementRenderer` instances to re-render, even when their specific inputs have not changed.

## What Is Not a Problem

`ruleResult` is passed as a prop to `DataElementRenderer` from four callsites across four files (`main-event-capture.tsx`, `program-stage-form.tsx`, `basic-form.tsx`, `tracker-registration.tsx`). The `tracker-registration.tsx` callsite reads `ruleResult` from `TrackedEntityContext`, not `EventContext`. Any solution that moves `ruleResult` reading into `DataElementRenderer` via context must account for this difference. To avoid this complexity, `ruleResult` remains a prop in this design — the performance gain from the other three changes is meaningful without touching the prop interface.

## Solution

Four changes applied in dependency order, touching two files only.

### Change 1 — Stabilise `createChild` with `useCallback`

In `src/components/main-event-capture.tsx`, wrap `createChild` in `useCallback`:

```ts
const createChild = useCallback(async () => {
    // existing body unchanged
}, [trackedEntity, form, trackedEntitiesCollection, enrollmentsCollection, openChildModal]);
```

This must happen before Change 2, since `onFieldChange` closes over `createChild`.

### Change 2 — Stabilise `onFieldChange` with `useCallback`

Wrap `onFieldChange` in `useCallback`:

```ts
const onFieldChange = useCallback(async (dataElement: string, value: any) => {
    // existing body unchanged
}, [eventActor, form, createChild]);
```

### Change 3 — Memoize `tabItems` with `useMemo`

Replace the IIFE with a `useMemo`:

```ts
const tabItems = useMemo(() => {
    // existing IIFE body, unchanged
}, [ruleResult, services, isMobile, onFieldChange, program, trackedEntity, mainEvent, enrollment]);
```

The full `ruleResult` object is a dep because it is passed as a prop to `DataElementRenderer` children inside the memo. This means tab rebuilds still occur when `ruleResult` changes (i.e. when program rules fire after a field edit). The benefit is narrower but real: `Form.useWatch` re-renders of `MainEventCapture` that occur before the XState actor has transitioned (and before `ruleResult` has changed) will not rebuild `tabItems`. These happen because React processes the `Form.useWatch` state update synchronously, before the `useEffect` that sends `FIELD_CHANGED` to the actor. This eliminates one of the two rebuild passes per field edit.

### Change 4 — Wrap `DataElementRenderer` with `React.memo`

In `src/components/data-element-renderer.tsx`, wrap the export:

```ts
export const DataElementRenderer = React.memo(({ ... }) => {
    // existing body unchanged
});
```

Default shallow comparison is sufficient. Since `onFieldChange` is now stable (Change 2), the `DataElementRenderer` memo can bail out of re-renders caused by parent re-renders where `ruleResult` and all other props are unchanged — specifically the `Form.useWatch` re-renders described in Change 3. When `ruleResult` is genuinely new (program rules fired), all `DataElementRenderer` instances re-render as before, which is correct.

## Affected Files

| File | Changes |
|------|---------|
| `src/components/main-event-capture.tsx` | `useCallback` for `createChild` (Change 1); `useCallback` for `onFieldChange` (Change 2); `useMemo` for `tabItems` (Change 3) |
| `src/components/data-element-renderer.tsx` | Wrap export with `React.memo` (Change 4) |

No prop interface changes. No callsite changes. No other files touched.

## Order of Changes

1. `createChild` → `useCallback` (Change 1)
2. `onFieldChange` → `useCallback` (Change 2, depends on stable `createChild`)
3. `tabItems` → `useMemo` (Change 3, requires stable `onFieldChange` in deps)
4. `React.memo` on `DataElementRenderer` (Change 4, meaningful only after Change 2 stabilises `onFieldChange` prop)

## Trade-offs

- `useMemo` deps must be kept accurate. If new values are added to the tab-building logic, they must be added to the deps array or tabs will show stale content.
- When `ruleResult` changes (after every field edit that fires a program rule), `tabItems` rebuilds and all `DataElementRenderer` instances re-render. `React.memo` cannot bail out in this case because `ruleResult` is a new object reference. This is correct behaviour — fields must reflect updated rule results.
- The performance gain is specifically for field edits that trigger `Form.useWatch` re-renders before the XState transition completes. On fast devices this gap is small; on slow devices the gap (and thus the saving) is larger.
- `ruleResult` referential stability is upstream of this design. If the XState actor always creates a new `ruleResult` object on every transition (even when rules produce identical output), `tabItems` will always rebuild on field edits. This is acceptable; the spec does not require the actor to optimise `ruleResult` identity.
