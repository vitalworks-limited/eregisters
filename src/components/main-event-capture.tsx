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
import React, { useEffect, useState } from "react";
import { useProgramRulesWithDexie } from "../hooks/useProgramRules";
import { RootRoute } from "../routes/__root";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";
import {
    calculateColSpan,
    createGetValueProps,
    createNormalize,
} from "../utils/utils";
import { DataElementField } from "./data-element-field";
import RelationshipEvent from "./relationship-event";
import { useDexiePersistence } from "../hooks/useDexiePersistence";
import { ProgramStageCapture } from "./program-stage-capture";

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

const relationshipTypes: Map<string, string> = new Map([
    ["opwSN351xGC", "W16c7nWGWpY"],
    ["zKGWob5AZKP", "v3dKzBFfI7p"],
    ["DA0Yt3V16AN", "mrdzkBOTFay"],
]);
export default function MainEventCapture({
    form,
    trackedEntity,
    mainEvent,
}: {
    form: FormInstance;
    trackedEntity: FlattenedTrackedEntity;
    mainEvent: FlattenedEvent;
}) {
    const {
        program,
        dataElements,
        optionGroups,
        optionSets,
        programRules,
        programRuleVariables,
    } = RootRoute.useLoaderData();
    const values = Form.useWatch([], form);
    const [activeKey, setActiveKey] = useState<string>(
        "K2nxbE9ubSs-bnV62fxQmoE",
    );

    const { updateField, entity } = useDexiePersistence<FlattenedEvent>({
        entityType: "event",
        entityId: mainEvent.event,
        debounceMs: 100,
    });

    const { ruleResult, triggerAutoExecute } = useProgramRulesWithDexie({
        form,
        programRules,
        programRuleVariables,
        programStage: "K2nxbE9ubSs",
        trackedEntityAttributes: trackedEntity.attributes,
        onAssignments: async () => {},
        applyAssignmentsToForm: true,
        persistAssignments: true,
        program: program.id,
        autoExecute: true,
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

    useEffect(() => {
        if (!values) return;
        triggerAutoExecute();
    }, [values]);

    const handleTabChange = (active: string) => {
        setActiveKey(() => active);
    };
    useEffect(() => {
        form.setFieldsValue(entity?.dataValues);
    }, [entity]);
    return (
        <Flex vertical gap={10} style={{ width: "100%" }}>
            <Card size="small" styles={{ body: { padding: 10, margin: 0 } }}>
                <Row gutter={20}>
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
                                onChange={(value) => {
                                    updateField(
                                        "occurredAt",
                                        value?.toISOString() ?? null,
                                    );
                                }}
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
                                    updateField("mrKZWf2WMIC", value);
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
                    const currentDataElements = new Map(
                        stage.programStageDataElements.map((psde) => [
                            psde.dataElement.id,
                            {
                                allowFutureDate: psde.allowFutureDate,
                                renderOptionsAsRadio:
                                    psde.renderType !== undefined,
                                compulsory: psde.compulsory,
                                desktopRenderType:
                                    psde.renderType?.DESKTOP?.type,
                            },
                        ]),
                    );

                    if (stage.id === "opwSN351xGC") {
                        return [];
                    }
                    if (
                        ["opwSN351xGC", "zKGWob5AZKP", "DA0Yt3V16AN"].includes(
                            stage.id,
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
                                    relationShipType={
                                        relationshipTypes.get(stage.id)!
                                    }
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
                                        <Row gutter={24}>
                                            {section.dataElements.flatMap(
                                                (dataElement) => {
                                                    const currentDataElement =
                                                        dataElements.get(
                                                            dataElement.id,
                                                        );
                                                    const {
                                                        compulsory = false,
                                                        desktopRenderType,
                                                    } =
                                                        currentDataElements.get(
                                                            dataElement.id,
                                                        ) || {};

                                                    const optionSet =
                                                        currentDataElement
                                                            ?.optionSet?.id ??
                                                        "";

                                                    const hiddenOptions =
                                                        ruleResult
                                                            .hiddenOptions[
                                                            dataElement.id
                                                        ];

                                                    const shownOptionGroups =
                                                        ruleResult
                                                            .shownOptionGroups[
                                                            dataElement.id
                                                        ] || new Set<string>();

                                                    let finalOptions =
                                                        optionSets
                                                            .get(optionSet)
                                                            ?.flatMap((o) => {
                                                                if (
                                                                    hiddenOptions?.has(
                                                                        o.id,
                                                                    )
                                                                ) {
                                                                    return [];
                                                                }
                                                                return o;
                                                            });

                                                    if (
                                                        ruleResult.hiddenFields.has(
                                                            dataElement.id,
                                                        )
                                                    ) {
                                                        return [];
                                                    }

                                                    if (
                                                        shownOptionGroups.size >
                                                        0
                                                    ) {
                                                        const currentOptions =
                                                            optionGroups.get(
                                                                shownOptionGroups
                                                                    .values()
                                                                    .next()
                                                                    .value,
                                                            ) ?? [];
                                                        finalOptions =
                                                            currentOptions.map(
                                                                ({
                                                                    code,
                                                                    id,
                                                                    name,
                                                                }) => ({
                                                                    id,
                                                                    code,
                                                                    name,
                                                                    optionSet,
                                                                }),
                                                            );
                                                    }

                                                    const errors =
                                                        ruleResult.errors.filter(
                                                            (msg) =>
                                                                msg.key ===
                                                                dataElement.id,
                                                        );
                                                    const messages =
                                                        ruleResult.messages.filter(
                                                            (msg) =>
                                                                msg.key ===
                                                                dataElement.id,
                                                        );
                                                    const warnings =
                                                        ruleResult.warnings.filter(
                                                            (msg) =>
                                                                msg.key ===
                                                                dataElement.id,
                                                        );

                                                    return (
                                                        <DataElementField
                                                            dataElement={
                                                                currentDataElement!
                                                            }
                                                            hidden={false}
                                                            desktopRenderType={
                                                                desktopRenderType!
                                                            }
                                                            finalOptions={
                                                                finalOptions
                                                            }
                                                            messages={messages}
                                                            warnings={warnings}
                                                            errors={errors}
                                                            required={
                                                                compulsory
                                                            }
                                                            disabled={
                                                                dataElement.id in
                                                                ruleResult.assignments
                                                            }
                                                            key={dataElement.id}
                                                            form={form}
                                                            xs={calculateColSpan(
                                                                section
                                                                    .dataElements
                                                                    .length,
                                                                24,
                                                            )}
                                                            sm={calculateColSpan(
                                                                section
                                                                    .dataElements
                                                                    .length,
                                                                24,
                                                            )}
                                                            md={calculateColSpan(
                                                                section
                                                                    .dataElements
                                                                    .length,
                                                                24,
                                                            )}
                                                            lg={calculateColSpan(
                                                                section
                                                                    .dataElements
                                                                    .length,
                                                                12,
                                                            )}
                                                            xl={calculateColSpan(
                                                                section
                                                                    .dataElements
                                                                    .length,
                                                                6,
                                                            )}
                                                            onAutoSave={(
                                                                dataElement,
                                                                value,
                                                            ) =>
                                                                updateField(
                                                                    dataElement,
                                                                    value,
                                                                )
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
