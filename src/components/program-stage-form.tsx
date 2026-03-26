import React, { useEffect } from "react";

import { Card, Form, FormInstance, Row } from "antd";
import { EventContext } from "../machines";
import { ProgramStage } from "../schemas";
import { buildCurrentDataElements } from "../utils/utils";
import { DataElementRenderer } from "./data-element-renderer";

export default function ProgramStageForm({
    form,
    programStage,
}: {
    form: FormInstance;
    programStage: ProgramStage;
}) {
    const eventActor = EventContext.useActorRef();
    const ruleResult = EventContext.useSelector((a) => a.context.ruleResult);
    const currentDataElements = buildCurrentDataElements(programStage);

    const specimenType = Form.useWatch("kTslIUl8qja", form);
    const onFieldChange = (dataElement: string, value: any) => {
        eventActor.send({
            type: "FIELD_CHANGED",
            formData: {
                ...form.getFieldsValue(),
                [dataElement]: value,
            },
        });
    };

    useEffect(() => {
        eventActor.send({
            type: "FIELD_CHANGED",
            formData: {
                ...form.getFieldsValue(),
                kTslIUl8qja: specimenType,
            },
        });
    }, [specimenType]);

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
                                onFieldChange={onFieldChange}
                            />
                        ))}
                    </Row>
                );
            })}
        </Card>
    );
}
