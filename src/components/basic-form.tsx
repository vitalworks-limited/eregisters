import { Form, FormInstance, Row, Typography } from "antd";
import React, { useCallback } from "react";
import { useMetadata } from "../hooks/useMetadata";
import { EventContext } from "../machines";
import { buildCurrentDataElements } from "../utils/utils";
import { DataElementRenderer } from "./data-element-renderer";

export default function BasicForm({
    section,
    form,
}: {
    section: string;
    form: FormInstance;
}) {
    const eventActor = EventContext.useActorRef();
    const { program } = useMetadata();
    const ruleResult = EventContext.useSelector(
        (state) => state.context.ruleResult,
    );
    const stage = program.programStages.find(({ id }) => id === "K2nxbE9ubSs")!;
    const triageSection = stage.programStageSections.find(
        ({ name }) => name === "Triage",
    );
    const currentDataElements = buildCurrentDataElements(stage);
    const currentSection = stage.programStageSections.find(
        ({ name }) => name === "Child Health Services",
    )!;

    const onFieldChange = useCallback(
        (dataElement: string, value: any) => {
            const allValues = {
                ...form.getFieldsValue(),
                [dataElement]: value,
            };
            eventActor.send({
                type: "FIELD_CHANGED",
                formData: allValues,
            });
        },
        [eventActor, form],
    );
    return (
        <Form form={form} component={false} layout="vertical">
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
                        onFieldChange={onFieldChange}
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
                        onFieldChange={onFieldChange}
                    />
                ))}
            </Row>
        </Form>
    );
}
