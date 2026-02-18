import { PlusOutlined } from "@ant-design/icons";
import { Button, Card, Space, Typography } from "antd";
import React from "react";
import { db } from "../db";
import { useModalState } from "../hooks/useModalState";
import { FlattenedTrackedEntity } from "../schemas";
import {
    createEmptyEnrollment,
    createEmptyTrackedEntity,
} from "../utils/utils";
import { DataModal } from "./data-modal";
import { TrackerRegistration } from "./tracker-registration";
import { RootRoute } from "../routes/__root";
import { TrackedEntitiesRoute } from "../routes/tracked-entities";

const { Title, Text } = Typography;
const NoPatientsCard: React.FC<{ message: string }> = ({ message }) => {
    const {
        orgUnit: { id },
    } = RootRoute.useLoaderData();
    const navigate = TrackedEntitiesRoute.useNavigate();
    const { enrollment, data, isOpen, openModal, closeModal } =
        useModalState<FlattenedTrackedEntity>();

    const handleCreate = async () => {
        const newPatient: FlattenedTrackedEntity = createEmptyTrackedEntity({
            orgUnit: id,
        });
        const newEnrollment = createEmptyEnrollment({
            orgUnit: id,
            trackedEntity: newPatient.trackedEntity,
        });
        await db.trackedEntities.put(newPatient);
        await db.enrollments.put(newEnrollment);
        openModal(newPatient, newEnrollment);
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
                    {message}
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
                enrollment={enrollment}
                onSave={async ({ values, enrollment, addAnother }) => {
                    if (values && data && enrollment) {
                        await db.trackedEntities.put({
                            ...data,
                            attributes: {
                                ...data.attributes,
                                ...values,
                            },
                            syncStatus: "pending",
                        });
                        await db.enrollments.put({
                            ...enrollment,
                            attributes: { ...enrollment.attributes, ...values },
                            syncStatus: "pending",
                        });
                        if (addAnother) {
                            const newPatient = createEmptyTrackedEntity({
                                orgUnit: id,
                            });
                            const newEnrollment = createEmptyEnrollment({
                                orgUnit: id,
                                trackedEntity: newPatient.trackedEntityType,
                            });

                            await db.trackedEntities.put(newPatient);
                            await db.enrollments.put(newEnrollment);
                            openModal(newPatient, newEnrollment);
                        } else {
                            navigate({
                                to: `/tracked-entity/$trackedEntity`,
                                search: {
                                    orgUnits: id,
                                },
                                params: {
                                    trackedEntity: data.trackedEntity,
                                },
                            });
                        }
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
