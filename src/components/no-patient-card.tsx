import { PlusOutlined } from "@ant-design/icons";
import { Button, Card, Form, Grid, Space, Typography } from "antd";
import React, { useMemo } from "react";

import { useMetadata } from "../hooks/useMetadata";
import { useModalState } from "../hooks/useModalState";
import { TrackedEntityContext } from "../machines";
import { TrackedEntitiesRoute } from "../routes/tracked-entities";
import { FlattenedTrackedEntity } from "../schemas";
import {
    cancelDataModal,
    createEmptyEnrollment,
    createEmptyTrackedEntity,
} from "../utils/utils";
import { DataModal } from "./data-modal";
import { TrackerRegistration } from "./tracker-registration";

import {
    enrollmentsCollection,
    trackedEntitiesCollection,
} from "../collections";

const { Title, Text } = Typography;
type NoPatientsCardProps = {
    message: string;
    initialAttributes?: Record<string, string>;
};

const NoPatientsCard: React.FC<NoPatientsCardProps> = ({
    message,
    initialAttributes = {},
}) => {
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.lg;
    const {
        orgUnit: { id },
        programRuleVariables,
        program,
        programRules,
    } = useMetadata();
    const mainStageDataElements = useMemo(
        () =>
            new Set(
                program.programTrackedEntityAttributes.map(
                    ({ trackedEntityAttribute }) => trackedEntityAttribute.id,
                ),
            ),
        [],
    );
    const navigate = TrackedEntitiesRoute.useNavigate();
    const {
        enrollment,
        data: trackedEntity,
        isOpen,
        openModal,
        closeModal,
    } = useModalState<FlattenedTrackedEntity>();
    const handleCreate = async () => {
        const newPatient: FlattenedTrackedEntity = createEmptyTrackedEntity({
            orgUnit: id,
            attributes: initialAttributes,
        });
        const newEnrollment = createEmptyEnrollment({
            orgUnit: id,
            trackedEntity: newPatient.trackedEntity,
            attributes: initialAttributes,
        });
        await trackedEntitiesCollection.utils.insertLocally(newPatient);
        await enrollmentsCollection.utils.insertLocally(newEnrollment);
        openModal(newPatient, newEnrollment);
    };

    return (
        <Card
            variant="borderless"
            style={{
                textAlign: "center",
                height: isMobile ? undefined : "calc(100vh - 144px - 127px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
                data={trackedEntity}
                onClose={closeModal}
                onCancel={() => cancelDataModal(trackedEntity!)}
                enrollment={enrollment}
                onSave={async ({ values, addAnother }) => {
                    if (values && trackedEntity && enrollment) {
                        const tx1 = trackedEntitiesCollection.update(
                            trackedEntity.trackedEntity,
                            (draft) => {
                                draft.attributes = {
                                    ...trackedEntity.attributes,
                                    ...values,
                                };
                                draft.syncStatus = "pending";
                            },
                        );
                        await tx1.isPersisted.promise;
                        const tx2 = enrollmentsCollection.update(
                            enrollment.enrollment,
                            (draft) => {
                                draft.attributes = {
                                    ...enrollment.attributes,
                                    ...values,
                                };
                                draft.syncStatus = "pending";
                            },
                        );
                        await tx2.isPersisted.promise;
                        if (addAnother) {
                            closeModal();
                            const newPatient = createEmptyTrackedEntity({
                                orgUnit: id,
                            });
                            const newEnrollment = createEmptyEnrollment({
                                orgUnit: id,
                                trackedEntity: newPatient.trackedEntity,
                            });
                            await trackedEntitiesCollection.utils.insertLocally(
                                newPatient,
                            );
                            await enrollmentsCollection.utils.insertLocally(
                                newEnrollment,
                            );
                            openModal(newPatient, newEnrollment);
                        } else {
                            navigate({
                                to: `/tracked-entity/$trackedEntity`,
                                search: {
                                    orgUnits: id,
                                },
                                params: {
                                    trackedEntity: trackedEntity.trackedEntity,
                                },
                            });
                        }
                    }
                }}
                title="Register New Client"
                submitButtonText="Register client"
                hasAddAnother={true}
            >
                {(form) => {
                    return (
                        <TrackedEntityContext.Provider
                            key={trackedEntity?.trackedEntity || "closed"}
                            options={{
                                input: {
                                    programRules,
                                    programRuleVariables,
                                    program: "ueBhWkWll5v",
                                    trackedEntity: trackedEntity!,
                                    validDataElements: mainStageDataElements,
                                    form,
                                },
                            }}
                        >
                            <Form
                                form={form}
                                layout="vertical"
                                preserve={false}
                                initialValues={trackedEntity?.attributes}
                            >
                                <TrackerRegistration
                                    trackedEntity={trackedEntity!}
                                    form={form}
                                />
                            </Form>
                        </TrackedEntityContext.Provider>
                    );
                }}
            </DataModal>
        </Card>
    );
};

export default NoPatientsCard;
