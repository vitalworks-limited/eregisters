import React, { useEffect, useRef } from "react";
import { RootRoute } from "../routes/__root";

import { Card, FormInstance, Row } from "antd";
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
}: {
    form: FormInstance;
    programStage: ProgramStage;
    event: FlattenedEvent;
    trackedEntity: FlattenedTrackedEntity;
}) {
    const { program, programRules, programRuleVariables } =
        RootRoute.useLoaderData();

    const currentDataElements = buildCurrentDataElements(programStage);
    const allowedDataElements = new Set(currentDataElements.keys());

    const { ruleResult, handleFieldChange, entity, executeAndApplyRules } =
        useEventForm({
            form,
            event,
            trackedEntityId: trackedEntity.trackedEntity,
            programStageId: programStage.id,
            programRules,
            programRuleVariables,
            programId: program.id,
            allowedDataElements,
        });

    // Track if we've executed rules for the current event
    const lastEventRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!entity?.dataValues) return;
        form.setFieldsValue(entity.dataValues);
        lastEventRef.current = entity.event;
        executeAndApplyRules(entity.dataValues);
    }, [entity?.event, form, executeAndApplyRules]);

    // Execute rules when event prop changes (e.g., modal opens with data)
    useEffect(() => {
        if (!event?.event || !event?.dataValues) return;

        // Use event.dataValues directly instead of form.getFieldsValue()
        // because the form may not have all fields rendered yet
        executeAndApplyRules(event.dataValues);
    }, [event, executeAndApplyRules]);

    return (
        <Card>
            {programStage.programStageSections.flatMap((section) => {
                if (ruleResult.hiddenSections.includes(section.id)) return [];
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
                                onFieldChange={handleFieldChange}
                            />
                        ))}
                    </Row>
                );
            })}
        </Card>
    );
}
