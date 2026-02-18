import { CalendarOutlined, CaretRightOutlined } from "@ant-design/icons";
import { createRoute } from "@tanstack/react-router";
import type { DescriptionsProps, TableProps } from "antd";
import {
    Button,
    Card,
    Collapse,
    Descriptions,
    Flex,
    message,
    Popconfirm,
    Space,
    Splitter,
    Table,
    Tag,
    Typography,
} from "antd";
import dayjs from "dayjs";
import { useLiveQuery } from "dexie-react-hooks";
import React, { useMemo } from "react";
import { z } from "zod";
import { DataModal } from "../components/data-modal";
import MainEventCapture from "../components/main-event-capture";
import { Spinner } from "../components/spinner";
import { SyncStatusComp } from "../components/sync-status-comp";
import { TrackerRegistration } from "../components/tracker-registration";
import { db } from "../db";
import { useModalState } from "../hooks/useModalState";
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

export const TrackedEntityRoute = createRoute({
    getParentRoute: () => RootRoute,
    path: "/tracked-entity/$trackedEntity",
    component: TrackedEntityComponent,
    params: z.object({
        trackedEntity: z.string(),
    }),
    pendingComponent: Spinner,
    loader: async ({ params: { trackedEntity } }) => {
        const current = await db.trackedEntities.get(trackedEntity);
        if (!current) {
            throw new Error("Tracked entity not found in local database");
        }
        const enrollment = await db.enrollments
            .where({ trackedEntity })
            .first();

        if (!enrollment) {
            throw new Error("enrollment not found in local database");
        }

        return { trackedEntity: current, enrollment };
    },
});

const { Text } = Typography;

