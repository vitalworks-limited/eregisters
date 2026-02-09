import {
    ExperimentOutlined,
    EyeOutlined,
    PlusOutlined,
} from "@ant-design/icons";
import {
    Button,
    Flex,
    message,
    Modal,
    Table,
    TableProps,
    Typography,
} from "antd";
import dayjs from "dayjs";
import { useLiveQuery } from "dexie-react-hooks";
import React from "react";
import { db } from "../db";
import { useModalState } from "../hooks/useModalState";
import { RootRoute } from "../routes/__root";
import {
    FlattenedTrackedEntity,
    ProgramStage,
    FlattenedEvent,
} from "../schemas";
import { createEmptyEvent, createRelationship } from "../utils/utils";
import { DataModal } from "./data-modal";
import ProgramStageForm from "./program-stage-form";

const { Text } = Typography;

export const ProgramStageCapture: React.FC<{
    programStage: ProgramStage;
    trackedEntity: FlattenedTrackedEntity;
    mainEvent: FlattenedEvent;
    captureMode?: "modal" | "inline";
    relationShipType: string;
}> = ({
    programStage,
    trackedEntity,
    mainEvent,
    relationShipType,
    captureMode = "modal",
}) => {
    const enrollment = trackedEntity.enrollment;
    const { data, isOpen, openModal, closeModal } =
        useModalState<FlattenedEvent>();
    const { dataElements, optionSets } = RootRoute.useLoaderData();

    const handleCreate = async () => {
        const newEvent = createEmptyEvent({
            trackedEntity: trackedEntity.trackedEntity,
            program: enrollment.program,
            orgUnit: enrollment.orgUnit,
            enrollment: enrollment.enrollment,
            programStage: programStage.id,
        });
        const newRelationship = createRelationship({
            fromId: mainEvent.event,
            toId: newEvent.event,
            relationshipType: relationShipType,
            from: {},
            to: {},
        });
        await db.events.put(newEvent);
        await db.relationships.put(newRelationship);
        openModal(newEvent);
    };

    const events =
        useLiveQuery(async () => {
            if (!mainEvent.event) return [];
            const relationships = await db.relationships
                .where("fromId")
                .equals(mainEvent.event)
                .and((e) => e.relationshipType === relationShipType)
                .toArray();
            return db.events
                .where("event")
                .anyOf(relationships.map((r) => r.toId))
                .toArray();
        }, [trackedEntity.trackedEntity, programStage.id, mainEvent.event]) ||
        [];
    const medicines = new Map(
        optionSets.get("Fm205YyFeRg")?.map(({ code, name }) => [code, name]),
    );
    const columns: TableProps<FlattenedEvent>["columns"] = [
        {
            title: "Date",
            dataIndex: "occurredAt",
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
            title: "Action",
            key: "action",
            width: 100,
            fixed: "right",
            render: (_, record) => (
                <Flex gap="small" align="center">
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
                                },
                            });
                        }}
                    >
                        Delete
                    </Button>
                    <Button
                        icon={<EyeOutlined />}
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
                onSave={async (values) => {
                    if (values && data) {
                        await db.events.update(data.event, {
                            syncStatus:
                                mainEvent.syncStatus === "synced"
                                    ? "pending"
                                    : "draft",
                        });
                        const relationship = createRelationship({
                            fromId: mainEvent.event,
                            toId: data.event,
                            relationshipType: relationShipType,
                            from: {},
                            to: {},
                        });
                        await db.relationships.put({
                            ...relationship,
                        });
                    }
                }}
                title={programStage.name}
                submitButtonText={`Save ${programStage.name}`}
            >
                {(form) => (
                    <ProgramStageForm
                        form={form}
                        programStage={programStage}
                        event={data!}
                        trackedEntity={trackedEntity}
                    />
                )}
            </DataModal>
        </>
    );
};
