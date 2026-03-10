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
import dayjs from "dayjs";
import { orderBy } from "lodash";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRuleResultPersistence } from "../hooks/useRuleResultPersistence";
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
    executeProgramRules,
} from "../utils/utils";
import { DataElementRenderer } from "./data-element-renderer";
import { ProgramStageCapture } from "./program-stage-capture";
import RelationshipEvent from "./relationship-event";
import { eventsCollection } from "../collections";

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
    const ageAtVisit = Form.useWatch("zxJ9SDZtKUS", form);
    const nutritionalBMI = Form.useWatch("nxthjrx18Y0", form);
    const ageBMI = Form.useWatch("RltyVq1d11i", form);
    const { program, optionSets, programRules, programRuleVariables } =
        RootRoute.useLoaderData();

    const [activeKey, setActiveKey] = useState<string>(
        "K2nxbE9ubSs-bnV62fxQmoE",
    );
    const mainStage = program.programStages.find((s) => s.id === "K2nxbE9ubSs");
    const mainStageDataElements = useMemo(
        () =>
            new Set(
                mainStage?.programStageDataElements.map(
                    (psde) => psde.dataElement.id,
                ) ?? [],
            ),
        [mainStage],
    );

    const { ruleResult, saveRuleResult } = useRuleResultPersistence({
        formType: "main",
    });
    const handleFieldChange = useCallback((fieldId: string, value: any) => {
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
                mainStageDataElements.has(k),
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
        eventsCollection.utils.insertLocally({
            ...mainEvent,
            dataValues: { ...mainEvent.dataValues, ...currentData },
        });
    }, []);

    const [serviceTypes, setServiceTypes] = useState<
        Array<{
            id: string;
            name: string;
            code: string;
            optionSet: string;
        }>
    >(optionSets.get("QwsvSPpnRul") ?? []);

    useEffect(() => {
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
                mainStageDataElements.has(k),
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
    }, [ageAtVisit, ageBMI, nutritionalBMI]);

    useEffect(() => {
        const currentData = form.getFieldsValue();
        form.setFieldsValue({ ...currentData, ...mainEvent.dataValues });
    }, [activeKey]);

    useEffect(() => {
        if (ruleResult && ruleResult.hiddenOptions["mrKZWf2WMIC"]?.length > 0) {
            setServiceTypes((prev) =>
                prev.flatMap((o) => {
                    if (
                        ruleResult.hiddenOptions["mrKZWf2WMIC"].includes(o.id)
                    ) {
                        return [];
                    }
                    return o;
                }),
            );
        }
    }, [ruleResult?.hiddenOptions["mrKZWf2WMIC"]]);
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
                                onChange={(date) => {
                                    const value = date
                                        ? date.format("YYYY-MM-DD")
                                        : undefined;
                                    handleFieldChange("occurredAt", value);
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
                                onChange={(value) => {
                                    handleFieldChange("mrKZWf2WMIC", value);
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
                            !ruleResult ||
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
                                                            onFieldChange={
                                                                handleFieldChange
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
                onChange={setActiveKey}
                activeKey={activeKey}
            />
        </Flex>
    );
}
