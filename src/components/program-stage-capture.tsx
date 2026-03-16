import {
    ExperimentOutlined,
    EyeOutlined,
    PlusOutlined,
} from "@ant-design/icons";
import { and, eq, useLiveSuspenseQuery } from "@tanstack/react-db";
import {
    Button,
    Flex,
    Form,
    message,
    Popconfirm,
    Table,
    TableProps,
    Typography,
} from "antd";
import dayjs from "dayjs";
import React, { useMemo } from "react";
import { useModalState } from "../hooks/useModalState";
import { EventContext } from "../machines";
import { SyncContext } from "../machines/sync";
import { RootRoute } from "../routes/__root";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
    ProgramStage,
} from "../schemas";
import { createEmptyEvent } from "../utils/utils";
import { DataModal } from "./data-modal";
import ProgramStageForm from "./program-stage-form";

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
    const syncActor = SyncContext.useActorRef();
    const { data, isOpen, openModal, closeModal } =
        useModalState<FlattenedEvent>();
    const { dataElements, optionSets, programRuleVariables, programRules } =
        RootRoute.useLoaderData();
    const eventsCollection = SyncContext.useSelector(
        (a) => a.context.eventsCollection,
    );

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
            dataValues: {
                occurredAt:
                    mainEvent.dataValues["occurredAt"] || mainEvent.occurredAt,
            },
            parentEvent: mainEvent.event,
        });
        const tx = eventsCollection.insert(newEvent);
        await tx.isPersisted.promise;
        openModal(newEvent, enrollment);
    };

    const { data: events } = useLiveSuspenseQuery((q) =>
        q.from({ event: eventsCollection }).where(({ event }) => {
            return and(
                eq(event.programStage, programStage.id),
                eq(event.parentEvent, mainEvent.event),
            );
        }),
    );

    const medicines = new Map(
        optionSets.get("Fm205YyFeRg")?.map(({ code, name }) => [code, name]),
    );
    const columns: TableProps<FlattenedEvent>["columns"] = [
        {
            title: "Date",
            dataIndex: ["dataValues", "occurredAt"],
            key: "date",
            render: (date) => dayjs(date).format("MMM DD, YYYY"),
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
                };
            });
        }),
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
                                const tx = eventsCollection.update(
                                    record.event,
                                    (draft) => {
                                        draft.syncStatus = "deleted";
                                    },
                                );
                                await tx.isPersisted.promise;
                                message.success(
                                    "Event marked for deletion and will sync to DHIS2",
                                );
                            } catch (error) {
                                console.error("Failed to delete event:", error);
                                message.error("Failed to delete event");
                            }
                        }}
                    >
                        <Button danger>Delete</Button>
                    </Popconfirm>
                    <Button
                        icon={<EyeOutlined />}
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
                        View
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
                                        fontSize: 28,
                                        color: "#7c3aed",
                                    }}
                                />
                                <Text
                                    strong
                                    style={{
                                        fontSize: 14,
                                    }}
                                >
                                    {programStage.name}
                                </Text>
                            </Flex>
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                size="middle"
                                onClick={handleCreate}
                                style={{
                                    background: "#7c3aed",
                                    borderColor: "#7c3aed",
                                    borderRadius: 6,
                                }}
                            >
                                Add {programStage.name}
                            </Button>
                        </Flex>
                    );
                }}
            />

            <DataModal<FlattenedEvent>
                open={isOpen}
                data={data}
                onClose={closeModal}
                enrollment={enrollment}
                onSave={async ({ values, addAnother }) => {
                    if (values && data) {
                        const tx = eventsCollection.update(
                            data.event,
                            (draft) => {
                                draft.dataValues = values;
                                draft.syncStatus = "pending";
                                draft.parentEvent = mainEvent.event;
                            },
                        );
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
                                    parentEvent: mainEvent.event,
                                },
                            ],
                        });
                        await tx.isPersisted.promise;
                        if (addAnother) {
                            closeModal(); 
                            await handleCreate();
                        }
                    }
                }}
                title={programStage.name}
                submitButtonText={`Save ${programStage.name}`}
                hasAddAnother={true}
            >
                {(form) => (
                    <EventContext.Provider
                        key={data?.event || "closed"}
                        options={{
                            input: {
                                programRules,
                                programRuleVariables,
                                enrollment,
                                event: data!,
                                program: "ueBhWkWll5v",
                                programStage: "K2nxbE9ubSs",
                                trackedEntity,
                                validDataElements: mainStageDataElements,
                                form,
                                eventsCollection,
                            },
                        }}
                    >
                        <Form form={form} layout="vertical" preserve={false}>
                            <ProgramStageForm
                                form={form}
                                programStage={programStage}
                            />
                        </Form>
                    </EventContext.Provider>
                )}
            </DataModal>
        </>
    );
};
