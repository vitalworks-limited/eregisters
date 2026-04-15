# Modal Performance Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the freeze before all modals appear by deferring heavy child rendering until after the modal shell is visible.

**Architecture:** Add a `contentReady` boolean state to `DataModal`. When `open` becomes `true`, render a spinner immediately, then use `requestAnimationFrame` to flip `contentReady` to `true` and render the actual children. This keeps `destroyOnHidden={true}` intact so the form is always fresh.

**Tech Stack:** React 18, Ant Design 5, TypeScript

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Modify | `src/components/data-modal.tsx` | Add `contentReady` state + `useEffect` + conditional body render |

No other files change. All six callsites are untouched.

---

### Task 1: Add deferred content rendering to `DataModal`

**Files:**
- Modify: `src/components/data-modal.tsx`

- [ ] **Step 1: Open the file and confirm current imports**

Read `src/components/data-modal.tsx`. Verify that `Spin` is NOT in the `antd` import on line 3. Current import is:
```ts
import { Button, Flex, Form, Grid, Modal, Typography } from "antd";
```

- [ ] **Step 2: Add `Spin` to the antd import and `useEffect` to the React import**

In `src/components/data-modal.tsx`, update line 1 and line 3:

```ts
import React, { useEffect } from "react";
```

```ts
import { Button, Flex, Form, Grid, Modal, Spin, Typography } from "antd";
```

- [ ] **Step 3: Add `contentReady` state and `useEffect` inside `DataModal`**

After the existing `const [loading, setLoading] = React.useState(false);` line (line 43), add:

```ts
const [contentReady, setContentReady] = useState(false);

useEffect(() => {
    if (open) {
        // Defensive: reset before scheduling RAF. With destroyOnHidden=true this
        // is a no-op (component remounts fresh), but guards if that ever changes.
        setContentReady(false);
        const raf = requestAnimationFrame(() => setContentReady(true));
        return () => cancelAnimationFrame(raf); // cancel if open flips back before RAF fires
    } else {
        // Defensive reset: keeps correctness if destroyOnHidden is ever removed.
        // No cleanup needed — no pending RAF to cancel in this branch.
        setContentReady(false);
    }
}, [open]);
```

Note: `useState` is already available via `React.useState` — either use `React.useState` or add `useState` to the React import. Since we're already updating the React import for `useEffect`, add `useState` there too:

```ts
import React, { useEffect, useState } from "react";
```

- [ ] **Step 4: Replace the modal body render with conditional spinner/content**

In the `Modal` JSX, the current body content is `{children(form)}` (line 184). Replace it with:

```tsx
{contentReady
    ? children(form)
    : (
        <Flex justify="center" align="center" style={{ padding: 40 }}>
            <Spin size="large" />
        </Flex>
    )
}
```

- [ ] **Step 5: Verify the final file looks correct**

Read `src/components/data-modal.tsx` and confirm:
1. `Spin` is in the antd import
2. `useEffect` and `useState` are in the React import
3. `contentReady` state and `useEffect` are present inside the component body
4. The modal body renders `<Spin>` when `!contentReady` and `children(form)` when `contentReady`

- [ ] **Step 6: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are errors, they will be in `data-modal.tsx` — fix them before proceeding.

- [ ] **Step 7: Manually test the fix**

Start the dev server:
```bash
npm run dev
```

Open the app in a browser. Navigate to a tracked entity. Click "Add new visit" or "Edit" on any row.

Expected behaviour:
- The modal shell (title bar + footer buttons) appears **immediately** with a spinner in the body
- The form fields appear a moment later (imperceptibly fast on a dev machine)
- There is no freeze before the modal is visible

Also test:
- Saving the form works as before
- Closing the modal and reopening gives a fresh empty form (not pre-filled from previous open)
- The "Edit Client" modal (tracked entity edit) and the program stage capture modals all behave the same way

- [ ] **Step 8: Commit**

```bash
git add src/components/data-modal.tsx
git commit -m "fix: defer DataModal content render to eliminate open-freeze"
```
