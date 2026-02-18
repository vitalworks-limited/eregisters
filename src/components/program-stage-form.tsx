import React, { useEffect } from "react";
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

    const { ruleResult, updateFieldWithRules, entity } = useEventForm({
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

    useEffect(() => {
        form.setFieldsValue(entity?.dataValues);
    }, [entity]);

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
