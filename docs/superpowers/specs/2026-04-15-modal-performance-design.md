# Modal Performance Fix — Design Spec

**Date:** 2026-04-15  
**Status:** Approved

## Problem

All modals in the app have a noticeable freeze before they appear. The root cause is `destroyOnHidden={true}` on the Ant Design `Modal` in `DataModal`. When `open` becomes `true`, React synchronously renders all children — including cold-starting XState actors (`EventContext.Provider`, `TrackedEntityContext.Provider`), evaluating program rules, and mounting potentially 50+ `DataElementRenderer` components — before the modal can paint. The main thread is blocked until rendering is complete, so the user sees nothing until the full form is ready.

## Solution

Introduce a two-phase render inside `DataModal` using a `contentReady` boolean state and `requestAnimationFrame`.

### Phase 1 — Modal shell (immediate)

When `open` becomes `true`, `contentReady` is `false`. The modal renders its shell (title, footer buttons) with a centered `<Spin />` in the body. React commits this to the DOM — in the vast majority of cases the browser paints this before the heavy content renders, giving the user immediate visual feedback. Note: React 18's scheduler does not guarantee a paint between commit phases, so this is a reliable improvement in practice rather than a hard guarantee under all conditions.

### Phase 2 — Content (deferred)

A `requestAnimationFrame` scheduled when `open` becomes `true` sets `contentReady = true`. React then renders `children(form)` inside the already-visible modal. The spinner disappears and the form content appears. On slow devices the spinner may be visible for more than one frame (~16ms), but this is still far preferable to a frozen UI with no feedback.

### Reset on close

When `open` becomes `false`, `contentReady` is reset to `false`. Because `destroyOnHidden={true}` is kept, the component is actually unmounted on close so `contentReady` will always start as `false` on the next mount. The explicit reset in the `else` branch of the `useEffect` is a defensive guard: if `destroyOnHidden` is ever changed to `false` in the future, the reset still works correctly. These two pieces are intentionally coupled — changing one without the other would break the fresh-form guarantee.

## Affected File

- `src/components/data-modal.tsx` — only file changed

## What Does Not Change

- `destroyOnHidden={true}` stays in place — form is always destroyed on close and rebuilt fresh on open
- All prop signatures are unchanged
- All six `DataModal` instances across five files are untouched:
  - `src/routes/tracked-entity.tsx` — two instances (event modal, tracked-entity edit modal)
  - `src/routes/tracked-entities.index.tsx` — one instance
  - `src/components/program-stage-capture.tsx` — one instance
  - `src/components/main-event-capture.tsx` — one instance (newborn child modal)
  - `src/components/no-patient-card.tsx` — one instance

## Implementation Detail

Add `Spin` to the existing `antd` import in `data-modal.tsx`.

Add the deferred content state:

```tsx
const [contentReady, setContentReady] = useState(false);

useEffect(() => {
  if (open) {
    // Defensive: reset to false before scheduling RAF. With destroyOnHidden=true
    // this is always a no-op (component remounts fresh), but guards correctness
    // if destroyOnHidden is ever removed.
    setContentReady(false);
    const raf = requestAnimationFrame(() => setContentReady(true));
    return () => cancelAnimationFrame(raf); // cancel if open flips back to false before RAF fires
  } else {
    // Defensive reset: keeps correctness if destroyOnHidden is ever removed.
    // No cleanup needed — there is no pending RAF to cancel in this branch.
    setContentReady(false);
  }
}, [open]);
```

In the modal body, replace `{children(form)}` with:

```tsx
{contentReady
  ? children(form)
  : <Flex justify="center" style={{ padding: 40 }}><Spin /></Flex>
}
```

## Trade-offs

- The user sees a loading spinner before the form appears. On fast devices this is imperceptible (~16ms); on slow or CPU-throttled devices (relevant for an offline health tool in low-resource settings) it may be a few frames, but it is far preferable to a multi-hundred-millisecond freeze before the modal is visible at all.
- No architectural changes, no new dependencies.
