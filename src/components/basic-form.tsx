import { Form, FormInstance, Row, Typography } from "antd";
import React, { useEffect } from "react";
import { EventContext, SyncContext } from "../machines";
import { RootRoute } from "../routes/__root";
import { buildCurrentDataElements } from "../utils/utils";
import { DataElementRenderer } from "./data-element-renderer";
import { FlattenedEnrollment, FlattenedEvent } from "../schemas";

export default function BasicForm({
    section,
    form,
    event,
}: {
    section: string;
    form: FormInstance;
    event: FlattenedEvent;
}) {
    const eventActor = EventContext.useActorRef();
    const syncActor = SyncContext.useActorRef();
    const { program } = RootRoute.useLoaderData();
    const ruleResult = EventContext.useSelector(
        (state) => state.context.ruleResult,
    );
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

    const onFieldChange = (dataElement: string, value: any) => {
        eventActor.send({
            type: "FIELD_CHANGED",
            formData: {
                ...form.getFieldsValue,
                [dataElement]: value,
            },
        });
        syncActor.send({
            type: "SYNC_ENTITIES",
            entities: [
                {
                    ...event,
                    dataValues: {
                        ...event.dataValues,
                        ...form.getFieldsValue,
                        [dataElement]: value,
                    },
                },
            ],
        });
    };
    return (
        <>
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
        </>
    );
}
