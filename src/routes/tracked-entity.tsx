import {
    CalendarOutlined,
    ClockCircleOutlined,
    CloudUploadOutlined,
    DeleteOutlined,
    EditOutlined,
    EnvironmentOutlined,
    FileTextOutlined,
    HeartOutlined,
    IdcardOutlined,
    PhoneOutlined,
    PlusOutlined,
    PrinterOutlined,
    SafetyOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { createRoute, Link } from "@tanstack/react-router";
import type { DescriptionsProps, TableProps } from "antd";

import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
import {
    Avatar,
    Breadcrumb,
    Button,
    Col,
    Descriptions,
    Divider,
    Flex,
    Form,
    Grid,
    Popconfirm,
    Row,
    Tabs,
    Table,
    Tag,
    theme,
    Timeline,
    Typography,
} from "antd";
import { MiniSparkline } from "../components/charts";
import { EmptyState } from "../components/empty-state";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
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
import { markNextSyncManual } from "../sync/telemetry";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
} from "../schemas";
import { printPatientSummary } from "../utils/printPatientSummary";
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
                                        markNextSyncManual();
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
            </Flex>
            {events.length === 0 ? (
                <EmptyState
                    title="No visits yet"
                    description='Use "New visit" in the page header to record one.'
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

    const overviewPane = renderOverviewPane({
        token,
        trackedEntity,
        enrollment,
        events,
        firstName,
        surname,
        sex,
        age,
        onOpenVisit: (ev) => openModal(ev, enrollment),
        onCreateVisit: handleCreate,
    });

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
                            onClick={() =>
                                printPatientSummary({
                                    trackedEntity,
                                    enrollment,
                                    events,
                                    program: {
                                        programStages:
                                            program?.programStages?.map(
                                                (s) => ({
                                                    id: s.id,
                                                    name: s.name,
                                                }),
                                            ) ?? [],
                                    },
                                    facilityName: orgUnit?.name,
                                })
                            }
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

dayjs.extend(relativeTime);

interface OverviewArgs {
    token: ReturnType<typeof theme.useToken>["token"];
    trackedEntity: FlattenedTrackedEntity;
    enrollment: FlattenedEnrollment;
    events: FlattenedEvent[];
    firstName: string;
    surname: string;
    sex: string;
    age: number | null;
    onOpenVisit: (ev: FlattenedEvent) => void;
    onCreateVisit: () => void;
}

const DV = {
    services: "mrKZWf2WMIC",
    immunization: "ZuYU54N4pjS",
    referral: "EzGu4kzZZTz",
    weight: "scpPwoNsS27",
    height: "uIFJ94mZt0S",
} as const;

const ATTR = {
    nin: "BiTsLcJQ95V",
    phone: "sB1IHYu2xQT",
    clientId: "oTI0DLitzFY",
    village: "xcYGVzmcWvi",
    dob: "Y3DE5CZWySr",
    category: "N6Y4aCbmHHt",
} as const;

function tagsFrom(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
    return String(value)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

function parseNumber(value: unknown): number | undefined {
    if (typeof value === "number" && !Number.isNaN(value)) return value;
    if (typeof value === "string") {
        const n = parseFloat(value);
        if (!Number.isNaN(n)) return n;
    }
    return undefined;
}

function bmiCategory(bmi: number): { label: string; color: string } {
    if (bmi < 18.5) return { label: "Underweight", color: "gold" };
    if (bmi < 25) return { label: "Normal", color: "green" };
    if (bmi < 30) return { label: "Overweight", color: "orange" };
    return { label: "Obese", color: "red" };
}

function VitalRow({
    label,
    value,
    unit,
    series,
    accent,
    token,
}: {
    label: string;
    value: number | undefined;
    unit: string;
    series: number[];
    accent: string;
    token: OverviewArgs["token"];
}) {
    const { Text } = Typography;
    return (
        <Flex align="center" justify="space-between" gap={token.marginSM}>
            <Flex vertical gap={0} style={{ minWidth: 0 }}>
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {label}
                </Text>
                <Flex align="baseline" gap={token.marginXXS}>
                    <span
                        style={{
                            fontSize: 22,
                            fontWeight: 600,
                            color:
                                value === undefined
                                    ? token.colorTextTertiary
                                    : token.colorTextBase,
                            lineHeight: 1.1,
                        }}
                    >
                        {value === undefined ? "—" : value}
                    </span>
                    {value !== undefined && (
                        <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                        >
                            {unit}
                        </Text>
                    )}
                </Flex>
            </Flex>
            {series.length > 1 && (
                <MiniSparkline values={series} color={accent} width={96} height={32} />
            )}
        </Flex>
    );
}

function renderOverviewPane({
    token,
    trackedEntity,
    enrollment,
    events,
    firstName,
    surname,
    sex,
    age,
    onOpenVisit,
    onCreateVisit,
}: OverviewArgs) {
    const { Title, Text } = Typography;
    const lastVisit = events[0];
    const last30 = events.filter((e) =>
        dayjs(e.occurredAt ?? e.createdAt).isAfter(dayjs().subtract(30, "day")),
    ).length;
    const pendingRecords =
        (trackedEntity.syncStatus === "pending" ? 1 : 0) +
        (enrollment.syncStatus === "pending" ? 1 : 0) +
        events.filter((e) => e.syncStatus === "pending").length;

    const services = lastVisit
        ? tagsFrom(lastVisit.dataValues?.[DV.services])
        : [];
    const immunizations = lastVisit
        ? tagsFrom(lastVisit.dataValues?.[DV.immunization])
        : [];
    const referral = lastVisit
        ? String(lastVisit.dataValues?.[DV.referral] ?? "").trim()
        : "";

    const weightHistory = events
        .map((e) => ({
            date: e.occurredAt ?? e.createdAt,
            value: parseNumber(e.dataValues?.[DV.weight]),
        }))
        .filter((p): p is { date: string; value: number } =>
            p.value !== undefined && p.value > 0,
        )
        .slice(0, 12)
        .reverse();
    const heightHistory = events
        .map((e) => ({
            date: e.occurredAt ?? e.createdAt,
            value: parseNumber(e.dataValues?.[DV.height]),
        }))
        .filter((p): p is { date: string; value: number } =>
            p.value !== undefined && p.value > 0,
        )
        .slice(0, 12)
        .reverse();
    const latestWeight = weightHistory[weightHistory.length - 1]?.value;
    const latestHeight = heightHistory[heightHistory.length - 1]?.value;
    const bmi =
        latestWeight !== undefined && latestHeight !== undefined && latestHeight > 0
            ? +(latestWeight / (latestHeight / 100) ** 2).toFixed(1)
            : undefined;
    const bmiBand = bmi !== undefined ? bmiCategory(bmi) : undefined;

    const nin = String(trackedEntity.attributes?.[ATTR.nin] ?? "").trim();
    const phone = String(trackedEntity.attributes?.[ATTR.phone] ?? "").trim();
    const clientId = String(trackedEntity.attributes?.[ATTR.clientId] ?? "")
        .trim();
    const villageRaw = String(
        trackedEntity.attributes?.[ATTR.village] ?? "",
    ).trim();
    // The village attribute encodes the parish in parentheses for some
    // facilities — split it so the parish renders on its own row.
    const villageMatch = villageRaw.match(/^([^(]+?)\s*\(([^)]+)\)\s*$/);
    const village = villageMatch ? villageMatch[1].trim() : villageRaw;
    const parish = villageMatch ? villageMatch[2].trim() : "";
    const dob = String(trackedEntity.attributes?.[ATTR.dob] ?? "").trim();
    const clientCategory = String(
        trackedEntity.attributes?.[ATTR.category] ?? "",
    ).trim();

    const placeholder = (text = "—") => (
        <Text type="secondary">{text}</Text>
    );

    const renderVisitChips = (items: string[], color: string) =>
        items.length === 0 ? (
            placeholder()
        ) : (
            <Flex gap={token.marginXXS} wrap>
                {items.map((t) => (
                    <Tag key={t} color={color} style={{ margin: 0 }}>
                        {t.toUpperCase()}
                    </Tag>
                ))}
            </Flex>
        );

    const kpi = (
        label: string,
        value: React.ReactNode,
        sub: React.ReactNode,
        icon: React.ReactNode,
        accent: string,
    ) => (
        <Flex
            vertical
            gap={token.marginXXS}
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                padding: token.padding,
                height: "100%",
            }}
        >
            <Flex align="center" justify="space-between">
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {label}
                </Text>
                <span style={{ color: accent, fontSize: 16 }}>{icon}</span>
            </Flex>
            <span
                style={{
                    color: accent,
                    fontWeight: 600,
                    fontSize: 24,
                    lineHeight: 1.1,
                }}
            >
                {value}
            </span>
            {sub && (
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    {sub}
                </Text>
            )}
        </Flex>
    );

    const kpiRow = (
        <Row gutter={[token.marginSM, token.marginSM]}>
            <Col xs={12} sm={6}>
                {kpi(
                    "Total visits",
                    events.length,
                    events.length > 0 ? "All time" : "No visits yet",
                    <CalendarOutlined />,
                    token.colorPrimary,
                )}
            </Col>
            <Col xs={12} sm={6}>
                {kpi(
                    "Last visit",
                    lastVisit
                        ? dayjs(
                              lastVisit.occurredAt ?? lastVisit.createdAt,
                          ).fromNow(true)
                        : "—",
                    lastVisit
                        ? dayjs(
                              lastVisit.occurredAt ?? lastVisit.createdAt,
                          ).format("MMM D, YYYY")
                        : "No visits yet",
                    <ClockCircleOutlined />,
                    token.colorInfo,
                )}
            </Col>
            <Col xs={12} sm={6}>
                {kpi(
                    "Last 30 days",
                    last30,
                    last30 === 1 ? "1 visit" : `${last30} visits`,
                    <HeartOutlined />,
                    token.colorSuccess,
                )}
            </Col>
            <Col xs={12} sm={6}>
                {kpi(
                    "Pending sync",
                    pendingRecords,
                    pendingRecords > 0
                        ? "Records waiting to push"
                        : "All up to date",
                    <CloudUploadOutlined />,
                    pendingRecords > 0
                        ? token.colorWarning
                        : token.colorTextTertiary,
                )}
            </Col>
        </Row>
    );

    const careSnapshot = (
        <Flex
            vertical
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                height: "100%",
            }}
        >
            <Flex
                align="center"
                justify="space-between"
                gap={token.marginSM}
                wrap
                style={{
                    padding: `${token.paddingSM}px ${token.padding}px`,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Flex align="center" gap={token.marginXS}>
                    <FileTextOutlined style={{ color: token.colorPrimary }} />
                    <Title level={5} style={{ margin: 0 }}>
                        Care snapshot
                    </Title>
                </Flex>
                {lastVisit ? (
                    <Tag
                        color={
                            lastVisit.syncStatus === "synced"
                                ? "green"
                                : lastVisit.syncStatus === "pending"
                                  ? "orange"
                                  : "default"
                        }
                        style={{ margin: 0 }}
                    >
                        {dayjs(
                            lastVisit.occurredAt ?? lastVisit.createdAt,
                        ).format("MMM D, YYYY")}
                    </Tag>
                ) : null}
            </Flex>
            <Flex
                vertical
                gap={token.margin}
                style={{ padding: token.padding, flex: 1 }}
            >
                {lastVisit ? (
                    <>
                        <Flex vertical gap={token.marginXS}>
                            <Text
                                type="secondary"
                                style={{ fontSize: token.fontSizeSM }}
                            >
                                Services received
                            </Text>
                            {renderVisitChips(services, "blue")}
                        </Flex>
                        <Flex vertical gap={token.marginXS}>
                            <Text
                                type="secondary"
                                style={{ fontSize: token.fontSizeSM }}
                            >
                                Immunizations
                            </Text>
                            {renderVisitChips(immunizations, "green")}
                        </Flex>
                        <Flex vertical gap={token.marginXS}>
                            <Text
                                type="secondary"
                                style={{ fontSize: token.fontSizeSM }}
                            >
                                Referral
                            </Text>
                            <Text>{referral || placeholder("No referral")}</Text>
                        </Flex>
                        <Divider style={{ margin: 0 }} />
                        <Flex
                            align="center"
                            justify="space-between"
                            gap={token.marginSM}
                        >
                            <Flex gap={token.marginLG} wrap>
                                <Flex vertical gap={0}>
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: token.fontSizeSM }}
                                    >
                                        Weight
                                    </Text>
                                    <span
                                        style={{
                                            fontWeight: 600,
                                            fontSize: 18,
                                            color:
                                                latestWeight === undefined
                                                    ? token.colorTextTertiary
                                                    : token.colorTextBase,
                                        }}
                                    >
                                        {latestWeight === undefined
                                            ? "—"
                                            : `${latestWeight} kg`}
                                    </span>
                                </Flex>
                                <Flex vertical gap={0}>
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: token.fontSizeSM }}
                                    >
                                        Height
                                    </Text>
                                    <span
                                        style={{
                                            fontWeight: 600,
                                            fontSize: 18,
                                            color:
                                                latestHeight === undefined
                                                    ? token.colorTextTertiary
                                                    : token.colorTextBase,
                                        }}
                                    >
                                        {latestHeight === undefined
                                            ? "—"
                                            : `${latestHeight} cm`}
                                    </span>
                                </Flex>
                                <Flex vertical gap={0}>
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: token.fontSizeSM }}
                                    >
                                        BMI
                                    </Text>
                                    <Flex
                                        align="baseline"
                                        gap={token.marginXXS}
                                    >
                                        <span
                                            style={{
                                                fontWeight: 600,
                                                fontSize: 18,
                                                color:
                                                    bmi === undefined
                                                        ? token.colorTextTertiary
                                                        : token.colorTextBase,
                                            }}
                                        >
                                            {bmi === undefined ? "—" : bmi}
                                        </span>
                                        {bmiBand && (
                                            <Tag
                                                color={bmiBand.color}
                                                style={{ margin: 0 }}
                                            >
                                                {bmiBand.label}
                                            </Tag>
                                        )}
                                    </Flex>
                                </Flex>
                            </Flex>
                            <Button
                                type="link"
                                style={{ padding: 0 }}
                                onClick={() => onOpenVisit(lastVisit)}
                            >
                                Open visit
                            </Button>
                        </Flex>
                    </>
                ) : (
                    <Flex
                        vertical
                        align="center"
                        gap={token.marginSM}
                        style={{ paddingBlock: token.paddingLG }}
                    >
                        <Text type="secondary">
                            No visits recorded yet. Open the Visits tab or use
                            "New visit" above to start.
                        </Text>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={onCreateVisit}
                        >
                            Add new visit
                        </Button>
                    </Flex>
                )}
            </Flex>
        </Flex>
    );

    const vitalsCard = (
        <Flex
            vertical
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                height: "100%",
            }}
        >
            <Flex
                align="center"
                justify="space-between"
                gap={token.marginSM}
                style={{
                    padding: `${token.paddingSM}px ${token.padding}px`,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Flex align="center" gap={token.marginXS}>
                    <HeartOutlined style={{ color: token.colorPrimary }} />
                    <Title level={5} style={{ margin: 0 }}>
                        Vitals trend
                    </Title>
                </Flex>
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    Last {Math.max(weightHistory.length, heightHistory.length)}{" "}
                    visit{weightHistory.length === 1 ? "" : "s"}
                </Text>
            </Flex>
            <Flex
                vertical
                gap={token.margin}
                style={{ padding: token.padding, flex: 1 }}
            >
                <VitalRow
                    label="Weight"
                    value={latestWeight}
                    unit="kg"
                    series={weightHistory.map((p) => p.value)}
                    accent={token.colorPrimary}
                    token={token}
                />
                <VitalRow
                    label="Height"
                    value={latestHeight}
                    unit="cm"
                    series={heightHistory.map((p) => p.value)}
                    accent={token.colorSuccess}
                    token={token}
                />
                {bmi !== undefined && bmiBand && (
                    <Flex align="center" justify="space-between" gap={token.marginSM}>
                        <Flex vertical gap={0}>
                            <Text
                                type="secondary"
                                style={{ fontSize: token.fontSizeSM }}
                            >
                                BMI
                            </Text>
                            <Flex align="baseline" gap={token.marginXXS}>
                                <span
                                    style={{
                                        fontSize: 22,
                                        fontWeight: 600,
                                        lineHeight: 1.1,
                                    }}
                                >
                                    {bmi}
                                </span>
                                <Tag color={bmiBand.color} style={{ margin: 0 }}>
                                    {bmiBand.label}
                                </Tag>
                            </Flex>
                        </Flex>
                    </Flex>
                )}
                {weightHistory.length === 0 && heightHistory.length === 0 && (
                    <Text type="secondary">
                        Capture weight and height during a visit to see trends
                        here.
                    </Text>
                )}
            </Flex>
        </Flex>
    );

    const detailItems: DescriptionsProps["items"] = [
        {
            key: "clientId",
            label: (
                <Flex align="center" gap={token.marginXXS}>
                    <IdcardOutlined /> Client ID
                </Flex>
            ),
            children: clientId || placeholder(),
        },
        {
            key: "nin",
            label: (
                <Flex align="center" gap={token.marginXXS}>
                    <SafetyOutlined /> National ID
                </Flex>
            ),
            children: nin || placeholder(),
        },
        {
            key: "phone",
            label: (
                <Flex align="center" gap={token.marginXXS}>
                    <PhoneOutlined /> Phone
                </Flex>
            ),
            children: phone || placeholder(),
        },
        {
            key: "village",
            label: (
                <Flex align="center" gap={token.marginXXS}>
                    <EnvironmentOutlined /> Village
                </Flex>
            ),
            children: village || placeholder(),
        },
        ...(parish
            ? [
                  {
                      key: "parish",
                      label: (
                          <Flex align="center" gap={token.marginXXS}>
                              <EnvironmentOutlined /> Parish
                          </Flex>
                      ),
                      children: parish,
                  },
              ]
            : []),
        {
            key: "sex",
            label: "Sex",
            children: sex || placeholder(),
        },
        {
            key: "age",
            label: "Age",
            children: age !== null ? `${age} yrs` : placeholder(),
        },
        {
            key: "dob",
            label: "Date of birth",
            children: dob ? dayjs(dob).format("MMM D, YYYY") : placeholder(),
        },
        {
            key: "category",
            label: "Client category",
            children: clientCategory || placeholder(),
        },
        {
            key: "registered",
            label: "Registered",
            children: trackedEntity.createdAt
                ? dayjs(trackedEntity.createdAt).format("MMM D, YYYY")
                : placeholder(),
        },
        {
            key: "enrolled",
            label: "Enrolled",
            children: enrollment.enrolledAt
                ? dayjs(enrollment.enrolledAt).format("MMM D, YYYY")
                : placeholder(),
        },
    ];

    const detailsCard = (
        <Flex
            vertical
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                height: "100%",
            }}
        >
            <Flex
                align="center"
                gap={token.marginXS}
                style={{
                    padding: `${token.paddingSM}px ${token.padding}px`,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <UserOutlined style={{ color: token.colorPrimary }} />
                <Title level={5} style={{ margin: 0 }}>
                    Patient details
                </Title>
            </Flex>
            <div style={{ padding: token.padding, flex: 1 }}>
                <Descriptions
                    bordered={false}
                    column={1}
                    size="small"
                    colon={false}
                    items={detailItems}
                    styles={{
                        label: {
                            color: token.colorTextSecondary,
                            fontWeight: 500,
                            width: 160,
                        },
                    }}
                />
            </div>
        </Flex>
    );

    const recentVisits = events.slice(0, 5);
    const timelineItems = recentVisits.map((ev) => {
        const date = dayjs(ev.occurredAt ?? ev.createdAt);
        const evServices = tagsFrom(ev.dataValues?.[DV.services]);
        const evImmun = tagsFrom(ev.dataValues?.[DV.immunization]);
        const weight = parseNumber(ev.dataValues?.[DV.weight]);
        const weightLabel = weight !== undefined ? `${weight} kg` : "";
        return {
            color:
                ev.syncStatus === "synced"
                    ? "green"
                    : ev.syncStatus === "pending"
                      ? "orange"
                      : token.colorTextTertiary,
            children: (
                <Flex
                    vertical
                    gap={token.marginXXS}
                    style={{ paddingBottom: token.marginXS }}
                >
                    <Flex
                        align="center"
                        justify="space-between"
                        gap={token.marginXS}
                        wrap
                    >
                        <Text strong>{date.format("ddd, MMM D, YYYY")}</Text>
                        <Button
                            type="link"
                            size="small"
                            style={{ padding: 0 }}
                            onClick={() => onOpenVisit(ev)}
                        >
                            Open
                        </Button>
                    </Flex>
                    {(evServices.length > 0 || evImmun.length > 0) && (
                        <Flex gap={token.marginXXS} wrap>
                            {evServices.map((t) => (
                                <Tag
                                    key={`s-${t}`}
                                    color="blue"
                                    style={{ margin: 0 }}
                                >
                                    {t.toUpperCase()}
                                </Tag>
                            ))}
                            {evImmun.map((t) => (
                                <Tag
                                    key={`i-${t}`}
                                    color="green"
                                    style={{ margin: 0 }}
                                >
                                    {t.toUpperCase()}
                                </Tag>
                            ))}
                        </Flex>
                    )}
                    {weightLabel && (
                        <Text
                            type="secondary"
                            style={{ fontSize: token.fontSizeSM }}
                        >
                            {weightLabel}
                        </Text>
                    )}
                </Flex>
            ),
        };
    });

    const recentVisitsCard = (
        <Flex
            vertical
            style={{
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                height: "100%",
            }}
        >
            <Flex
                align="center"
                justify="space-between"
                gap={token.marginSM}
                style={{
                    padding: `${token.paddingSM}px ${token.padding}px`,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Flex align="center" gap={token.marginXS}>
                    <CalendarOutlined style={{ color: token.colorPrimary }} />
                    <Title level={5} style={{ margin: 0 }}>
                        Recent visits
                    </Title>
                </Flex>
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    Showing latest {recentVisits.length}
                </Text>
            </Flex>
            <div style={{ padding: token.padding, flex: 1 }}>
                {recentVisits.length === 0 ? (
                    <Text type="secondary">No visits to show.</Text>
                ) : (
                    <Timeline items={timelineItems} />
                )}
            </div>
        </Flex>
    );

    return (
        <Flex vertical gap={token.marginSM}>
            {kpiRow}
            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={24} lg={15}>
                    {careSnapshot}
                </Col>
                <Col xs={24} lg={9}>
                    {vitalsCard}
                </Col>
            </Row>
            <Row gutter={[token.marginSM, token.marginSM]}>
                <Col xs={24} lg={15}>
                    {detailsCard}
                </Col>
                <Col xs={24} lg={9}>
                    {recentVisitsCard}
                </Col>
            </Row>
        </Flex>
    );
}