function TrackedEntityComponent() {
    const { data, isOpen, openModal, closeModal } =
        useModalState<FlattenedEvent>();
    const {
        data: childData,
        isOpen: childIsOpen,
        openModal: openChildModal,
        closeModal: closeChildModal,
    } = useModalState<FlattenedTrackedEntity>();
    const {
        trackedEntityAttributes,
        orgUnit: { id },
    } = RootRoute.useLoaderData();
    const navigate = TrackedEntityRoute.useNavigate();
    const { trackedEntity, enrollment } = TrackedEntityRoute.useLoaderData();
    const attributes = Array.from(trackedEntityAttributes.values());

    const keys: Map<string, string> = new Map(
        attributes?.map((attr) => [
            attr.id,
            attr.displayFormName || attr.name || "",
        ]),
    );
    const events =
        useLiveQuery(async () => {
            if (!trackedEntity.trackedEntity) return [];
            return await db.events
                .where("trackedEntity")
                .equals(trackedEntity.trackedEntity)
                .and((e) => e.programStage === "K2nxbE9ubSs")
                .toArray();
        }, [trackedEntity.trackedEntity]) || [];

    const columns: TableProps<FlattenedEvent>["columns"] = useMemo(
        () => [
            {
                title: "Date",
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
                        <Button onClick={() => openModal(record, enrollment)}>
                            Edit Event
                        </Button>
                        <Popconfirm
                            title="Delete Event"
                            description="Are you sure you want to delete this event? This action cannot be undone."
                            okText="Delete"
                            okType="danger"
                            onConfirm={async () => {
                                try {
                                    await db.events.delete(record.event);
                                    message.success(
                                        "Event deleted successfully",
                                    );
                                } catch (error) {
                                    console.error(
                                        "Failed to delete event:",
                                        error,
                                    );
                                    message.error("Failed to delete event");
                                }
                            }}
                        >
                            <Button danger>Delete</Button>
                        </Popconfirm>
                    </Flex>
                ),
            },
        ],
        [],
    );
    const items: DescriptionsProps["items"] = Object.entries(
        trackedEntity.attributes || {},
    ).map(([key, value]) => ({
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
        await db.events.put(newEvent);
        openModal(newEvent, enrollment);
    };

    const createPatientAndLink = async (allValues: Record<string, any>) => {
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
        Object.entries(combinedAttributes).forEach(([targetAttrId, config]) => {
            const values = config.sourceAttributes
                .map((attrId) => trackedEntity.attributes?.[attrId] || "")
                .filter((v) => v);
            if (values.length > 0) {
                combinedValues[targetAttrId] = values.join(
                    config.separator || " ",
                );
            }
        });
        const initialValues = {
            ...autoPopulatedAttributes,
            ...mappedAttributes,
            ...combinedValues,
            occurredAt: trackedEntity.attributes["occurredAt"],
            enrolledAt: mappedAttributes["Y3DE5CZWySr"],
        };
        const newPatient: FlattenedTrackedEntity = createEmptyTrackedEntity({
            orgUnit: id,
            attributes: initialValues,
            parentEntity: trackedEntity.trackedEntity,
        });
        const newEnrollment: FlattenedEnrollment = createEmptyEnrollment({
            orgUnit: id,
            trackedEntity: newPatient.trackedEntity,
        });
        await db.trackedEntities.put(newPatient);
        await db.enrollments.put(newEnrollment);
        return { client: newPatient, enrollment: newEnrollment };
    };

    const onValueChange = async (
        change: any,
        allValues: Record<string, any>,
    ) => {
        if (change && change["REWqohCg4Km"] === "Yes") {
            const { client, enrollment } =
                await createPatientAndLink(allValues);
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
                                <Button onClick={handleCreate}>
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
                                    extra: <Button>Edit</Button>,
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
                data={data}
                onClose={closeModal}
                enrollment={enrollment}
                onSave={async ({ values, enrollment }) => {
                    if (values && data && enrollment) {
                        await db.events.put({
                            ...data,
                            dataValues: { ...data.dataValues, ...values },
                            syncStatus: "pending",
                        });
                        const otherEvents = await db.events
                            .where("parentEvent")
                            .equals(data.event)
                            .filter((e) => e.syncStatus === "draft")
                            .toArray();
                        await Promise.all(
                            otherEvents.map((e) =>
                                db.events.update(e.event, {
                                    syncStatus: "pending",
                                }),
                            ),
                        );
                    }
                }}
                title="New Visit"
                submitButtonText="Save Visit"
                onValueChange={onValueChange}
            >
                {(form) => (
                    <MainEventCapture
                        form={form}
                        enrollment={enrollment}
                        trackedEntity={trackedEntity}
                        mainEvent={data!}
                        previousEvents={events
                            .filter((e) => e.event !== data?.event)
                            .sort((a, b) =>
                                a.occurredAt.localeCompare(b.occurredAt),
                            )}
                    />
                )}
            </DataModal>

            <DataModal<FlattenedTrackedEntity>
                open={childIsOpen}
                data={childData}
                onClose={closeChildModal}
                hasAddAnother={true}
                enrollment={enrollment}
                onSave={async ({ values, enrollment, addAnother }) => {
                    if (childData && values && enrollment) {
                        const child: FlattenedTrackedEntity = {
                            ...childData,
                            attributes: values,
                            syncStatus: "pending",
                            parentEntity: trackedEntity.trackedEntity,
                        };
                        const childEvent: FlattenedEvent = createEmptyEvent({
                            trackedEntity: childData.trackedEntity,
                            program: enrollment.program,
                            orgUnit: enrollment.orgUnit,
                            enrollment: enrollment.enrollment,
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

                        await db.trackedEntities.put(child);
                        await db.enrollments.put({
                            ...enrollment,
                            attributes: child.attributes,
                            syncStatus: "pending",
                        });
                        await db.events.put({
                            ...childEvent,
                            syncStatus: "pending",
                        });

                        if (addAnother) {
                            const { client, enrollment } =
                                await createPatientAndLink(values);
                            openChildModal(client, enrollment);
                        }
                    }
                }}
                title="New Born Child"
                submitButtonText="Save Child"
            >
                {(form) => (
                    <TrackerRegistration
                        trackedEntity={trackedEntity}
                        form={form}
                    />
                )}
            </DataModal>
        </>
    );
}
