import {
    CalendarOutlined,
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    PrinterOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { createRoute, Link } from "@tanstack/react-router";
import type { DescriptionsProps, TableProps } from "antd";

import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
import {
    Avatar,
    Breadcrumb,
    Button,
    Descriptions,
    Flex,
    Form,
    Grid,
    Popconfirm,
    Tabs,
    Table,
    Tag,
    theme,
    Typography,
} from "antd";
import { EmptyState } from "../components/empty-state";
import dayjs from "dayjs";
import { Table as DexieTable } from "dexie";
import { isEmpty } from "lodash";
import React, { useMemo } from "react";
import { z } from "zod";
import {
    enrollmentsCollection,
    eventsCollection,
    trackedEntitiesCollection,
} from "../collections";
import { DataModal } from "../components/data-modal";
import MainEventCapture from "../components/main-event-capture";
import { Spinner } from "../components/spinner";
import { SyncStatusComp } from "../components/sync-status-comp";
import { TrackerRegistration } from "../components/tracker-registration";
import { useMetadata } from "../hooks/useMetadata";
import { useModalState } from "../hooks/useModalState";
import { EventContext, TrackedEntityContext } from "../machines";
import { SyncContext } from "../machines/sync";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
} from "../schemas";
import {
    cancelDataModal,
    createEmptyEvent,
    deleteEventWithChildren,
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
});

const { Text, Title } = Typography;

function renderTags(text: string | string[] | undefined, color: string) {
    if (!text) return null;
    const tags = Array.isArray(text) ? text : text.split(",");
    return (
        <Flex gap="small" align="center" wrap>
            {tags.map((tag) => (
                <Tag key={tag} color={color}>
                    {tag.toUpperCase()}
                </Tag>
            ))}
        </Flex>
    );
}

