import {
    Card,
    Col,
    Collapse,
    Flex,
    Form,
    FormInstance,
    Grid,
    Row,
    Select,
    Tabs,
} from "antd";
import dayjs from "dayjs";
import { orderBy } from "lodash";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { EventContext, SyncContext, TrackedEntityContext } from "../machines";
import { RootRoute } from "../routes/__root";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
} from "../schemas";
import {
    buildCurrentDataElements,
    cancelDataModal,
    createEmptyEnrollment,
    createEmptyEvent,
    createEmptyTrackedEntity,
    createGetValueProps,
    createNormalize,
} from "../utils/utils";
import { DataElementField } from "./data-element-field";
import { DataElementRenderer } from "./data-element-renderer";
import { ProgramStageCapture } from "./program-stage-capture";
import RelationshipEvent from "./relationship-event";
import { useModalState } from "../hooks/useModalState";
import { DataModal } from "./data-modal";
import { TrackerRegistration } from "./tracker-registration";

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

const createPatientAndLink = (
    trackedEntity: FlattenedTrackedEntity,
    allValues: Record<string, any>,
) => {
    const dataElementToAttributeMap: Record<string, string> = {
        KJ2V2JlOxFi: "Y3DE5CZWySr",
    };
    const parentAttributesToCopy: string[] = [
        "XjgpfkoxffK",
        "W87HAtUHJjB",
        "PKuyTiVCR89",
        "oTI0DLitzFY",
    ];

    const combinedAttributes: Record<
        string,
        {
            sourceAttributes: string[];
            separator?: string;
        }
    > = {
        P6Kp91wfCWy: {
            sourceAttributes: ["KSq9EyZ8ZFi", "TWPNbc9O2nK"],
            separator: " ",
        },
        ACgDjRCyX8r: {
            sourceAttributes: ["hPGgzWsb14m"],
            separator: " ",
        },
        b2cMfkY6M3h: {
            sourceAttributes: ["b2x4gA14JsP"],
            separator: " ",
        },
        lpAaZa1cKCB: { separator: " ", sourceAttributes: ["XjgpfkoxffK"] },
        lqbqW3iYmKl: { separator: " ", sourceAttributes: ["PKuyTiVCR89"] },
        BiergDUeQra: { separator: " ", sourceAttributes: ["W87HAtUHJjB"] },
        pixScollYA6: { separator: " ", sourceAttributes: ["oTI0DLitzFY"] },

        sOBCVNIm1kX: { separator: " ", sourceAttributes: ["XjgpfkoxffK"] },
        qbxJxuZCyKu: { separator: " ", sourceAttributes: ["PKuyTiVCR89"] },
        SjvgaRn8m7Y: { separator: " ", sourceAttributes: ["W87HAtUHJjB"] },
        YoteNDkoIwM: { separator: " ", sourceAttributes: ["oTI0DLitzFY"] },
    };

    const autoPopulatedAttributes: Record<string, any> = {};
    parentAttributesToCopy.forEach((attributeId) => {
        if (trackedEntity.attributes && trackedEntity.attributes[attributeId]) {
            autoPopulatedAttributes[attributeId] =
                trackedEntity.attributes[attributeId];
        }
    });
    const mappedAttributes: Record<string, any> = {};
    Object.entries(dataElementToAttributeMap).forEach(
        ([dataElementId, attributeId]) => {
            if (allValues[dataElementId]) {
                let value = allValues[dataElementId];
                if (value && typeof value === "object" && "format" in value) {
                    value = value.format("YYYY-MM-DD");
                }

                mappedAttributes[attributeId] = value;
            }
        },
    );

    const combinedValues: Record<string, any> = {};
    Object.entries(combinedAttributes).forEach(
        ([targetAttrId, { sourceAttributes, separator }]) => {
            const values = sourceAttributes
                .map((attrId) => trackedEntity.attributes?.[attrId] || "")
                .filter((v) => v);
            if (values.length > 0) {
                combinedValues[targetAttrId] = values.join(separator || " ");
            }
        },
    );
    const initialValues = {
        ...autoPopulatedAttributes,
        ...mappedAttributes,
        ...combinedValues,
        enrolledAt: allValues["occurredAt"],
    };
    const newPatient: FlattenedTrackedEntity = createEmptyTrackedEntity({
        orgUnit: trackedEntity.orgUnit,
        attributes: initialValues,
        parentEntity: trackedEntity.trackedEntity,
    });
    const newEnrollment: FlattenedEnrollment = createEmptyEnrollment({
        orgUnit: trackedEntity.orgUnit,
        trackedEntity: newPatient.trackedEntity,
    });
    return { client: newPatient, enrollment: newEnrollment };
};

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
    const {
        enrollmentsCollection,
        trackedEntitiesCollection,
        eventsCollection,
    } = SyncContext.useSelector((a) => ({
        enrollmentsCollection: a.context.enrollmentsCollection,
        trackedEntitiesCollection: a.context.trackedEntitiesCollection,
        eventsCollection: a.context.eventsCollection,
    }));
    const {
        data: childData,
        isOpen: childIsOpen,
        enrollment: childEnrollment,
        openModal: openChildModal,
        closeModal: closeChildModal,
    } = useModalState<FlattenedTrackedEntity>();
    const { program, optionSets, programRuleVariables, programRules } =
        RootRoute.useLoaderData();
    const [activeKey, setActiveKey] = useState<string>(
        "K2nxbE9ubSs-bnV62fxQmoE",
    );
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.lg;
    const eventActor = EventContext.useActorRef();
    const weightForAge = Form.useWatch("zzZ7nE2sbY4", form);
    const bmi = Form.useWatch("nxthjrx18Y0", form);
    const bmiForAge = Form.useWatch("RltyVq1d11i", form);
    const services = Form.useWatch("mrKZWf2WMIC", form);
    const ageAtVisit = Form.useWatch("zxJ9SDZtKUS", form);

    const mainStageDataElements = useMemo(
        () =>
            new Set(
                program.programTrackedEntityAttributes.map(
                    ({ trackedEntityAttribute }) => trackedEntityAttribute.id,
                ),
            ),
        [],
    );

    const ruleResult = EventContext.useSelector(
        (state) => state.context.ruleResult,
    );

    const createChild = useCallback(async () => {
        const { client, enrollment } = createPatientAndLink(
            trackedEntity,
            form.getFieldsValue(),
        );
        await trackedEntitiesCollection.utils.insertLocally(client);
        await enrollmentsCollection.utils.insertLocally(enrollment);
        openChildModal(client, enrollment);
    }, [
        trackedEntity,
        form,
        trackedEntitiesCollection,
        enrollmentsCollection,
        openChildModal,
    ]);
    const onFieldChange = useCallback(
        async (dataElement: string, value: any) => {
            eventActor.send({
                type: "FIELD_CHANGED",
                formData: {
                    ...form.getFieldsValue(),
                    [dataElement]: value,
                },
            });

            if (dataElement) {
                if (dataElement === "REWqohCg4Km" && value === "Yes") {
                    await createChild();
                }
            }
        },
        [eventActor, form, createChild],
    );
    useEffect(() => {
        if (
            weightForAge === undefined &&
            bmi === undefined &&
            bmiForAge === undefined &&
            services === undefined &&
            ageAtVisit === undefined
        ) {
            return;
        }
        eventActor.send({
            type: "FIELD_CHANGED",
            formData: {
                ...form.getFieldsValue(),
                mrKZWf2WMIC: services,
                zzZ7nE2sbY4: weightForAge,
                nxthjrx18Y0: bmi,
                zxJ9SDZtKUS: ageAtVisit,
                RltyVq1d11i: bmiForAge,
            },
        });
    }, [weightForAge, bmi, bmiForAge, services, ageAtVisit]);

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

    const tabItems = useMemo(
        () =>
            orderBy(
                program.programStages.map((a) => ({
                    ...a,
                    sortOrder: stages.get(a.id),
                })),
                "sortOrder",
                "asc",
            ).flatMap((stage) => {
                const currentDataElements = buildCurrentDataElements(stage);
                if (
                    stage.id === "opwSN351xGC" &&
                    services &&
                    String(services)
                        .split(",")
                        .some((a) =>
                            ["TB", "DR-TB", "Leprosy", "ART", "HTS"].includes(
                                a,
                            ),
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
                                                        ruleResult={ruleResult}
                                                        sectionLength={
                                                            section.dataElements
                                                                .length
                                                        }
                                                        form={form}
                                                        onFieldChange={
                                                            onFieldChange
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
            }),
        [
            ruleResult,
            services,
            onFieldChange,
            program,
            trackedEntity,
            mainEvent,
            enrollment,
            form,
        ],
    );

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
                        xs={24}
                        sm={12}
                        md={12}
                        lg={12}
                        xl={12}
                        disabledDate={(date) => date.isAfter(dayjs())}
                        onFieldChange={onFieldChange}
                    />
                    <Col xs={24} lg={12}>
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
                                    onFieldChange("mrKZWf2WMIC", value);
                                }}
                            />
                        </Form.Item>
                    </Col>
                </Row>
            </Card>
            {isMobile ? (
                <Collapse
                    accordion
                    activeKey={activeKey}
                    onChange={(key) =>
                        setActiveKey(Array.isArray(key) ? key[0] : key)
                    }
                    items={tabItems}
                />
            ) : (
                <Tabs
                    tabPlacement="start"
                    items={tabItems}
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
            )}

            <DataModal<FlattenedTrackedEntity>
                open={childIsOpen}
                data={childData}
                onClose={closeChildModal}
                onCancel={() =>
                    cancelDataModal(childData!, {
                        eventsCollection,
                        trackedEntitiesCollection,
                        enrollmentsCollection,
                    })
                }
                hasAddAnother={true}
                enrollment={childEnrollment}
                onSave={async ({ values, addAnother }) => {
                    if (childData && values && childEnrollment) {
                        const childEvent: FlattenedEvent = createEmptyEvent({
                            trackedEntity: childEnrollment.trackedEntity,
                            program: childEnrollment.program,
                            orgUnit: childEnrollment.orgUnit,
                            enrollment: childEnrollment.enrollment,
                            programStage: "K2nxbE9ubSs",
                            dataValues: {
                                occurredAt:
                                    values["enrolledAt"] ||
                                    values["occurredAt"],
                                UuxHHVp5CnF: "Newborn",
                                mrKZWf2WMIC: "Child Health Services",
                            },
                            parentEvent: mainEvent.event,
                        });

                        const tx1 = trackedEntitiesCollection.update(
                            childData.trackedEntity,
                            (draft) => {
                                draft.parentEntity =
                                    trackedEntity.trackedEntity;
                            },
                        );

                        await tx1.isPersisted.promise;

                        const tx2 = enrollmentsCollection.update(
                            childEnrollment.enrollment,
                            (draft) => {
                                draft.attributes = childData.attributes;
                            },
                        );
                        await tx2.isPersisted.promise;
                        const tx3 = eventsCollection.insert(childEvent);
                        await tx3.isPersisted.promise;

                        if (addAnother) {
                            closeChildModal();
                            await createChild();
                        }
                    }
                }}
                title="New Born Child"
                submitButtonText="Save Child"
            >
                {(form) => {
                    if (childData) {
                        return (
                            <TrackedEntityContext.Provider
                                key={childData.trackedEntity}
                                options={{
                                    input: {
                                        programRules,
                                        programRuleVariables,
                                        program: "ueBhWkWll5v",
                                        trackedEntity: childData,
                                        validDataElements:
                                            mainStageDataElements,
                                        form,
                                        trackedEntitiesCollection,
                                    },
                                }}
                            >
                                <Form
                                    form={form}
                                    layout="vertical"
                                    preserve={false}
                                >
                                    {childData ? (
                                        <TrackerRegistration
                                            trackedEntity={childData}
                                            form={form}
                                        />
                                    ) : null}
                                </Form>
                            </TrackedEntityContext.Provider>
                        );
                    }
                    return null;
                }}
            </DataModal>
        </Flex>
    );
}
