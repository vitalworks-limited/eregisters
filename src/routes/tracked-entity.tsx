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
    Modal,
    Space,
    Splitter,
    Table,
    Tag,
    Typography,
} from "antd";
import dayjs from "dayjs";
import { z } from "zod";
import { useLiveQuery } from "dexie-react-hooks";
import React, { useMemo } from "react";
import { DataModal } from "../components/data-modal";
import MainEventCapture from "../components/main-event-capture";
import { TrackerRegistration } from "../components/tracker-registration";
import { db, FlattenedEvent } from "../db";
import { useModalState } from "../hooks/useModalState";
import { FlattenedTrackedEntity } from "../schemas";
import { generateUid } from "../utils/id";
import { createEmptyEvent, createEmptyTrackedEntity } from "../utils/utils";
import { RootRoute } from "./__root";
export const TrackedEntityRoute = createRoute({
    getParentRoute: () => RootRoute,
    path: "/tracked-entity/$trackedEntity",
    component: TrackedEntity,
    params: z.object({
        trackedEntity: z.string(),
    }),
    loader: async ({ params: { trackedEntity } }) => {
        const current = await db.trackedEntities.get(trackedEntity);
        if (!current) {
            throw new Error("Tracked entity not found in local database");
        }
        return current;
    },
});

const { Text } = Typography;

function TrackedEntity() {
    const {
        orgUnit: { id },
    } = RootRoute.useRouteContext();
    const { data, isOpen, openModal, closeModal } =
        useModalState<FlattenedEvent>();

    const {
        data: childData,
        isOpen: childIsOpen,
        openModal: openChildModal,
        closeModal: closeChildModal,
    } = useModalState<FlattenedTrackedEntity>();
    const { trackedEntityAttributes } = RootRoute.useLoaderData();
    const navigate = TrackedEntityRoute.useNavigate();
    const trackedEntity = TrackedEntityRoute.useLoaderData();
    const enrollment = trackedEntity.enrollment;
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
            },
            {
                title: "Action",
                key: "action",
                width: 100,
                render: (_, record) => (
                    <Flex gap="small" align="center">
                        <Button
                            onClick={() =>
                                openModal({
                                    ...record,
                                    dataValues: {
                                        ...record.dataValues,
                                        occurredAt: record.occurredAt,
                                    },
                                })
                            }
                        >
                            Edit Event
                        </Button>
                        <Button
                            danger
                            onClick={() => {
                                Modal.confirm({
                                    title: "Delete Event",
                                    content:
                                        "Are you sure you want to delete this event? This action cannot be undone.",
                                    okText: "Delete",
                                    okType: "danger",
                                    onOk: async () => {
                                        try {
                                            await db.events.delete(
                                                record.event,
                                            );
                                            message.success(
                                                "Event deleted successfully",
                                            );
                                        } catch (error) {
                                            console.error(
                                                "Failed to delete event:",
                                                error,
                                            );
                                            message.error(
                                                "Failed to delete event",
                                            );
                                        }
                                    },
                                });
                            }}
                        >
                            Delete
                        </Button>
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
        openModal(newEvent);
    };

    const onValueChange = async (change: any) => {
        if (change && change["REWqohCg4Km"] === "Yes") {
            const newPatient: FlattenedTrackedEntity = createEmptyTrackedEntity(
                { orgUnit: id },
            );
            openChildModal(newPatient);
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
                onSave={async (values) => {
                    if (values && data) {
                        await db.events.update(data.event, {
                            syncStatus: "pending",
                        });
                    }
                }}
                title="New Visit"
                submitButtonText="Save Visit"
                onValueChange={onValueChange}
            >
                {(form) => (
                    <MainEventCapture
                        form={form}
                        trackedEntity={trackedEntity}
                        mainEvent={data!}
                    />
                )}
            </DataModal>

            <DataModal<FlattenedTrackedEntity>
                open={childIsOpen}
                data={childData}
                onClose={closeChildModal}
                hasAddAnother={true}
                onSave={async (values, addAnother) => {
                    if (values && childData) {
                        await db.trackedEntities.put({
                            ...childData,
                            attributes: {
                                ...childData.attributes,
                                ...values,
                            },
                            syncStatus: "pending",
                        });

                        const childEvent = createEmptyEvent({
                            trackedEntity: childData.trackedEntity,
                            program: childData.enrollment.program,
                            orgUnit: childData.orgUnit,
                            enrollment: childData.enrollment.enrollment,
                            programStage: "K2nxbE9ubSs",
                        });
                        await db.events.put(childEvent);
                        await db.relationships.bulkPut([
                            {
                                relationshipType: "vDnDNhGRzzy",
                                relationship: generateUid(),
                                from: {
                                    id: trackedEntity.trackedEntity,
                                    fields: trackedEntity.attributes,
                                },
                                to: {
                                    id: childData.trackedEntity,
                                    fields: values,
                                },
                                syncStatus: "pending",
                                createdAt: new Date().toISOString(),
                                lastSynced: new Date().toISOString(),
                                syncError: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                                version: 1,
                            },
                            {
                                relationshipType: "N2t9W26bKp7",
                                relationship: generateUid(),
                                from: {
                                    id: data?.event || "",
                                    fields: data?.dataValues || {},
                                },
                                to: {
                                    id: childEvent.event,
                                    fields: childEvent.dataValues || {},
                                },
                                syncStatus: "pending",
                                createdAt: new Date().toISOString(),
                                lastSynced: new Date().toISOString(),
                                syncError: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                                version: 1,
                            },
                        ]);
                    }
                    if (addAnother) {
                        const newPatient: FlattenedTrackedEntity =
                            createEmptyTrackedEntity({
                                orgUnit: id,
                            });
                        openChildModal(newPatient);
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