function TrackedEntityComponent() {
    const syncActor = SyncContext.useActorRef();
    const { token } = theme.useToken();
    const { data, isOpen, isNew, openModal, closeModal } =
        useModalState<FlattenedEvent>();

    const {
        data: trackedEntityData,
        isOpen: trackedEntityIsOpen,
        openModal: openTrackedEntityModal,
        closeModal: closeTrackedEntityModal,
    } = useModalState<FlattenedTrackedEntity>();
    const {
        trackedEntityAttributes,
        orgUnit,
        program,
        programRuleVariables,
        programRules,
    } = useMetadata();
    const { trackedEntity: tei } = TrackedEntityRoute.useParams();
    const attributes = Array.from(trackedEntityAttributes.values());
    const mainStage = program?.programStages.find(
        (s) => s.id === "K2nxbE9ubSs",
    );
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
                        eq(events.orgUnit, orgUnit?.id),
                        not(eq(events.syncStatus, "deleted")),
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
                .where(({ events }) =>
                    and(
                        eq(events.event, data?.event),
                        eq(events.orgUnit, orgUnit?.id),
                        not(eq(events.syncStatus, "deleted")),
                    ),
                )
                .findOne();
        },
        [data?.event],
    );

    const { data: enrollment } = useLiveSuspenseQuery(
        (q) =>
            q
                .from({ enrollments: enrollmentsCollection })
                .where(({ enrollments }) =>
                    and(
                        eq(enrollments.trackedEntity, tei),
                        eq(enrollments.orgUnit, orgUnit?.id),
                    ),
                )
                .findOne(),
        [tei],
    );

    const { data: trackedEntity } = useLiveSuspenseQuery(
        (q) =>
            q
                .from({ trackedEntity: trackedEntitiesCollection })
                .where(({ trackedEntity }) =>
                    and(
                        eq(trackedEntity.trackedEntity, tei),
                        eq(trackedEntity.orgUnit, orgUnit?.id),
                    ),
                )
                .findOne(),
        [tei],
    );

    const screens = Grid.useBreakpoint();
    const isMobile = !screens.lg;

    if (trackedEntity === undefined || enrollment === undefined) {
        return <Text>No tracked Entity or Enrollment found</Text>;
    }

    const firstName = String(trackedEntity.attributes?.["KSq9EyZ8ZFi"] ?? "");
    const surname = String(trackedEntity.attributes?.["TWPNbc9O2nK"] ?? "");
    const sex = String(trackedEntity.attributes?.["bqliZKdUGMX"] ?? "");
    const dob = trackedEntity.attributes?.["Y3DE5CZWySr"];
    const age = dob ? dayjs().diff(dayjs(String(dob)), "year") : null;

    const columns: TableProps<FlattenedEvent>["columns"] = useMemo(
        () => [
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
                render: (text) => renderTags(text, "blue"),
                width: "300px",
            },
            {
                title: "Immunization",
                dataIndex: ["dataValues", "ZuYU54N4pjS"],
                key: "immunization",
                render: (text) => renderTags(text, "green"),
                width: "300px",
            },
            {
                title: "Referral",
                dataIndex: ["dataValues", "EzGu4kzZZTz"],
                key: "referral",
            },
            {
                title: "Weight",
                dataIndex: ["dataValues", "scpPwoNsS27"],
                key: "weight",
            },
            {
                title: "Height",
                dataIndex: ["dataValues", "uIFJ94mZt0S"],
                key: "height",
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
                            icon={<EditOutlined />}
                            onClick={async () => {
                                openModal(record, enrollment);
                            }}
                        >
                            Edit
                        </Button>
                        <Popconfirm
                            title="Delete Event"
                            description="Are you sure you want to delete this event? This will sync the deletion to DHIS2."
                            okText="Delete"
                            okType="danger"
                            onConfirm={async () => {
                                try {
                                    const { markedDeleted } =
                                        await deleteEventWithChildren(
                                            record.event,
                                        );
                                    if (markedDeleted.length > 0) {
                                        syncActor.send({ type: "PUSH_DATA" });
                                    }
                                } catch (error) {
                                    console.error(
                                        "Failed to delete event:",
                                        error,
                                    );
                                }
                            }}
                        >
                            <Button danger icon={<DeleteOutlined />}>
                                Delete
                            </Button>
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
    }).flatMap(([key, value]) => {
        if (isEmpty(value)) {
            return [];
        }
        return {
            key,
            label: keys.get(key) || key,
            children: <Text>{String(value)}</Text>,
        };
    });

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
        openModal(newEvent, enrollment, true);
    };

    const initials = `${firstName.charAt(0)}${surname.charAt(0)}`.toUpperCase();

    const openEditProfile = () =>
        openTrackedEntityModal(
            {
                ...trackedEntity,
                attributes: {
                    ...trackedEntity.attributes,
                    enrolledAt: enrollment.enrolledAt,
                    ...enrollment.attributes,
                },
            },
            enrollment,
        );

    const visitsPane = (
        <Flex vertical gap={token.marginSM}>
            <Flex align="center" justify="space-between" wrap gap={token.marginSM}>
                <Text type="secondary">
                    {events.length} visit{events.length === 1 ? "" : "s"} recorded
                </Text>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleCreate}
                >
                    Add new visit
                </Button>
            </Flex>
            {events.length === 0 ? (
                <EmptyState
                    title="No visits yet"
                    description='Use "Add new visit" above to record one.'
                />
            ) : (
                <div
                    style={{
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    <Table
                        columns={columns}
                        dataSource={events}
                        pagination={false}
                        rowKey="event"
                        size="middle"
                        sticky
                        scroll={{ x: "max-content" }}
                    />
                </div>
            )}
        </Flex>
    );

    const enrollmentPane = (
        <div
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
            }}
        >
            <Flex
                align="center"
                justify="space-between"
                style={{
                    padding: `${token.paddingSM}px ${token.padding}px`,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Text strong>Person profile</Text>
                <Button
                    icon={<EditOutlined />}
                    size="small"
                    onClick={openEditProfile}
                >
                    Edit
                </Button>
            </Flex>
            <Descriptions
                bordered={false}
                column={isMobile ? 1 : 2}
                items={items}
                style={{ padding: token.padding }}
                colon={false}
                styles={{
                    label: {
                        color: token.colorTextSecondary,
                        width: 220,
                        fontWeight: 500,
                    },
                }}
            />
        </div>
    );

    const overviewPane = (
        <EmptyState
            title="Overview"
            description="Last visit summary, key vitals, and pending follow-ups will appear here."
        />
    );

    return (
        <Flex vertical gap={0}>
            <div
                style={{
                    background: token.colorBgContainer,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    paddingBlock: token.paddingXS,
                    paddingInline: token.padding,
                }}
            >
                <Breadcrumb
                    items={[
                        {
                            title: (
                                <Link to="/tracked-entities">Patients</Link>
                            ),
                        },
                        {
                            title: `${firstName ?? ""} ${surname ?? ""}`.trim(),
                        },
                    ]}
                />
            </div>
            <div
                style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    background: token.colorBgContainer,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    paddingBlock: token.paddingSM,
                    paddingInline: token.padding,
                }}
            >
                <Flex
                    align={isMobile ? "flex-start" : "center"}
                    justify="space-between"
                    gap={token.marginSM}
                    wrap
                    vertical={isMobile}
                >
                    <Flex align="center" gap={token.marginSM} wrap>
                        <Avatar
                            shape="square"
                            size={isMobile ? 36 : 44}
                            style={{
                                backgroundColor: token.colorPrimary,
                                fontWeight: 600,
                            }}
                        >
                            {initials || <UserOutlined />}
                        </Avatar>
                        <Flex vertical gap={token.marginXXS}>
                            <Title
                                level={isMobile ? 5 : 4}
                                style={{ margin: 0, lineHeight: 1.2 }}
                            >
                                {firstName} {surname}
                            </Title>
                            <Flex
                                gap={token.marginXS}
                                align="center"
                                wrap
                            >
                                {sex && <Tag>{sex}</Tag>}
                                {age !== null && <Tag>{age} yrs</Tag>}
                                <SyncStatusComp
                                    syncStatus={trackedEntity.syncStatus}
                                />
                            </Flex>
                        </Flex>
                    </Flex>
                    <Flex gap={token.marginXS} wrap>
                        <Button
                            icon={<EditOutlined />}
                            onClick={openEditProfile}
                        >
                            Edit details
                        </Button>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleCreate}
                        >
                            New visit
                        </Button>
                        <Button
                            icon={<PrinterOutlined />}
                            onClick={() => window.print()}
                            aria-label="Print summary"
                        />
                    </Flex>
                </Flex>
            </div>

            <div
                style={{
                    padding: isMobile ? token.paddingSM : token.padding,
                }}
            >
                <Tabs
                    defaultActiveKey="visits"
                    items={[
                        {
                            key: "overview",
                            label: (
                                <span>
                                    <UserOutlined /> Overview
                                </span>
                            ),
                            children: overviewPane,
                        },
                        {
                            key: "visits",
                            label: (
                                <span>
                                    <CalendarOutlined /> Visits
                                </span>
                            ),
                            children: visitsPane,
                        },
                        {
                            key: "enrollment",
                            label: (
                                <span>
                                    <UserOutlined /> Enrollment
                                </span>
                            ),
                            children: enrollmentPane,
                        },
                    ]}
                />
            </div>

            <DataModal<FlattenedEvent>
                open={isOpen}
                status={currentEvent?.syncStatus}
                data={data}
                onClose={() => {
                    closeModal();
                }}
                onCancel={() => cancelDataModal(data!)}
                enrollment={enrollment}
                onSave={async ({ values }) => {
                    if (values && data && enrollment) {
                        const eventTable: DexieTable<FlattenedEvent, string> =
                            eventsCollection.utils.getTable();

                        const trackedEntityTable: DexieTable<
                            FlattenedTrackedEntity,
                            string
                        > = trackedEntitiesCollection.utils.getTable();

                        const enrollmentTable: DexieTable<
                            FlattenedEnrollment,
                            string
                        > = enrollmentsCollection.utils.getTable();

                        const allRelatedEvents = await eventTable
                            .filter((a) => a.parentEvent === data.event)
                            .toArray();

                        // const allMainEvents = await eventTable
                        //     .filter(
                        //         (a) =>
                        //             a.trackedEntity === tei &&
                        //             a.programStage === "K2nxbE9ubSs" &&
                        //             a.orgUnit === enrollment.orgUnit &&
                        //             a.syncStatus !== "deleted" &&
                        //             // a.dataValues["zxJ9SDZtKUS"] <= 1,
                        //             a.dataValues["occurredAt"] <
                        //                 values["occurredAt"],
                        //     )
                        //     .toArray();

                        // const currentVaccinations = values["ZuYU54N4pjS"] ?? "";

                        // console.log(currentVaccinations)

                        // const evs = [
                        //     ...allMainEvents
                        //         .flatMap(
                        //             (a) => a.dataValues["ZuYU54N4pjS"] ?? [],
                        //         )
                        //         .join(",")
                        //         .split(","),

                        //     ...(currentVaccinations
                        //         ? currentVaccinations.split(",")
                        //         : []),
                        // ];

                        // console.log(evs);

                        const relatedEvents = allRelatedEvents.filter(
                            (a) => a.syncStatus !== "synced",
                        );

                        const relatedTrackedEntities = await trackedEntityTable
                            .filter(
                                (te) =>
                                    te.parentEntity ===
                                        trackedEntity.trackedEntity &&
                                    te.syncStatus !== "synced",
                            )
                            .toArray();

                        const relatedEnrollments = await enrollmentTable
                            .filter((e) =>
                                relatedTrackedEntities
                                    .map((rt) => rt.trackedEntity)
                                    .includes(e.trackedEntity),
                            )
                            .toArray();

                        const entities: Array<
                            | FlattenedEvent
                            | FlattenedTrackedEntity
                            | FlattenedEnrollment
                        > = [
                            {
                                ...data,
                                dataValues: {
                                    ...data.dataValues,
                                    ...values,
                                },
                            },
                            ...relatedEvents,
                            ...relatedTrackedEntities,
                            ...relatedEnrollments,
                        ].map((a) => ({
                            ...a,
                            syncStatus: "pending",
                        }));
                        const payload = entities.flatMap((a) => {
                            if ("trackedEntityType" in a) {
                                const tx = trackedEntitiesCollection.update(
                                    a.trackedEntity,
                                    (draft) => {
                                        draft.syncStatus = a.syncStatus;
                                    },
                                );
                                return tx.isPersisted.promise;
                            } else if ("enrolledAt" in a) {
                                const tx = enrollmentsCollection.update(
                                    a.enrollment,
                                    (draft) => {
                                        draft.syncStatus = a.syncStatus;
                                    },
                                );
                                return tx.isPersisted.promise;
                            } else if ("event" in a) {
                                const tx = eventsCollection.update(
                                    a.event,
                                    (draft) => {
                                        draft.syncStatus = a.syncStatus;
                                    },
                                );
                                return tx.isPersisted.promise;
                            }
                            return [];
                        });
                        await Promise.all(payload);
                    }
                }}
                title={isNew ? "New Visit" : "Edit Visit"}
                submitButtonText="Save Visit"
                requiredFields={["occurredAt", "mrKZWf2WMIC"]}
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
                                    },
                                }}
                            >
                                <Form
                                    form={form}
                                    layout="vertical"
                                    preserve={false}
                                    initialValues={data?.dataValues}
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
                open={trackedEntityIsOpen}
                data={trackedEntityData}
                onClose={closeTrackedEntityModal}
                onCancel={() => cancelDataModal(trackedEntityData!)}
                enrollment={enrollment}
                onSave={async ({ values }) => {
                    if (trackedEntityData && values) {
                        const { enrolledAt, ...attributeValues } = values;

                        const tx1 = trackedEntitiesCollection.update(
                            trackedEntityData.trackedEntity,
                            (draft) => {
                                draft.attributes = {
                                    ...trackedEntityData.attributes,
                                    ...attributeValues,
                                };
                                draft.syncStatus = "pending";
                            },
                        );
                        await tx1.isPersisted.promise;

                        if (enrolledAt) {
                            const tx2 = enrollmentsCollection.update(
                                enrollment.enrollment,
                                (draft) => {
                                    draft.enrolledAt = enrolledAt;
                                    draft.syncStatus = "pending";
                                },
                            );
                            await tx2.isPersisted.promise;
                        }

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
                                trackedEntity: trackedEntityData!,
                                validDataElements: mainStageDataElements,
                                form,
                            },
                        }}
                    >
                        <Form
                            form={form}
                            layout="vertical"
                            preserve={false}
                            initialValues={trackedEntityData?.attributes}
                        >
                            <TrackerRegistration
                                trackedEntity={trackedEntityData!}
                                form={form}
                            />
                        </Form>
                    </TrackedEntityContext.Provider>
                )}
            </DataModal>
        </Flex>
    );
}
