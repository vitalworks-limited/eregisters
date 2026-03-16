import { CalendarOutlined, CaretRightOutlined } from "@ant-design/icons";
import { createRoute } from "@tanstack/react-router";
import type { DescriptionsProps, TableProps } from "antd";

import { and, eq, useLiveSuspenseQuery } from "@tanstack/react-db";
import {
    Button,
    Card,
    Collapse,
    Descriptions,
    Flex,
    Form,
    Popconfirm,
    Space,
    Splitter,
    Table,
    Tag,
    Typography,
} from "antd";
import dayjs from "dayjs";
import React, { useMemo } from "react";
import { z } from "zod";
import { DataModal } from "../components/data-modal";
import MainEventCapture from "../components/main-event-capture";
import { Spinner } from "../components/spinner";
import { SyncStatusComp } from "../components/sync-status-comp";
import { TrackerRegistration } from "../components/tracker-registration";
import { useModalState } from "../hooks/useModalState";
import { EventContext, TrackedEntityContext } from "../machines";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
} from "../schemas";
import {
    createEmptyEnrollment,
    createEmptyEvent,
    createEmptyTrackedEntity,
} from "../utils/utils";
import { RootRoute } from "./__root";
import { SyncContext } from "../machines/sync";

export const TrackedEntityRoute = createRoute({
    getParentRoute: () => RootRoute,
    path: "/tracked-entity/$trackedEntity",
    component: TrackedEntityComponent,
    params: z.object({
        trackedEntity: z.string(),
    }),
    pendingComponent: Spinner,
});

const { Text } = Typography;

