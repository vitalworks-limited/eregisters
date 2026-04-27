import {
    DashboardOutlined,
    MoreOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { eq, ilike, useLiveSuspenseQuery } from "@tanstack/react-db";
import { createRoute } from "@tanstack/react-router";
import {
    Button,
    Card,
    Dropdown,
    Flex,
    Form,
    MenuProps,
    Table,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";

import React, { useMemo } from "react";
import NoPatientsCard from "../components/no-patient-card";
import { TrackerRegistration } from "../components/tracker-registration";
import { useModalState } from "../hooks/useModalState";
import { FlattenedTrackedEntity } from "../schemas";
import {
    createEmptyEnrollment,
    createEmptyTrackedEntity,
} from "../utils/utils";
import { TrackedEntitiesRoute } from "./tracked-entities";
import { DataModal } from "../components/data-modal";
import { TrackedEntityContext } from "../machines";
import { SyncContext } from "../machines/sync";
import { useMetadata } from "../hooks/useMetadata";
import {
    enrollmentsCollection,
    trackedEntitiesCollection,
} from "../collections";

const { Text } = Typography;
export const TrackedEntitiesIndexRoute = createRoute({
    getParentRoute: () => TrackedEntitiesRoute,
    path: "/",
    component: TrackedEntitiesSearch,
});

function TrackedEntitiesSearch() {
    const {
        trackedEntityAttributes,
        organisations,
        programRules,
        programRuleVariables,
        program,
        orgUnit: { id },
    } = useMetadata();
    const syncActor = SyncContext.useActorRef();
    const navigate = TrackedEntitiesIndexRoute.useNavigate();
    const mainStageDataElements = useMemo(
        () =>
            new Set(
                program.programTrackedEntityAttributes.map(
                    ({ trackedEntityAttribute }) => trackedEntityAttribute.id,
                ),
            ),
        [program],
    );
    const {
        data: trackedEntity,
        enrollment,
        isOpen,
        openModal,
        closeModal,
    } = useModalState<FlattenedTrackedEntity>();
    const { search } = TrackedEntitiesRoute.useSearch();

    const { data: currentTrackedEntities = [] } = useLiveSuspenseQuery(
        (q) => {
            const hasSearch = search && Object.keys(search).length > 0;

            if (!hasSearch) {
                return q
                    .from({ trackedEntity: trackedEntitiesCollection })
                    .where(() => eq(1, 0));
            }

            let query = q.from({ trackedEntity: trackedEntitiesCollection });

            for (const [filterKey, filterValue] of Object.entries(search)) {
                query = query.where(({ trackedEntity }) =>
                    ilike(
                        trackedEntity.attributes[filterKey],
                        `%${filterValue}%`,
                    ),
                );
            }

            return query.where(({ trackedEntity }) =>
                eq(trackedEntity.orgUnit, id),
            );
        },
        [search],
    );
    const createAndOpenNewPatient = async () => {
        const newPatient = createEmptyTrackedEntity({ orgUnit: id });
        const newEnrollment = createEmptyEnrollment({
            orgUnit: id,
            trackedEntity: newPatient.trackedEntity,
        });
        await trackedEntitiesCollection.utils.insertLocally(newPatient);
        await enrollmentsCollection.utils.insertLocally(newEnrollment);
        openModal(newPatient, newEnrollment);
    };

    const actionMenu: MenuProps = {
        items: [
            {
                key: "dashboard",
                label: "Patient Dashboard",
                icon: <DashboardOutlined />,
            },
            {
                key: "patient",
                label: "Patient Summary",
                icon: <UserOutlined />,
            },
        ],
    };
    const columns: ColumnsType<FlattenedTrackedEntity> = [
        ...program.programTrackedEntityAttributes.map(
            ({ trackedEntityAttribute: { id }, ...rest }) => ({
                ...rest,
                ...trackedEntityAttributes.get(id)!,
            }),
        ),
        {
            displayInList: true,
            displayFormName: "Registering Facility",
            name: "Registering Facility",
            id: "registeringFacility",
            valueType: "TEXT",
            optionSetValue: false,
            generated: false,
            unique: false,
            pattern: "",
            confidential: false,
        },
    ].flatMap((trackedEntityAttribute) => {
        if (!trackedEntityAttribute.displayInList) {
            return [];
        }
        if (trackedEntityAttribute.id === "registeringFacility") {
            return {
                title:
                    trackedEntityAttribute.displayFormName ||
                    trackedEntityAttribute.name,
                key: trackedEntityAttribute.id,
                render: (record) => {
                    return organisations.get(record.orgUnit) || "N/A";
                },
            };
        }
        if (trackedEntityAttribute.id === "oTI0DLitzFY") {
            return {
                title:
                    trackedEntityAttribute.displayFormName ||
                    trackedEntityAttribute.name,
                key: trackedEntityAttribute.id,
                dataIndex: ["attributes", "oTI0DLitzFY"],
                render: (text) => {
                    return String(text).split("(")[1]?.replace(")", "");
                },
            };
        }

        if (trackedEntityAttribute.id === "actions") {
            return {
                title: "Action",
                key: "action",
                fixed: "right",
                width: 100,
                render: (_, record) => (
                    <Dropdown menu={actionMenu} trigger={["click"]}>
                        <Button
                            type="text"
                            icon={<MoreOutlined />}
                            style={{
                                color: "#666",
                                fontSize: 20,
                            }}
                        />
                    </Dropdown>
                ),
            };
        }

        return {
            title:
                trackedEntityAttribute.displayFormName ||
                trackedEntityAttribute.name,
            dataIndex: ["attributes", trackedEntityAttribute.id],
            key: trackedEntityAttribute.id,
        };
    });

    if (
        currentTrackedEntities.length === 0 &&
        Object.values(search ?? {}).some(Boolean)
    )
        return (
            <NoPatientsCard message="No clients found matching your search criteria." />
        );
    if (currentTrackedEntities.length === 0)
        return <NoPatientsCard message="" />;

    return (
        <Card
            variant="borderless"
            extra={
                <Flex
                    gap="small"
                    align="center"
                    justify="space-between"
                    style={{ width: "100%" }}
                >
                    <Text>{`${currentTrackedEntities.length} results matching`}</Text>
                    <Button
                        type="primary"
                        size="large"
                        onClick={createAndOpenNewPatient}
                    >
                        Register New Client
                    </Button>
                </Flex>
            }
            style={{ height: "calc(100vh - 144px)" }}
        >
            <Table
                columns={columns}
                dataSource={currentTrackedEntities}
                rowKey="trackedEntity"
                pagination={{
                    pageSize: 5,
                    showSizeChanger: true,
                    total: currentTrackedEntities.length,
                    showTotal: (total, range) =>
                        `Showing ${range[0]} to ${range[1]} of ${total}`,
                    hideOnSinglePage: true,
                }}
                onRow={(record) => {
                    return {
                        onClick: () => {
                            navigate({
                                to: `/tracked-entity/$trackedEntity`,
                                params: { trackedEntity: record.trackedEntity },
                            });
                        },
                        style: { cursor: "pointer" },
                    };
                }}
                scroll={{ x: "max-content" }}
            />

            <DataModal<FlattenedTrackedEntity>
                open={isOpen}
                data={trackedEntity}
                enrollment={enrollment}
                onClose={closeModal}
                onSave={async ({ values, addAnother }) => {
                    if (values && trackedEntity && enrollment) {
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
                        syncActor.send({
                            type: "SYNC_ENTITIES",
                            entities: [
                                {
                                    ...enrollment,
                                    attributes: {
                                        ...enrollment.attributes,
                                        ...values,
                                    },
                                    syncStatus: "pending",
                                },
                                {
                                    ...trackedEntity,
                                    attributes: {
                                        ...trackedEntity.attributes,
                                        ...values,
                                    },
                                },
                            ],
                        });
                        if (addAnother) {
                            closeModal();
                            await createAndOpenNewPatient();
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
                {(form) => (
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
                            initialValues={trackedEntity?.attributes}
                        >
                            <TrackerRegistration
                                trackedEntity={trackedEntity!}
                                form={form}
                            />
                        </Form>
                    </TrackedEntityContext.Provider>
                )}
            </DataModal>
        </Card>
    );
}
