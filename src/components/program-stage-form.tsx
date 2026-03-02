import React, { useEffect, useRef } from "react";
import { RootRoute } from "../routes/__root";

import { Card, Form, FormInstance, Row } from "antd";
import { useEventForm } from "../hooks/useEventForm";
import {
    FlattenedEvent,
    FlattenedTrackedEntity,
    ProgramStage,
} from "../schemas";
import { buildCurrentDataElements } from "../utils/utils";
import { DataElementRenderer } from "./data-element-renderer";

export default function ProgramStageForm({
    form,
    programStage,
    event,
    trackedEntity,
    previousEvents,
}: {
    form: FormInstance;
    programStage: ProgramStage;
    event: FlattenedEvent;
    trackedEntity: FlattenedTrackedEntity;
    previousEvents?: FlattenedEvent[];
}) {
    const { program, programRules, programRuleVariables } =
        RootRoute.useLoaderData();

    const currentDataElements = buildCurrentDataElements(programStage);
    const allowedDataElements = new Set(currentDataElements.keys());

    const { ruleResult, updateFieldWithRules, entity, executeAndApplyRules } =
        useEventForm({
            form,
            event,
            trackedEntity,
            programStageId: programStage.id,
            programRules,
            programRuleVariables,
            programId: program.id,
            previousEvents,
            allowedDataElements,
        });

    const executeAndApplyRulesRef = useRef(executeAndApplyRules);
    useEffect(() => {
        executeAndApplyRulesRef.current = executeAndApplyRules;
    });

    // Track if we've executed rules for the current event
    const lastEventRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!entity?.dataValues) return;
        form.setFieldsValue(entity.dataValues);
        lastEventRef.current = entity.event;
        executeAndApplyRulesRef.current(entity.dataValues);
    }, [entity?.event, form]);

    // Execute rules when event prop changes (e.g., modal opens with data)
    useEffect(() => {
        if (!event?.event || !event?.dataValues) return;

        // Use event.dataValues directly instead of form.getFieldsValue()
        // because the form may not have all fields rendered yet
        executeAndApplyRulesRef.current(event.dataValues);
    }, [event]);

    return (
        <Card>
            {programStage.programStageSections.flatMap((section) => {
                if (ruleResult.hiddenSections.has(section.id)) return [];
                return (
                    <Row gutter={[16, 0]} key={section.id}>
                        {section.dataElements.map((dataElement) => (
                            <DataElementRenderer
                                key={dataElement.id}
                                dataElementId={dataElement.id}
                                currentDataElements={currentDataElements}
                                ruleResult={ruleResult}
                                sectionLength={section.dataElements.length}
                                form={form}
                                onAutoSave={updateFieldWithRules}
                            />
                        ))}
                    </Row>
                );
            })}
        </Card>
    );
}