function TrackedEntityComponent() {
    const {
        enrollmentsCollection,
        trackedEntitiesCollection,
        eventsCollection,
    } = SyncContext.useSelector((a) => ({
        enrollmentsCollection: a.context.enrollmentsCollection,
        trackedEntitiesCollection: a.context.trackedEntitiesCollection,
        eventsCollection: a.context.eventsCollection,
    }));

    const syncActor = SyncContext.useActorRef();
    const { data, isOpen, openModal, closeModal } =
        useModalState<FlattenedEvent>();
    const {
        data: childData,
        isOpen: childIsOpen,
        enrollment: childEnrollment,
        openModal: openChildModal,
        closeModal: closeChildModal,
    } = useModalState<FlattenedTrackedEntity>();

    const {
        data: trackedEntityData,
        isOpen: trackedEntityIsOpen,
        openModal: openTrackedEntityModal,
        closeModal: closeTrackedEntityModal,
    } = useModalState<FlattenedTrackedEntity>();
    const {
        trackedEntityAttributes,
        orgUnit: { id },
        program,
        programRuleVariables,
        programRules,
    } = RootRoute.useLoaderData();
    const { trackedEntity: tei } = TrackedEntityRoute.useParams();
    const navigate = TrackedEntityRoute.useNavigate();
    const attributes = Array.from(trackedEntityAttributes.values());
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
    const keys: Map<string, string> = new Map(
        attributes?.map((attr) => [
            attr.id,
            attr.displayFormName || attr.name || "",
        ]),
    );
    const { data: events } = useLiveSuspenseQuery(
        (q) => {
            return q
                .from({ events: eventsCollection })
                .where(({ events }) =>
                    and(
                        eq(events.trackedEntity, tei),
                        eq(events.programStage, "K2nxbE9ubSs"),
                    ),
                )
                .orderBy(({ events }) => events.occurredAt, "desc");
        },
        [tei],
    );

    const { data: currentEvent } = useLiveSuspenseQuery(
        (q) => {
            return q
                .from({ events: eventsCollection })
                .where(({ events }) => eq(events.event, data?.event))
                .findOne();
        },
        [data?.event],
    );

    const { data: enrollment } = useLiveSuspenseQuery(
        (q) =>
            q
                .from({ enrollments: enrollmentsCollection })
                .where(({ enrollments }) => eq(enrollments.trackedEntity, tei))
                .findOne(),
        [tei],
    );

    const { data: trackedEntity } = useLiveSuspenseQuery(
        (q) =>
            q
                .from({ trackedEntity: trackedEntitiesCollection })
                .where(({ trackedEntity }) =>
                    eq(trackedEntity.trackedEntity, tei),
                )
                .findOne(),
        [tei],
    );

    if (trackedEntity === undefined || enrollment === undefined) {
        return <Text>No tracked Entity or Enrollment found</Text>;
    }
    const columns: TableProps<FlattenedEvent>["columns"] = useMemo(
        () => [
            {
                title: "ID",
                dataIndex: "event",
                key: "event",
            },
            {
                title: "Visit Date",
                dataIndex: ["dataValues", "occurredAt"],
                key: "date",
                render: (date) => dayjs(date).format("MMM DD, YYYY"),
            },
            {
                title: "Services",
                dataIndex: ["dataValues", "mrKZWf2WMIC"],
                key: "services",
                render: (text) => {
                    if (Array.isArray(text)) {
                        return (
                            <Flex gap="small" align="center" wrap>
                                {text.map((tag) => {
                                    return (
                                        <Tag key={tag} color="blue">
                                            {tag.toUpperCase()}
                                        </Tag>
                                    );
                                })}
                            </Flex>
                        );
                    }

                    if (!text || typeof text !== "string") return null;

                    return (
                        <Flex gap="small" align="center" wrap>
                            {text.split(",").map((tag) => {
                                return (
                                    <Tag key={tag} color="blue">
                                        {tag.toUpperCase()}
                                    </Tag>
                                );
                            })}
                        </Flex>
                    );
                },
            },
            {
                title: "Immunization",
                dataIndex: ["dataValues", "ZuYU54N4pjS"],
                key: "immunization",
                render: (text) => {
                    if (Array.isArray(text)) {
                        return (
                            <Flex gap="small" align="center" wrap>
                                {text.map((tag) => {
                                    return (
                                        <Tag key={tag} color="green">
                                            {tag.toUpperCase()}
                                        </Tag>
                                    );
                                })}
                            </Flex>
                        );
                    }

                    if (!text || typeof text !== "string") return null;

                    return (
                        <Flex gap="small" align="center" wrap>
                            {text.split(",").map((tag) => {
                                return (
                                    <Tag key={tag} color="green">
                                        {tag.toUpperCase()}
                                    </Tag>
                                );
                            })}
                        </Flex>
                    );
                },
            },
            {
                title: "Sync Status",
                dataIndex: "syncStatus",
                key: "syncStatus",
                width: 120,
                render: (text) => <SyncStatusComp syncStatus={text} />,
            },
            {
                title: "Action",
                key: "action",
                width: 100,
                render: (_, record) => (
                    <Flex gap="small" align="center">
                        <Button
                            onClick={async () => {
                                openModal(record, enrollment);
                            }}
                        >
                            Edit Event
                        </Button>
                        <Popconfirm
                            title="Delete Event"
                            description="Are you sure you want to delete this event? This will sync the deletion to DHIS2."
                            okText="Delete"
                            okType="danger"
                            onConfirm={async () => {
                                const tx = eventsCollection.update(
                                    record.event,
                                    (draft) => {
                                        draft.syncStatus = "deleted";
                                    },
                                );
                                await tx.isPersisted.promise;
                            }}
                        >
                            <Button danger>Delete</Button>
                        </Popconfirm>
                    </Flex>
                ),
            },
        ],
        [enrollment],
    );
    const items: DescriptionsProps["items"] = Object.entries({
        ...enrollment.attributes,
        ...trackedEntity.attributes,
    }).map(([key, value]) => ({
        key: key,
        label: keys.get(key) || key,
        children: <Text>{String(value)}</Text>,
    }));

    const handleCreate = async () => {
        const newEvent = createEmptyEvent({
            trackedEntity: trackedEntity.trackedEntity,
            program: enrollment.program,
            orgUnit: enrollment.orgUnit,
            enrollment: enrollment.enrollment,
            programStage: "K2nxbE9ubSs",
        });
        const tx = eventsCollection.insert(newEvent);
        await tx.isPersisted.promise;
        openModal(newEvent, enrollment);
    };

    const createPatientAndLink = (allValues: Record<string, any>) => {
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
            if (
                trackedEntity.attributes &&
                trackedEntity.attributes[attributeId]
            ) {
                autoPopulatedAttributes[attributeId] =
                    trackedEntity.attributes[attributeId];
            }
        });
        const mappedAttributes: Record<string, any> = {};
        Object.entries(dataElementToAttributeMap).forEach(
            ([dataElementId, attributeId]) => {
                if (allValues[dataElementId]) {
                    let value = allValues[dataElementId];
                    if (
                        value &&
                        typeof value === "object" &&
                        "format" in value
                    ) {
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
                    combinedValues[targetAttrId] = values.join(
                        separator || " ",
                    );
                }
            },
        );
        const initialValues = {
            ...autoPopulatedAttributes,
            ...mappedAttributes,
            ...combinedValues,
            occurredAt: allValues["occurredAt"],
            enrolledAt: allValues["occurredAt"],
        };
				console.log(allValues)
        const newPatient: FlattenedTrackedEntity = createEmptyTrackedEntity({
            orgUnit: id,
            attributes: initialValues,
            parentEntity: trackedEntity.trackedEntity,
        });
        const newEnrollment: FlattenedEnrollment = createEmptyEnrollment({
            orgUnit: id,
            trackedEntity: newPatient.trackedEntity,
        });
        return { client: newPatient, enrollment: newEnrollment };
    };

    const onValueChange = async (
        change: any,
        allValues: Record<string, any>,
    ) => {
        if (change && change["REWqohCg4Km"] === "Yes") {
            const { client, enrollment } = createPatientAndLink(allValues);
            await trackedEntitiesCollection.utils.insertLocally(client);
            await enrollmentsCollection.utils.insertLocally(enrollment);
            openChildModal(client, enrollment);
        }
    };

    return (
        <>
            <Splitter style={{ height: "calc(100vh - 48px)" }}>
                <Splitter.Panel style={{ padding: 10 }}>
                    <Flex vertical gap="16px">
                        <Flex>
                            <Button
                                onClick={() => {
                                    navigate({ to: "/tracked-entities" });
                                }}
                            >
                                Back
                            </Button>
                        </Flex>
                        <Card
                            title={
                                <Space>
                                    <CalendarOutlined />
                                    <span>Client Visits</span>
                                    {!navigator.onLine && (
                                        <Tag color="orange">Offline</Tag>
                                    )}
                                </Space>
                            }
                            extra={
                                <Button onClick={() => handleCreate()}>
                                    Add new visit
                                </Button>
                            }
                        >
                            <Table
                                columns={columns}
                                dataSource={events}
                                pagination={false}
                                rowKey="event"
                                scroll={{ x: "max-content" }}
                            />
                        </Card>
                    </Flex>
                </Splitter.Panel>

                <Splitter.Panel
                    defaultSize="25%"
                    collapsible={{
                        start: true,
                        end: true,
                        showCollapsibleIcon: true,
                    }}
                    style={{ padding: 10 }}
                >
                    <Flex vertical gap="16px">
                        <Collapse
                            expandIcon={({ isActive }) => (
                                <CaretRightOutlined
                                    rotate={isActive ? 90 : 0}
                                />
                            )}
                            items={[
                                {
                                    key: "2",
                                    label: "Notes about this enrollment",
                                    children: <p></p>,
                                    extra: <Button>Edit</Button>,
                                },
                            ]}
                        />
                        <Collapse
                            expandIcon={({ isActive }) => (
                                <CaretRightOutlined
                                    rotate={isActive ? 90 : 0}
                                />
                            )}
                            items={[
                                {
                                    key: "1",
                                    label: "Person Profile",
                                    children: (
                                        <Descriptions
                                            bordered
                                            column={1}
                                            items={items}
                                        />
                                    ),
                                    extra: (
                                        <Button
                                            onClick={() =>
                                                openTrackedEntityModal(
                                                    {
                                                        ...trackedEntity,
                                                        attributes: {
                                                            ...trackedEntity.attributes,
                                                            enrolledAt:
                                                                enrollment.enrolledAt,
                                                            ...enrollment.attributes,
                                                        },
                                                    },
                                                    enrollment,
                                                )
                                            }
                                        >
                                            Edit
                                        </Button>
                                    ),
                                },
                            ]}
                            styles={{ body: { padding: 0, margin: 0 } }}
                        />
                        <Collapse
                            expandIcon={({ isActive }) => (
                                <CaretRightOutlined
                                    rotate={isActive ? 90 : 0}
                                />
                            )}
                            items={[
                                {
                                    key: "2",
                                    label: "Enrollment",
                                    children: (
                                        <Descriptions
                                            column={1}
                                            items={[
                                                {
                                                    label: "Enrollment Date",
                                                    children: (
                                                        <Text>
                                                            {
                                                                enrollment?.enrolledAt
                                                            }
                                                        </Text>
                                                    ),
                                                },
                                                {
                                                    label: "Status",
                                                    children: (
                                                        <Text>
                                                            {enrollment?.status}
                                                        </Text>
                                                    ),
                                                },
                                            ]}
                                        />
                                    ),
                                    extra: <Button>Edit</Button>,
                                },
                            ]}
                        />
                    </Flex>
                </Splitter.Panel>
            </Splitter>

            <DataModal<FlattenedEvent>
                open={isOpen}
                status={currentEvent?.syncStatus}
                data={data}
                onClose={() => {
                    closeModal();
                }}
                enrollment={enrollment}
                onSave={async ({ values }) => {
                    if (values && data && enrollment) {
                        const tx = eventsCollection.update(
                            data.event,
                            (draft) => {
                                draft.dataValues = {
                                    ...data.dataValues,
                                    ...values,
                                };
                                draft.syncStatus = "pending";
                            },
                        );
                        await tx.isPersisted.promise;

                        syncActor.send({
                            type: "SYNC_ENTITIES",
                            entities: [
                                {
                                    ...data,
                                    dataValues: {
                                        ...data.dataValues,
                                        ...values,
                                    },
                                    syncStatus: "pending",
                                },
                            ],
                        });
                    }
                }}
                title="New Visit"
                submitButtonText="Save Visit"
            >
                {(form) => {
                    if (data) {
                        return (
                            <EventContext.Provider
                                options={{
                                    input: {
                                        programRules,
                                        programRuleVariables,
                                        enrollment,
                                        event: data,
                                        program: "ueBhWkWll5v",
                                        programStage: "K2nxbE9ubSs",
                                        trackedEntity,
                                        validDataElements:
                                            mainStageDataElements,
                                        form,
                                        eventsCollection,
                                    },
                                }}
                            >
                                <Form
                                    form={form}
                                    layout="vertical"
                                    preserve={false}
                                    onValuesChange={onValueChange}
                                >
                                    <MainEventCapture
                                        form={form}
                                        enrollment={enrollment}
                                        trackedEntity={trackedEntity}
                                        mainEvent={data}
                                    />
                                </Form>
                            </EventContext.Provider>
                        );
                    }
                    return null;
                }}
            </DataModal>

            <DataModal<FlattenedTrackedEntity>
                open={childIsOpen}
                data={childData}
                onClose={closeChildModal}
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
                            parentEvent: data?.event ?? "",
                        });

                        const tx1 = trackedEntitiesCollection.update(
                            childData.trackedEntity,
                            (draft) => {
                                draft.parentEntity =
                                    trackedEntity.trackedEntity;
                                draft.syncStatus = "pending";
                            },
                        );

                        await tx1.isPersisted.promise;

                        const tx2 = enrollmentsCollection.update(
                            childEnrollment.enrollment,
                            (draft) => {
                                draft.attributes = childData.attributes;
                                draft.syncStatus = "pending";
                            },
                        );
                        await tx2.isPersisted.promise;
                        const tx3 = eventsCollection.insert({
                            ...childEvent,
                            syncStatus: "pending",
                        });
                        await tx3.isPersisted.promise;

                        syncActor.send({
                            type: "SYNC_ENTITIES",
                            entities: [
                                {
                                    ...childData,
                                    attributes: {
                                        ...childData.attributes,
                                        ...values,
                                    },
                                    syncStatus: "pending",
                                },
                                {
                                    ...childEnrollment,
                                    attributes: {
                                        ...childEnrollment.attributes,
                                        ...values,
                                    },
                                    syncStatus: "pending",
                                },
                                {
                                    ...childEvent,
                                    syncStatus: "pending",
                                },
                            ],
                        });

                        if (addAnother) {
                            closeChildModal();

                            const { client, enrollment } =
                                createPatientAndLink(values);
                            await trackedEntitiesCollection.utils.insertLocally(
                                client,
                            );
                            await enrollmentsCollection.utils.insertLocally(
                                enrollment,
                            );
                            openChildModal(client, enrollment);
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

            <DataModal<FlattenedTrackedEntity>
                open={trackedEntityIsOpen}
                data={trackedEntityData}
                onClose={closeTrackedEntityModal}
                enrollment={enrollment}
                onSave={async ({ values }) => {
                    if (trackedEntityData && values) {
                        const tx1 = trackedEntitiesCollection.update(
                            trackedEntityData.trackedEntity,
                            (draft) => {
                                draft.attributes = {
                                    ...trackedEntityData.attributes,
                                    ...values,
                                };
                                draft.syncStatus = "pending";
                            },
                        );
                        await tx1.isPersisted.promise;

                        syncActor.send({
                            type: "SYNC_ENTITIES",
                            entities: [
                                {
                                    ...trackedEntityData,
                                    attributes: {
                                        ...trackedEntityData.attributes,
                                        ...values,
                                    },
                                    syncStatus: "pending",
                                },
                            ],
                        });
                    }
                }}
                title="Edit Client"
                submitButtonText="Save Client"
            >
                {(form) => (
                    <TrackedEntityContext.Provider
                        options={{
                            input: {
                                programRules,
                                programRuleVariables,
                                program: "ueBhWkWll5v",
                                trackedEntity,
                                validDataElements: mainStageDataElements,
                                form,
                                trackedEntitiesCollection,
                            },
                        }}
                    >
                        <Form form={form} layout="vertical" preserve={false}>
                            <TrackerRegistration
                                trackedEntity={trackedEntity}
                                form={form}
                            />
                        </Form>
                    </TrackedEntityContext.Provider>
                )}
            </DataModal>
        </>
    );
}
