import { PlusOutlined } from "@ant-design/icons";
import { Button, Card, Space, Typography } from "antd";
import React from "react";
import { db } from "../db";
import { useModalState } from "../hooks/useModalState";
import { FlattenedTrackedEntity } from "../schemas";
import { createEmptyTrackedEntity } from "../utils/utils";
import { DataModal } from "./data-modal";
import { TrackerRegistration } from "./tracker-registration";
import { RootRoute } from "../routes/__root";

const { Title, Text } = Typography;
const NoPatientsCard: React.FC = () => {
    const {
        orgUnit: { id },
    } = RootRoute.useRouteContext();
    const { data, isOpen, openModal, closeModal } =
        useModalState<FlattenedTrackedEntity>();

    const handleCreate = () => {
        console.log("Creating new patient");
        const newPatient: FlattenedTrackedEntity = createEmptyTrackedEntity({
            orgUnit: id,
        });
        openModal(newPatient);
    };

    return (
        <Card
            variant="borderless"
            style={{
                textAlign: "center",
                padding: "60px 40px",
            }}
        >
            <Space
                orientation="vertical"
                size="large"
                style={{ width: "100%" }}
            >
                <Title level={3} style={{ color: "#2c3e50", margin: 0 }}>
                    No clients found.
                </Title>

                <Text
                    style={{
                        fontSize: "16px",
                        color: "#5a6c7d",
                        lineHeight: "1.6",
                        display: "block",
                        maxWidth: "500px",
                        margin: "0 auto",
                    }}
                >
                    Try refining your search criteria or checking registration
                    details before registering a new client.
                </Text>
                <Button
                    type="primary"
                    size="large"
                    icon={<PlusOutlined />}
                    onClick={handleCreate}
                    style={{
                        background:
                            "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)",
                        borderColor: "#7c3aed",
                        height: "48px",
                        paddingLeft: 32,
                        paddingRight: 32,
                        fontSize: "16px",
                    }}
                >
                    Register New Client
                </Button>
            </Space>
            <DataModal<FlattenedTrackedEntity>
                open={isOpen}
                data={data}
                onClose={closeModal}
                onSave={async (values, addAnother) => {
                    if (values && data) {
                        await db.trackedEntities.put({
                            ...data,
                            attributes: {
                                ...data.attributes,
                                ...values,
                            },
                            syncStatus: "pending",
                        });
                    }
                    if (addAnother) {
                        const newPatient: FlattenedTrackedEntity =
                            createEmptyTrackedEntity({
                                orgUnit: id,
                            });
                        openModal(newPatient);
                    }
                }}
                title="Register New Client"
                submitButtonText="Register client"
                hasAddAnother={true}
            >
                {(form) => (
                    <TrackerRegistration trackedEntity={data!} form={form} />
                )}
            </DataModal>
        </Card>
    );
};

export default NoPatientsCard;
