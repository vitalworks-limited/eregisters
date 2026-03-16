import React, { useEffect } from "react";

import { Card, FormInstance, Row, Form } from "antd";
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

    const values = Form.useWatch([], form);
    useEffect(() => {
        eventActor.send({
            type: "FIELD_CHANGED",
            formData: {
                ...form.getFieldsValue,
                ...values,
            },
        });
    }, [values]);
    const ruleResult = EventContext.useSelector((a) => a.context.ruleResult);
    const currentDataElements = buildCurrentDataElements(programStage);

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
                                onFieldChange={() => {}}
                            />
                        ))}
                    </Row>
                );
            })}
        </Card>
    );
}
