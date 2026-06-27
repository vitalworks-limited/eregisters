import {
    DeleteOutlined,
    ExperimentOutlined,
    EyeOutlined,
    PlusOutlined,
} from "@ant-design/icons";
import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
import {
    Button,
    Flex,
    Form,
    Grid,
    message,
    Popconfirm,
    Table,
    TableProps,
    theme,
    Typography,
} from "antd";
import dayjs from "dayjs";
import React, { useMemo } from "react";
import { useMetadata } from "../hooks/useMetadata";
import { useModalState } from "../hooks/useModalState";
import { EventContext } from "../machines";
import { SyncContext } from "../machines/sync";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
    ProgramStage,
} from "../schemas";
import {
    cancelDataModal,
    createEmptyEvent,
    deleteEventWithChildren,
} from "../utils/utils";
import { DataModal } from "./data-modal";
import ProgramStageForm from "./program-stage-form";

import {
    enrollmentsCollection,
    trackedEntitiesCollection,
    eventsCollection,
} from "../collections";

const { Text } = Typography;

export const ProgramStageCapture: React.FC<{
    programStage: ProgramStage;
    trackedEntity: FlattenedTrackedEntity;
    mainEvent: FlattenedEvent;
    captureMode?: "modal" | "inline";
    enrollment: FlattenedEnrollment;
}> = ({
    programStage,
    trackedEntity,
    mainEvent,
    captureMode = "modal",
    enrollment,
}) => {
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.lg;
    const { token } = theme.useToken();
    const { data, isOpen, isNew, openModal, closeModal } =
        useModalState<FlattenedEvent>();
    const { dataElements, optionSets, programRuleVariables, programRules } =
        useMetadata();
    const syncActor = SyncContext.useActorRef();

    const mainStageDataElements = useMemo(
        () =>
            new Set(
                programStage.programStageDataElements.map(
                    (psde) => psde.dataElement.id,
                ) ?? [],
            ),
        [programStage],
    );

    const handleCreate = async () => {
        const newEvent = createEmptyEvent({
            trackedEntity: trackedEntity.trackedEntity,
            program: enrollment.program,
            orgUnit: enrollment.orgUnit,
            enrollment: enrollment.enrollment,
            programStage: programStage.id,
            occurredAt:
                mainEvent.dataValues["occurredAt"] || mainEvent.occurredAt,
            dataValues: {
                occurredAt:
                    mainEvent.dataValues["occurredAt"] || mainEvent.occurredAt,
            },
            parentEvent: mainEvent.event,
        });
        const tx = eventsCollection.insert(newEvent);
        await tx.isPersisted.promise;
        openModal(newEvent, enrollment, true);
    };

    const { data: events } = useLiveSuspenseQuery((q) =>
        q.from({ event: eventsCollection }).where(({ event }) => {
            return and(
                eq(event.programStage, programStage.id),
                eq(event.parentEvent, mainEvent.event),
                not(eq(event.syncStatus, "deleted")),
            );
        }),
    );

    const medicines = new Map(
        optionSets.get("Fm205YyFeRg")?.map(({ code, name }) => [code, name]),
    );
    const columns: TableProps<FlattenedEvent>["columns"] = [
        {
            title: "Date",
            key: "date",
            render: (_, row) => {
                return dayjs(
                    row.dataValues["occurredAt"] || row.occurredAt,
                ).format("MMM DD, YYYY");
            },
        },
        ...programStage.programStageSections.flatMap((section) => {
            return section.dataElements.map((de) => {
                const currentDataElement = dataElements.get(de.id)!;
                return {
                    title:
                        currentDataElement.formName || currentDataElement.name,
                    key: de.id,
                    dataIndex: ["dataValues", de.id],
                    render: (value: string) => medicines.get(value) || value,
                    responsive: ["md" as const],
                };
            });
        }),
        {
            title: "Sync Status",
            dataIndex: "syncStatus",
            key: "syncStatus",
            width: 120,
            responsive: ["lg" as const],
        },
        {
            title: "Action",
            key: "action",
            width: isMobile ? 80 : 100,
            fixed: "right",
            render: (_, record) => (
                <Flex gap="small" align="center">
                    <Popconfirm
                        title="Delete Event"
                        description="Are you sure you want to delete this event? This will sync the deletion to DHIS2."
                        okText="Delete"
                        okType="danger"
                        onConfirm={async () => {
                            try {
                                const { markedDeleted } =
                                    await deleteEventWithChildren(record.event);
                                if (markedDeleted.length > 0) {
                                    syncActor.send({ type: "PUSH_DATA" });
                                }
                                message.success("Event deleted");
                            } catch (error) {
                                console.error("Failed to delete event:", error);
                                message.error("Failed to delete event");
                            }
                        }}
                    >
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                            size={isMobile ? "small" : "middle"}
                        >
                            {!isMobile && "Delete"}
                        </Button>
                    </Popconfirm>
                    <Button
                        icon={<EyeOutlined />}
                        size={isMobile ? "small" : "middle"}
                        onClick={() =>
                            openModal(
                                {
                                    ...record,
                                    dataValues: {
                                        ...record.dataValues,
                                        occurredAt: record.occurredAt,
                                    },
                                },
                                enrollment,
                            )
                        }
                    >
                        {!isMobile && "View"}
                    </Button>
                </Flex>
            ),
        },
    ];
    return (
        <>
            <Table
                columns={columns}
                dataSource={events}
                pagination={false}
                rowKey="event"
                scroll={{ x: "max-content" }}
                title={() => {
                    return (
                        <Flex
                            style={{
                                width: "100%",
                            }}
                            justify="space-between"
                            align="center"
                        >
                            <Flex align="center" gap="small">
                                <ExperimentOutlined
                                    style={{
                                        fontSize: token.fontSizeHeading3,
                                        color: token.colorPrimary,
                                    }}
                                />
                                <Text strong>{programStage.name}</Text>
                            </Flex>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                size="middle"
                                onClick={handleCreate}
                            >
                                {isMobile ? "Add" : `Add ${programStage.name}`}
                            </Button>
                        </Flex>
                    );
                }}
            />

            <DataModal<FlattenedEvent>
                open={isOpen}
                data={data}
                onClose={closeModal}
                onCancel={() => cancelDataModal(data!)}
                enrollment={enrollment}
                onSave={async ({ values, addAnother }) => {
                    if (values && data) {
                        const tx = eventsCollection.update(
                            data.event,
                            (draft) => {
                                draft.dataValues = values;
                                draft.syncStatus = "draft";
                                draft.parentEvent = mainEvent.event;
                            },
                        );
                        await tx.isPersisted.promise;
                        if (addAnother) {
                            closeModal();
                            await handleCreate();
                        }
                    }
                }}
                title={isNew ? programStage.name : `Edit ${programStage.name}`}
                submitButtonText={`Save ${programStage.name}`}
                hasAddAnother={true}
            >
                {(form) => {
                    if (data) {
                        return (
                            <EventContext.Provider
                                key={data.event}
                                options={{
                                    input: {
                                        programRules,
                                        programRuleVariables,
                                        enrollment,
                                        event: data!,
                                        program: "ueBhWkWll5v",
                                        programStage: programStage.id,
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
                                    <ProgramStageForm
                                        form={form}
                                        programStage={programStage}
                                    />
                                </Form>
                            </EventContext.Provider>
                        );
                    }
                }}
            </DataModal>
        </>
    );
};
