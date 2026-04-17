# Render Performance Optimisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate unnecessary re-renders during form field edits by stabilising callback references and memoizing the expensive tab structure computation.

**Architecture:** Wrap `createChild` and `onFieldChange` in `useCallback` so their references are stable across renders. Replace the tabItems IIFE with `useMemo` so the tab structure only rebuilds when its actual inputs change. Wrap `DataElementRenderer` with `React.memo` so it can skip re-renders when its props haven't changed.

**Tech Stack:** React 18, Ant Design 5, XState v5, TypeScript

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `src/components/main-event-capture.tsx` | Add `useCallback` import; wrap `createChild` and `onFieldChange`; replace IIFE with `useMemo` |
| Modify | `src/components/data-element-renderer.tsx` | Wrap export with `React.memo` |

No other files change. No prop interface changes. No callsite changes.

---

### Task 1: Stabilise callbacks and memoize tabItems in `MainEventCapture`

**Files:**
- Modify: `src/components/main-event-capture.tsx`

- [ ] **Step 1: Read the file to confirm current state**

Read `src/components/main-event-capture.tsx`. Confirm:
- Line 15: `import React, { useEffect, useMemo, useState } from "react";` — `useCallback` is NOT yet imported
- Line 200: `const createChild = async () => {` — plain function, not `useCallback`
- Line 209: `const onFieldChange = async (dataElement: string, value: any) => {` — plain function, not `useCallback`
- Lines 346–501: The IIFE `{(() => { const tabItems = ...; return isMobile ? ... : ...; })()}` is present

- [ ] **Step 2: Add `useCallback` to the React import**

Change line 15 from:
```ts
import React, { useEffect, useMemo, useState } from "react";
```
to:
```ts
import React, { useCallback, useEffect, useMemo, useState } from "react";
```

- [ ] **Step 3: Wrap `createChild` with `useCallback`**

Replace the current `createChild` function (lines 200–208):
```ts
const createChild = async () => {
    const { client, enrollment } = createPatientAndLink(
        trackedEntity,
        form.getFieldsValue(),
    );
    await trackedEntitiesCollection.utils.insertLocally(client);
    await enrollmentsCollection.utils.insertLocally(enrollment);
    openChildModal(client, enrollment);
};
```

With:
```ts
const createChild = useCallback(async () => {
    const { client, enrollment } = createPatientAndLink(
        trackedEntity,
        form.getFieldsValue(),
    );
    await trackedEntitiesCollection.utils.insertLocally(client);
    await enrollmentsCollection.utils.insertLocally(enrollment);
    openChildModal(client, enrollment);
}, [trackedEntity, form, trackedEntitiesCollection, enrollmentsCollection, openChildModal]);
```

- [ ] **Step 4: Wrap `onFieldChange` with `useCallback`**

Replace the current `onFieldChange` function (lines 209–223):
```ts
const onFieldChange = async (dataElement: string, value: any) => {
    eventActor.send({
        type: "FIELD_CHANGED",
        formData: {
            ...form.getFieldsValue(),
            [dataElement]: value,
        },
    });

    if (dataElement) {
        if (dataElement === "REWqohCg4Km" && value === "Yes") {
            await createChild();
        }
    }
};
```

With:
```ts
const onFieldChange = useCallback(async (dataElement: string, value: any) => {
    eventActor.send({
        type: "FIELD_CHANGED",
        formData: {
            ...form.getFieldsValue(),
            [dataElement]: value,
        },
    });

    if (dataElement) {
        if (dataElement === "REWqohCg4Km" && value === "Yes") {
            await createChild();
        }
    }
}, [eventActor, form, createChild]);
```

- [ ] **Step 5: Replace the tabItems IIFE with `useMemo`**

The current code in the JSX (starting around line 346) looks like:

```tsx
{(() => {
    const tabItems = orderBy(
        program.programStages.map((a) => ({
            ...a,
            sortOrder: stages.get(a.id),
        })),
        "sortOrder",
        "asc",
    ).flatMap((stage) => {
        // ... lots of logic building tab items ...
    });

    return isMobile ? (
        <Collapse
            accordion
            activeKey={activeKey}
            onChange={(key) =>
                setActiveKey(Array.isArray(key) ? key[0] : key)
            }
            items={tabItems}
        />
    ) : (
        <Tabs
            tabPlacement="start"
            items={tabItems}
            tabBarStyle={{
                background: "#fff",
                borderRadius: 0,
            }}
            styles={{
                content: {
                    maxHeight: "63vh",
                    overflow: "auto",
                    padding: 0,
                    margin: 0,
                    borderRadius: 0,
                    marginLeft: 8,
                },
                header: {
                    maxHeight: "63vh",
                    overflow: "auto",
                },
            }}
            onChange={setActiveKey}
            activeKey={activeKey}
        />
    );
})()}
```

Replace this entire `{(() => { ... })()}` expression with two things:

**Before the `return` statement of the component** (after the `serviceTypes` state and `useEffect` block, before the JSX `return`), add:

