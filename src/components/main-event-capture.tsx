import { Card, Col, Flex, Form, FormInstance, Row, Select, Tabs } from "antd";
import dayjs from "dayjs";
import { orderBy } from "lodash";
import React, { useEffect, useState } from "react";
import { EventContext } from "../machines";
import { RootRoute } from "../routes/__root";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
} from "../schemas";
import {
    buildCurrentDataElements,
    createGetValueProps,
    createNormalize,
} from "../utils/utils";
import { DataElementField } from "./data-element-field";
import { DataElementRenderer } from "./data-element-renderer";
import { ProgramStageCapture } from "./program-stage-capture";
import RelationshipEvent from "./relationship-event";

const stages: Map<string, number> = new Map([
    ["x5x1cHHjg00", 7],
    ["opwSN351xGC", 5],
    ["dyt37jxHYGv", 6],
    ["VzKe0OzKS8O", 1],
    ["zKGWob5AZKP", 3],
    ["K2nxbE9ubSs", 2],
    ["DA0Yt3V16AN", 4],
    ["wmPg6qplttg", 8],
]);

export default function MainEventCapture({
    form,
    trackedEntity,
    mainEvent,
    enrollment,
}: {
    form: FormInstance;
    trackedEntity: FlattenedTrackedEntity;
    mainEvent: FlattenedEvent;
    enrollment: FlattenedEnrollment;
}) {
    const currentServices = Form.useWatch("mrKZWf2WMIC", form);
    const { program, optionSets } = RootRoute.useLoaderData();
    const [activeKey, setActiveKey] = useState<string>(
        "K2nxbE9ubSs-bnV62fxQmoE",
    );
    const eventActor = EventContext.useActorRef();
    const values = Form.useWatch([], form);

    useEffect(() => {
        eventActor.send({
            type: "FIELD_CHANGED",
            formData: {
                ...form.getFieldsValue(),
                ...values,
            },
        });
    }, [values]);

    const ruleResult = EventContext.useSelector(
        (state) => state.context.ruleResult,
    );

    const [serviceTypes, setServiceTypes] = useState<
        Array<{
            id: string;
            name: string;
            code: string;
            optionSet: string;
        }>
    >(optionSets.get("QwsvSPpnRul") ?? []);

    useEffect(() => {
        if (ruleResult && ruleResult.hiddenOptions["mrKZWf2WMIC"]?.length > 0) {
            setServiceTypes((prev) =>
                prev.filter(
                    (o) =>
                        !ruleResult.hiddenOptions["mrKZWf2WMIC"].includes(o.id),
                ),
            );
        } else {
            setServiceTypes(optionSets.get("QwsvSPpnRul") ?? []);
        }
    }, [ruleResult.hiddenOptions["mrKZWf2WMIC"], optionSets]);
    return (
        <Flex vertical gap={10} style={{ width: "100%" }}>
            <Card size="small" styles={{ body: { padding: 10, margin: 0 } }}>
                <Row gutter={[16, 0]}>
                    <DataElementField
                        dataElement={{
                            code: "occurredAt",
                            id: "occurredAt",
                            confidential: false,
                            name: "occurredAt",
                            valueType: "DATE",
                            displayFormName: "Visit Date",
                            generated: false,
                            optionSetValue: false,
                            unique: true,
                            pattern: "",
                            formName: "Visit Date",
                        }}
                        hidden={false}
                        finalOptions={[]}
                        messages={[]}
                        warnings={[]}
                        errors={[]}
                        required={true}
                        form={form}
                        xs={12}
                        sm={12}
                        md={12}
                        lg={12}
                        xl={12}
                        onFieldChange={(fieldId, value) => {}}
                        disabledDate={(date) => date.isAfter(dayjs())}
                    />
                    <Col span={12}>
                        <Form.Item
                            label="Service Type"
                            name="mrKZWf2WMIC"
                            rules={[
                                {
                                    required: true,
                                    message: "Please select service type!",
                                },
                            ]}
                            getValueProps={createGetValueProps("MULTI_TEXT")}
                            normalize={createNormalize("MULTI_TEXT")}
                        >
                            <Select
                                style={{ width: "100%" }}
                                options={serviceTypes}
                                fieldNames={{
                                    label: "name",
                                    value: "code",
                                }}
                                allowClear
                                mode="multiple"
                                placeholder="Select services"
                                showSearch={{
                                    filterOption: (input, option) =>
                                        option
                                            ? option.name
                                                  .toLowerCase()
                                                  .includes(
                                                      input.toLowerCase(),
                                                  ) ||
                                              option.code
                                                  .toLowerCase()
                                                  .includes(input.toLowerCase())
                                            : false,
                                }}
                                onChange={() => {}}
                            />
                        </Form.Item>
                    </Col>
                </Row>
            </Card>
            <Tabs
                tabPlacement="start"
                items={orderBy(
                    program.programStages.map((a) => ({
                        ...a,
                        sortOrder: stages.get(a.id),
                    })),
                    "sortOrder",
                    "asc",
                ).flatMap((stage) => {
                    const currentDataElements = buildCurrentDataElements(stage);
                    if (stage.id === "opwSN351xGC") {
                        const shouldShow =
                            currentServices &&
                            String(currentServices)
                                .split(",")
                                .some((a) =>
                                    [
                                        "TB",
                                        "DR-TB",
                                        "Leprosy",
                                        "ART",
                                        "HTS",
                                    ].includes(a),
                                );
                        return {
                            key: stage.id,
                            label: stage.name,
                            style: shouldShow ? {} : { display: "none" },
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
                                                            onFieldChange={() => {}}
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
                })}
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
        </Flex>
    );
}
