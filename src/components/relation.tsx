import { Form, Row, Typography } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import React, { useCallback, useEffect, useRef } from "react";
import { db } from "../db";
import { useProgramRulesWithDexie } from "../hooks/useProgramRules";
import { RootRoute } from "../routes/__root";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";
import { buildCurrentDataElements } from "../utils/utils";
import { DataElementRenderer } from "./data-element-renderer";

export default function Relation({
    section,
    mainEvent,
    trackedEntity,
}: {
    section: string;
    mainEvent: FlattenedEvent;
    trackedEntity: FlattenedTrackedEntity;
}) {
    const { program, programRuleVariables, programRules } =
        RootRoute.useLoaderData();

    const [childEventForm] = Form.useForm();

    const [stage] = program.programStages.filter(
        ({ id }) => id === "K2nxbE9ubSs",
    );

    const [currentSection] = stage.programStageSections.filter(
        ({ name }) => name === "Child Health Services",
    );

    const childEventRef = useRef<typeof childEvent>(undefined);

    const childEvent = useLiveQuery(async () => {
        return db.events
            .where("parentEvent")
            .equals(mainEvent.event)
            .filter((x) => x.trackedEntity === trackedEntity.trackedEntity)
            .first();
    }, [mainEvent.event, trackedEntity.trackedEntity]);

    useEffect(() => {
        childEventRef.current = childEvent;
    }, [childEvent?.event]);

    const persistFields = useCallback(async (fields: Record<string, any>) => {
        const event = childEventRef.current;
        if (!event?.event) return;
        const current = await db.events.get(event.event);
        if (!current) return;
        await db.events.update(event.event, {
            dataValues: { ...current.dataValues, ...fields },
        });
    }, []);

    const { ruleResult, executeAndApplyRules, triggerAutoExecute } =
        useProgramRulesWithDexie({
            form: childEventForm,
            programRules,
            programRuleVariables,
            programStage: "K2nxbE9ubSs",
            trackedEntityAttributes: trackedEntity.attributes,
            onAssignments: persistFields,
            applyAssignmentsToForm: true,
            persistAssignments: true,
            program: program.id,
            autoExecute: true,
        });

    const updateFieldWithRules = useCallback(
        async (fieldId: string, value: any) => {
            triggerAutoExecute();
            const current = await db.events.get(childEvent?.event ?? "");
            if (!current) return;
            await db.events.update(current.event, {
                dataValues: { ...current.dataValues, [fieldId]: value },
                syncStatus: "pending",
            });
        },
        [triggerAutoExecute],
    );

    const currentDataElements = buildCurrentDataElements(stage);
    const executeAndApplyRulesRef = useRef(executeAndApplyRules);
    useEffect(() => {
        executeAndApplyRulesRef.current = executeAndApplyRules;
    });

    useEffect(() => {
        if (!childEvent) return;
        childEventForm.setFieldsValue({
            ...childEvent.dataValues,
            UuxHHVp5CnF: section === "Maternity" ? "Newborn" : "Postnatal",
            mrKZWf2WMIC: "Child Health Services",
        });
        executeAndApplyRulesRef.current({
            ...childEvent.dataValues,
            UuxHHVp5CnF: section === "Maternity" ? "Newborn" : "Postnatal",
            mrKZWf2WMIC: "Child Health Services",
        });
    }, [childEvent?.event]);

    return (
        <Form
            form={childEventForm}
            layout="vertical"
            style={{ margin: 0, padding: 0 }}
        >
            <Typography.Title level={4} style={{ marginBottom: 16 }}>
                {section}
            </Typography.Title>
            <Row gutter={[16, 0]}>
                {currentSection.dataElements.map((dataElement) => (
                    <DataElementRenderer
                        key={dataElement.id}
                        dataElementId={dataElement.id}
                        currentDataElements={currentDataElements}
                        ruleResult={ruleResult}
                        sectionLength={currentSection.dataElements.length}
                        form={childEventForm}
                        onAutoSave={updateFieldWithRules}
                    />
                ))}
            </Row>
        </Form>
    );
}
