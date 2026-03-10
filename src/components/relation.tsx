import { and, eq, useLiveSuspenseQuery } from "@tanstack/react-db";
import { Form, Row, Typography } from "antd";
import React, { useCallback, useEffect } from "react";
import { eventsCollection } from "../collections";
import { useRuleResultPersistence } from "../hooks/useRuleResultPersistence";
import { RootRoute } from "../routes/__root";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";
import { buildCurrentDataElements, executeProgramRules } from "../utils/utils";
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

    const [form] = Form.useForm();
    const { ruleResult, saveRuleResult } = useRuleResultPersistence({
        formType: "child",
    });

    const [stage] = program.programStages.filter(
        ({ id }) => id === "K2nxbE9ubSs",
    );

    const triageSection = stage.programStageSections.find(
        ({ name }) => name === "Triage",
    );
    const currentDataElements = buildCurrentDataElements(stage);

    const [currentSection] = stage.programStageSections.filter(
        ({ name }) => name === "Child Health Services",
    );
    const { data: childEvent } = useLiveSuspenseQuery((q) =>
        q
            .from({ events: eventsCollection })
            .where(({ events }) =>
                and(
                    eq(events.parentEvent, mainEvent.event),
                    eq(events.trackedEntity, trackedEntity.trackedEntity),
                ),
            )
            .findOne(),
    );
    const handleFieldChange = useCallback(
        async (fieldId: string, value: any) => {
            form.setFieldValue(fieldId, value);
            const currentData = form.getFieldsValue();
            const result = executeProgramRules({
                programRules,
                programRuleVariables,
                dataValues: currentData,
                attributeValues: trackedEntity.attributes,
                program: program.id,
                programStage: "K2nxbE9ubSs",
                previousEvents: [],
            });

            saveRuleResult(result);
            const filteredAssignments = Object.fromEntries(
                Object.entries(result.assignments).filter(([k]) =>
                    currentDataElements.has(k),
                ),
            );
            if (Object.keys(filteredAssignments).length > 0) {
                form.setFieldsValue(filteredAssignments);
            }
            if (result.hiddenFields.length > 0) {
                const fieldsToClear: Record<string, any> = {};
                result.hiddenFields.forEach((hiddenFieldId) => {
                    const currentValue = currentData[hiddenFieldId];
                    if (
                        currentValue !== undefined &&
                        currentValue !== null &&
                        currentValue !== ""
                    ) {
                        fieldsToClear[hiddenFieldId] = undefined;
                        form.setFieldValue(hiddenFieldId, undefined);
                    }
                });
            }
            const tx = eventsCollection.update(
                childEvent?.event ?? "",
                (draft) => {
                    draft.syncStatus = "pending";
                    draft.dataValues = {
                        ...(childEvent?.dataValues ?? {}),
                        ...currentData,
                    };
                },
            );
            await tx.isPersisted.promise;
        },
        [],
    );

    useEffect(() => {
        if (!childEvent) return;
        form.setFieldsValue(childEvent.dataValues);
        const result = executeProgramRules({
            programRules,
            programRuleVariables,
            dataValues: childEvent.dataValues,
            attributeValues: trackedEntity.attributes,
            program: program.id,
            programStage: "K2nxbE9ubSs",
            previousEvents: [],
        });
        saveRuleResult(result);
        const filteredAssignments = Object.fromEntries(
            Object.entries(result.assignments).filter(([k]) =>
                currentDataElements.has(k),
            ),
        );
        if (Object.keys(filteredAssignments).length > 0) {
            form.setFieldsValue(filteredAssignments);
        }

        if (result.hiddenFields.length > 0) {
            const fieldsToClear: Record<string, any> = {};
            result.hiddenFields.forEach((hiddenFieldId) => {
                const currentValue = trackedEntity.attributes[hiddenFieldId];
                if (
                    currentValue !== undefined &&
                    currentValue !== null &&
                    currentValue !== ""
                ) {
                    fieldsToClear[hiddenFieldId] = undefined;
                    form.setFieldValue(hiddenFieldId, undefined);
                }
            });
        }
    }, []);

    return (
        <Form form={form} component={false} layout="vertical" preserve={false}>
            <Typography.Title level={4} style={{ marginBottom: 16 }}>
                {section}
            </Typography.Title>
            <Row gutter={[16, 0]}>
                {triageSection?.dataElements.map((dataElement) => (
                    <DataElementRenderer
                        key={dataElement.id}
                        dataElementId={dataElement.id}
                        currentDataElements={currentDataElements}
                        ruleResult={ruleResult}
                        sectionLength={triageSection.dataElements.length}
                        form={form}
                        onFieldChange={handleFieldChange}
                    />
                ))}
            </Row>
            <Row gutter={[16, 0]}>
                {currentSection.dataElements.map((dataElement) => (
                    <DataElementRenderer
                        key={dataElement.id}
                        dataElementId={dataElement.id}
                        currentDataElements={currentDataElements}
                        ruleResult={ruleResult}
                        sectionLength={currentSection.dataElements.length}
                        form={form}
                        onFieldChange={handleFieldChange}
                    />
                ))}
            </Row>
        </Form>
    );
}
