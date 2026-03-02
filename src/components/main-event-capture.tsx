import {
    Card,
    Col,
    DatePicker,
    Flex,
    Form,
    FormInstance,
    Row,
    Select,
    Tabs,
} from "antd";
import { orderBy } from "lodash";
import React, { useEffect, useRef, useState } from "react";
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
import RelationshipEvent from "./relationship-event";
import { useEventForm } from "../hooks/useEventForm";
import { ProgramStageCapture } from "./program-stage-capture";
import { DataElementRenderer } from "./data-element-renderer";
import dayjs from "dayjs";

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
    previousEvents,
    enrollment,
}: {
    form: FormInstance;
    trackedEntity: FlattenedTrackedEntity;
    mainEvent: FlattenedEvent;
    previousEvents?: FlattenedEvent[];
    enrollment: FlattenedEnrollment;
}) {
    const { program, optionSets, programRules, programRuleVariables } =
        RootRoute.useLoaderData();

    // const values = Form.useWatch(
    //     ["zxJ9SDZtKUS", "nxthjrx18Y0", "RltyVq1d11i"],
    //     form,
    // );
    const currentServices = Form.useWatch("mrKZWf2WMIC", form);
    const ageAtVisit = Form.useWatch("zxJ9SDZtKUS", form);
    const nutritionalBMI = Form.useWatch("nxthjrx18Y0", form);
    const ageBMI = Form.useWatch("RltyVq1d11i", form);
    const [activeKey, setActiveKey] = useState<string>(
        "K2nxbE9ubSs-bnV62fxQmoE",
    );

    const mainStage = program.programStages.find((s) => s.id === "K2nxbE9ubSs");
    const mainStageDataElements = new Set(
        mainStage?.programStageDataElements.map(
            (psde) => psde.dataElement.id,
        ) ?? [],
    );

    const { ruleResult, updateFieldWithRules, entity, executeAndApplyRules } =
        useEventForm({
            form,
            event: mainEvent,
            trackedEntity,
            programStageId: "K2nxbE9ubSs",
            programRules,
            programRuleVariables,
            programId: program.id,
            previousEvents,
            allowedDataElements: mainStageDataElements,
        });

    const [serviceTypes, setServiceTypes] = useState<
        Array<{
            id: string;
            name: string;
            code: string;
            optionSet: string;
        }>
    >(optionSets.get("QwsvSPpnRul") ?? []);

    useEffect(() => {
        if (ruleResult.hiddenOptions["mrKZWf2WMIC"]?.size > 0) {
            setServiceTypes((prev) =>
                prev.flatMap((o) => {
                    if (ruleResult.hiddenOptions["mrKZWf2WMIC"].has(o.id)) {
                        return [];
                    }
                    return o;
                }),
            );
        }
    }, [ruleResult.hiddenOptions["mrKZWf2WMIC"]]);

    const handleTabChange = (active: string) => {
        setActiveKey(() => active);
    };
    const executeAndApplyRulesRef = useRef(executeAndApplyRules);
    useEffect(() => {
        executeAndApplyRulesRef.current = executeAndApplyRules;
    });

    const lastEventRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!entity?.dataValues) return;
        form.setFieldsValue(entity.dataValues);
        lastEventRef.current = entity.event;
        executeAndApplyRulesRef.current(entity.dataValues);
    }, [entity?.event, form]);
    useEffect(() => {
        if (!mainEvent?.event || !mainEvent?.dataValues) return;
        executeAndApplyRulesRef.current(mainEvent.dataValues);
    }, [mainEvent]);

    useEffect(() => {
        const formValues = form.getFieldsValue();
        executeAndApplyRulesRef.current(formValues);
    }, [currentServices, activeKey, ageAtVisit, ageAtVisit, nutritionalBMI]);
    return (
        <Flex vertical gap={10} style={{ width: "100%" }}>
            <Card size="small" styles={{ body: { padding: 10, margin: 0 } }}>
                <Row gutter={[16, 0]}>
                    <Col span={12}>
                        <Form.Item
                            label="Visit Date"
                            name="occurredAt"
                            rules={[
                                {
                                    required: true,
                                    message: "Please select visit date!",
                                },
                            ]}
                            getValueProps={createGetValueProps("DATE")}
                            normalize={createNormalize("DATE")}
                        >
                            <DatePicker
                                style={{ width: "100%" }}
                                placeholder="Select date"
                                onChange={() => {
                                    updateFieldWithRules(
                                        "occurredAt",
                                        form.getFieldValue("occurredAt"),
                                    );
                                }}
                                disabledDate={(date) => date.isAfter(dayjs())}
                            />
                        </Form.Item>
                    </Col>
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
                                onChange={() => {
                                    updateFieldWithRules(
                                        "mrKZWf2WMIC",
                                        form.getFieldValue("mrKZWf2WMIC"),
                                    );
                                }}
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

                    if (
                        currentServices &&
                        stage.id === "opwSN351xGC" &&
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
                            )
                    ) {
                        return {
                            key: stage.id,
                            label: stage.name,
                            children: (
                                <ProgramStageCapture
                                    programStage={stage}
                                    trackedEntity={trackedEntity}
                                    mainEvent={mainEvent}
                                    previousEvents={previousEvents}
                                    enrollment={enrollment}
                                />
                            ),
                        };
                    } else if (stage.id === "opwSN351xGC") {
                        return [];
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
                                    previousEvents={previousEvents}
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
                        if (ruleResult.hiddenSections.has(section.id))
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
                                                            onAutoSave={
                                                                updateFieldWithRules
                                                            }
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
                onChange={handleTabChange}
                activeKey={activeKey}
            />
        </Flex>
    );
}