```ts
const tabItems = useMemo(() => orderBy(
    program.programStages.map((a) => ({
        ...a,
        sortOrder: stages.get(a.id),
    })),
    "sortOrder",
    "asc",
).flatMap((stage) => {
    const currentDataElements = buildCurrentDataElements(stage);
    if (
        stage.id === "opwSN351xGC" &&
        services &&
        String(services)
            .split(",")
            .some((a) =>
                [
                    "TB",
                    "DR-TB",
                    "Leprosy",
                    "ART",
                    "HTS",
                ].includes(a),
            )
    ) {
        return {
            key: stage.id,
            label: stage.name,
            children: (
                <ProgramStageCapture
                    programStage={stage}
                    trackedEntity={trackedEntity}
                    mainEvent={mainEvent}
                    enrollment={enrollment}
                />
            ),
        };
    } else if (stage.id === "opwSN351xGC") {
        return [];
    }
    if (["zKGWob5AZKP", "DA0Yt3V16AN"].includes(stage.id)) {
        return {
            key: stage.id,
            label: stage.name,
            children: (
                <ProgramStageCapture
                    programStage={stage}
                    trackedEntity={trackedEntity}
                    mainEvent={mainEvent}
                    enrollment={enrollment}
                />
            ),
        };
    }
    return orderBy(
        stage.programStageSections,
        ["sortOrder"],
        ["asc"],
    ).flatMap((section) => {
        if (
            ruleResult &&
            ruleResult.hiddenSections.includes(section.id)
        )
            return [];
        return [
            {
                key: `${stage.id}-${section.id}`,
                label: section.displayName || section.name,
                children: (
                    <Card>
                        <Row gutter={[16, 0]}>
                            {section.dataElements.flatMap(
                                (dataElement) => {
                                    if (
                                        dataElement.id ===
                                        "mrKZWf2WMIC"
                                    )
                                        return [];
                                    return (
                                        <DataElementRenderer
                                            key={dataElement.id}
                                            dataElementId={
                                                dataElement.id
                                            }
                                            currentDataElements={
                                                currentDataElements
                                            }
                                            ruleResult={
                                                ruleResult
                                            }
                                            sectionLength={
                                                section
                                                    .dataElements
                                                    .length
                                            }
                                            form={form}
                                            onFieldChange={
                                                onFieldChange
                                            }
                                        />
                                    );
                                },
                            )}
                        </Row>
                        {["Maternity", "Postnatal"].includes(
                            section.name,
                        ) && (
                            <RelationshipEvent
                                section={section.name}
                                trackedEntity={trackedEntity}
                                mainEvent={mainEvent}
                            />
                        )}
                    </Card>
                ),
            },
        ];
    });
}), [ruleResult, services, isMobile, onFieldChange, program, trackedEntity, mainEvent, enrollment, form, activeKey]);
```

**In the JSX where the IIFE was**, replace with:

```tsx
{isMobile ? (
    <Collapse
        accordion
        activeKey={activeKey}
        onChange={(key) =>
            setActiveKey(Array.isArray(key) ? key[0] : key)
        }
        items={tabItems}
    />
) : (
    <Tabs
        tabPlacement="start"
        items={tabItems}
        tabBarStyle={{
            background: "#fff",
            borderRadius: 0,
        }}
        styles={{
            content: {
                maxHeight: "63vh",
                overflow: "auto",
                padding: 0,
                margin: 0,
                borderRadius: 0,
                marginLeft: 8,
            },
            header: {
                maxHeight: "63vh",
                overflow: "auto",
            },
        }}
        onChange={setActiveKey}
        activeKey={activeKey}
    />
)}
```

- [ ] **Step 6: Verify TypeScript compiles with no new errors**

```bash
cd /Users/carapai/projects/eregisters && npx tsc --noEmit 2>&1
```

Expected: same 4 pre-existing errors in `src/utils/utils.ts`, zero new errors. If new errors appear, fix them before proceeding.

- [ ] **Step 7: Commit**

```bash
git add src/components/main-event-capture.tsx
git commit -m "perf: stabilise createChild/onFieldChange and memoize tabItems"
```

---

### Task 2: Wrap `DataElementRenderer` with `React.memo`

**Files:**
- Modify: `src/components/data-element-renderer.tsx`

- [ ] **Step 1: Read the file to confirm current state**

Read `src/components/data-element-renderer.tsx`. Confirm:
- Line 4: `import React from "react";`
- Line 20: `export const DataElementRenderer = ({` — NOT wrapped in `React.memo`

- [ ] **Step 2: Wrap the export with `React.memo`**

Change:
```ts
export const DataElementRenderer = ({
    dataElementId,
    currentDataElements,
    ruleResult,
    sectionLength,
    form,
    onFieldChange,
    mode = "dataElement",
    xl,
}: DataElementRendererProps) => {
```

To:
```ts
export const DataElementRenderer = React.memo(({
    dataElementId,
    currentDataElements,
    ruleResult,
    sectionLength,
    form,
    onFieldChange,
    mode = "dataElement",
    xl,
}: DataElementRendererProps) => {
```

And close the `React.memo(` call by adding `);` after the final closing `}` of the component (the current last line of the component body).

The component currently ends with:
```tsx
    );
};
```

Change it to:
```tsx
    );
});
```

- [ ] **Step 3: Verify TypeScript compiles with no new errors**

```bash
cd /Users/carapai/projects/eregisters && npx tsc --noEmit 2>&1
```

Expected: same 4 pre-existing errors in `src/utils/utils.ts`, zero new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/data-element-renderer.tsx
git commit -m "perf: memoize DataElementRenderer to skip unnecessary re-renders"
```
