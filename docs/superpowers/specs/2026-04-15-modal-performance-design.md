# Modal Performance Fix — Design Spec

**Date:** 2026-04-15  
**Status:** Approved

## Problem

All modals in the app have a noticeable freeze before they appear. The root cause is `destroyOnHidden={true}` on the Ant Design `Modal` in `DataModal`. When `open` becomes `true`, React synchronously renders all children — including cold-starting XState actors (`EventContext.Provider`, `TrackedEntityContext.Provider`), evaluating program rules, and mounting potentially 50+ `DataElementRenderer` components — before the modal can paint. The main thread is blocked until rendering is complete, so the user sees nothing until the full form is ready.

## Solution

Introduce a two-phase render inside `DataModal` using a `contentReady` boolean state and `requestAnimationFrame`.

### Phase 1 — Modal shell (immediate)

When `open` becomes `true`, `contentReady` is `false`. The modal renders its shell (title, footer buttons) with a centered `<Spin />` in the body. React commits this to the DOM and the modal animates open — visible to the user immediately.

### Phase 2 — Content (deferred, next frame)

A `requestAnimationFrame` scheduled at the same time `open` becomes `true` sets `contentReady = true`. React then renders `children(form)` inside the already-visible modal. The spinner disappears and the form content appears.

### Reset on close

When `open` becomes `false`, `contentReady` is reset to `false` so the next open starts fresh with the spinner again.

## Affected File

- `src/components/data-modal.tsx` — only file changed

## What Does Not Change

- `destroyOnHidden={true}` stays in place — form is always destroyed on close and rebuilt fresh on open
- All prop signatures are unchanged
- All three callsites are untouched:
  - `src/routes/tracked-entity.tsx` (two `DataModal` instances)
  - `src/components/program-stage-capture.tsx`
  - `src/components/main-event-capture.tsx`

## Implementation Detail

```tsx
const [contentReady, setContentReady] = useState(false);

useEffect(() => {
  if (open) {
    setContentReady(false);
    const raf = requestAnimationFrame(() => setContentReady(true));
    return () => cancelAnimationFrame(raf);
  } else {
    setContentReady(false);
  }
}, [open]);
```

In the modal body:

```tsx
{contentReady ? children(form) : <Flex justify="center" style={{ padding: 40 }}><Spin /></Flex>}
```

## Trade-offs

- The user sees a spinner for one frame (~16ms) before the form appears. This is imperceptible in practice and far preferable to a multi-hundred-millisecond freeze before the modal is visible at all.
- No architectural changes, no new dependencies.
