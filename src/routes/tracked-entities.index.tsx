import {
    DashboardOutlined,
    MoreOutlined,
    UserOutlined,
} from "@ant-design/icons";
import {
    and,
    eq,
    ilike,
    not,
    or,
    useLiveSuspenseQuery,
} from "@tanstack/react-db";
import { createRoute } from "@tanstack/react-router";
import {
    Button,
    Col,
    Dropdown,
    Flex,
    MenuProps,
    Table,
    theme,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import React, { useMemo } from "react";
import { EmptyState } from "../components/empty-state";
import { FlattenedTrackedEntity } from "../schemas";
import { TrackedEntitiesRoute } from "./tracked-entities";
import { useMetadata } from "../hooks/useMetadata";
import { trackedEntitiesCollection } from "../collections";

const { Text } = Typography;

export const TrackedEntitiesIndexRoute = createRoute({
    getParentRoute: () => TrackedEntitiesRoute,
    path: "/",
    component: TrackedEntitiesSearch,
});

function TrackedEntitiesSearch() {
    const { token } = theme.useToken();
    const {
        trackedEntityAttributes,
        organisations,
        program,
        orgUnit: { id },
    } = useMetadata();
    const navigate = TrackedEntitiesIndexRoute.useNavigate();
    const { search } = TrackedEntitiesRoute.useSearch();

    const globalQuery =
        typeof search?._q === "string" && search._q.trim()
            ? search._q.trim()
            : undefined;

    // Per-key filters (any key other than _q) are kept for backwards
    // compatibility — if a future advanced-filter drawer writes them,
    // they'll AND with each other. The free-text _q ORs across all
    // searchable attributes.
    const fieldFilters = useMemo(() => {
        if (!search) return [] as Array<[string, string]>;
        return Object.entries(search).filter(
            ([k, v]) => k !== "_q" && typeof v === "string" && v,
        ) as Array<[string, string]>;
    }, [search]);

    const searchableAttrIds = useMemo(() => {
        if (!program) return [] as string[];
        return program.programTrackedEntityAttributes
            .filter((a) => a.searchable)
            .map((a) => a.trackedEntityAttribute.id);
    }, [program]);

    const hasSearch = !!globalQuery || fieldFilters.length > 0;

    const { data: currentTrackedEntities = [] } = useLiveSuspenseQuery(
        (q) => {
            if (!hasSearch) {
                return q
                    .from({ trackedEntity: trackedEntitiesCollection })
                    .where(() => eq(1, 0));
            }
            let query = q.from({ trackedEntity: trackedEntitiesCollection });

            if (globalQuery && searchableAttrIds.length > 0) {
                const pattern = `%${globalQuery}%`;
                query = query.where(({ trackedEntity }) => {
                    const terms = searchableAttrIds.map((aid) =>
                        ilike(trackedEntity.attributes[aid], pattern),
                    );
                    if (terms.length === 1) return terms[0];
                    const [first, second, ...rest] = terms;
                    return or(first, second, ...rest);
                });
            }
            for (const [filterKey, filterValue] of fieldFilters) {
                query = query.where(({ trackedEntity }) =>
                    ilike(
                        trackedEntity.attributes[filterKey],
                        `%${filterValue}%`,
                    ),
                );
            }
            return query.where(({ trackedEntity }) =>
                and(
                    eq(trackedEntity.orgUnit, id),
                    not(eq(trackedEntity.syncStatus, "draft")),
                ),
            );
        },
        [globalQuery, fieldFilters, searchableAttrIds, id],
    );

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
                render: (record) => organisations.get(record.orgUnit) || "N/A",
            };
        }
        if (trackedEntityAttribute.id === "oTI0DLitzFY") {
            return {
                title:
                    trackedEntityAttribute.displayFormName ||
                    trackedEntityAttribute.name,
                key: trackedEntityAttribute.id,
                dataIndex: ["attributes", "oTI0DLitzFY"],
                render: (text) =>
                    String(text).split("(")[1]?.replace(")", "") ?? "",
            };
        }
        if (trackedEntityAttribute.id === "actions") {
            return {
                title: "",
                key: "action",
                fixed: "right" as const,
                width: 56,
                render: () => (
                    <Dropdown menu={actionMenu} trigger={["click"]}>
                        <Button
                            type="text"
                            icon={<MoreOutlined />}
                            aria-label="Patient actions"
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

    if (!hasSearch) {
        return (
            <Col span={24}>
                <EmptyState
                    title="Search to find a patient"
                    description="Enter a name, NIN, phone, or village above. The search matches across every searchable field on the program."
                />
            </Col>
        );
    }

    if (currentTrackedEntities.length === 0) {
        return (
            <Col span={24}>
                <EmptyState
                    title="No clients found"
                    description="Try different search terms, or register a new client using the button above."
                />
            </Col>
        );
    }

    return (
        <Col span={24}>
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
                    <Text strong>
                        {currentTrackedEntities.length} result
                        {currentTrackedEntities.length === 1 ? "" : "s"}
                    </Text>
                </Flex>
                <Table
                    columns={columns}
                    dataSource={currentTrackedEntities}
                    rowKey="trackedEntity"
                    size="middle"
                    sticky
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        total: currentTrackedEntities.length,
                        showTotal: (total, range) =>
                            `Showing ${range[0]}–${range[1]} of ${total}`,
                        hideOnSinglePage: false,
                    }}
                    onRow={(record) => ({
                        onClick: () =>
                            navigate({
                                to: "/tracked-entity/$trackedEntity",
                                params: {
                                    trackedEntity: record.trackedEntity,
                                },
                            }),
                        style: { cursor: "pointer" },
                    })}
                    scroll={{ x: "max-content" }}
                />
            </div>
        </Col>
    );
}
