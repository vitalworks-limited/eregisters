import {
    DashboardOutlined,
    MoreOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { createRoute } from "@tanstack/react-router";
import {
    Button,
    Card,
    Dropdown,
    Flex,
    MenuProps,
    Table,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import React from "react";
import { DataModal } from "../components/data-modal";
import NoPatientsCard from "../components/no-patient-card";
import { useModalState } from "../hooks/useModalState";
import { resourceQueryOptions } from "../query-options";
import { FlattenedTrackedEntity, TrackedEntityResponse } from "../schemas";
import {
    createEmptyTrackedEntity,
    flattenTrackedEntityResponse,
} from "../utils/utils";
import { RootRoute } from "./__root";
import { TrackedEntitiesRoute } from "./tracked-entities";
import { TrackerRegistration } from "../components/tracker-registration";
import { db } from "../db";

const { Text } = Typography;
export const TrackedEntitiesIndexRoute = createRoute({
    getParentRoute: () => TrackedEntitiesRoute,
    path: "/",
    component: TrackedEntitiesSearch,
    loaderDeps: ({ search }) => ({ search }),
    loader: async ({
        context: { queryClient, engine },
        deps: {
            search: { search },
        },
    }) => {
        const params = new URLSearchParams({
            program: "ueBhWkWll5v",
            orgUnitMode: "ACCESSIBLE",
            order: "updatedAt:DESC",
            fields: "trackedEntity,trackedEntityType,orgUnit,createdAt,updatedAt,createdAtClient,updatedAtClient,inactive,deleted,potentialDuplicate,attributes",
        });
        if (search && Object.values(search).length > 0) {
            for (const [filterKey, filterValues] of Object.entries(search)) {
                if (filterValues && filterValues) {
                    params.append(
                        `filter`,
                        `${filterKey}:ilike:${filterValues}`,
                    );
                }
            }
            const localSearch = await db.trackedEntities
                .filter((te) => {
                    return Object.entries(search).every(
                        ([filterKey, filterValue]) => {
                            return te.attributes[filterKey]?.includes(
                                filterValue,
                            );
                        },
                    );
                })
                .toArray();

            if (localSearch.length > 0) {
                return localSearch;
            }
            const data = await queryClient.fetchQuery(
                resourceQueryOptions<TrackedEntityResponse>({
                    engine,
                    resource: `tracker/trackedEntities?${params.toString()}`,
                    queryKey: ["trackedEntities", search],
                }),
            );
            const results = flattenTrackedEntityResponse(data);
            await db.trackedEntities.bulkPut(results);
            // await db.events.bulkPut(events);
            return results;
        }

        return [];
    },
});

function TrackedEntitiesSearch() {
    const {
        orgUnit: { id },
    } = RootRoute.useRouteContext();
    const trackedEntities = TrackedEntitiesIndexRoute.useLoaderData();
    const { program, trackedEntityAttributes, organisations } =
        RootRoute.useLoaderData();
    const navigate = TrackedEntitiesIndexRoute.useNavigate();
    const { data, isOpen, openModal, closeModal } =
        useModalState<FlattenedTrackedEntity>();
    const { orgUnits, search } = TrackedEntitiesRoute.useSearch();
    const handleCreate = async () => {
        const newPatient: FlattenedTrackedEntity = createEmptyTrackedEntity({
            orgUnit: id,
        });
        await db.trackedEntities.put(newPatient);
        openModal(newPatient);
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
        ...program.programTrackedEntityAttributes.map(
            ({ trackedEntityAttribute: { id }, ...rest }) => ({
                ...rest,
                ...trackedEntityAttributes.get(id)!,
            }),
        ),
        {
            displayInList: true,
            displayFormName: "Actions",
            name: "Actions",
            id: "actions",
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
        trackedEntities.length === 0 &&
        Object.values(search ?? {}).some(Boolean)
    )
        return (
            <NoPatientsCard message="No clients found matching your search criteria." />
        );
    if (trackedEntities.length === 0) return <NoPatientsCard message="" />;
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
                    <Text>{`${trackedEntities.length} results matching`}</Text>
                    <Button type="primary" size="large" onClick={handleCreate}>
                        Register New Client
                    </Button>
                </Flex>
            }
        >
            <Table
                columns={columns}
                dataSource={trackedEntities}
                rowKey="trackedEntity"
                pagination={{
                    pageSize: 5,
                    showSizeChanger: true,
                    total: trackedEntities.length,
                    showTotal: (total, range) =>
                        `Showing ${range[0]} to ${range[1]} of ${total}`,
                    hideOnSinglePage: true,
                }}
                onRow={(record) => {
                    return {
                        onClick: () => {
                            navigate({
                                to: `/tracked-entity/$trackedEntity`,
                                search: { orgUnits },
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
                        if (!addAnother) {
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
                    if (addAnother) {
                        const newPatient: FlattenedTrackedEntity =
                            createEmptyTrackedEntity({
                                orgUnit: id,
                            });
                        await db.trackedEntities.put(newPatient);
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
}
