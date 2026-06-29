import {
    DashboardOutlined,
    MoreOutlined,
    PlusOutlined,
    UserOutlined,
} from "@ant-design/icons";
import {
    and,
    eq,
    ilike,
    not,
    or,
    useLiveQuery,
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
import { SyncContext } from "../machines/sync";
import { markNextSyncManual } from "../sync/telemetry";
import { useOnlineSearchCount } from "../hooks/useOnlineSearchCount";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { usePatientRegistrationTrigger } from "../hooks/usePatientRegistrationTrigger";

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
    const syncActor = SyncContext.useActorRef();
    const lastDataPull = SyncContext.useSelector(
        (s) => s.context.lastDataPull,
    );

    // How many non-draft patients live on this device for this facility?
    // Used to differentiate "empty database" from "search miss" in the
    // empty-state copy.
    const { data: facilityTotal = [] } = useLiveQuery(
        (q) =>
            q
                .from({ t: trackedEntitiesCollection })
                .where(({ t }) =>
                    and(
                        eq(t.orgUnit, id),
                        not(eq(t.syncStatus, "draft")),
                    ),
                ),
        [id],
    );
    const totalLocalClients = facilityTotal.length;
    const online = useOnlineStatus();
    const openRegistration = usePatientRegistrationTrigger();

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
                const words = globalQuery.split(/\s+/).filter(Boolean);
                if (words.length > 0) {
                    query = query.where(({ trackedEntity }) => {
                        const perWord = words.map((word) => {
                            const pattern = `%${word}%`;
                            const matches = searchableAttrIds.map((aid) =>
                                ilike(trackedEntity.attributes[aid], pattern),
                            );
                            if (matches.length === 1) return matches[0];
                            const [first, second, ...rest] = matches;
                            return or(first, second, ...rest);
                        });
                        if (perWord.length === 1) return perWord[0];
                        const [first, second, ...rest] = perWord;
                        return and(first, second, ...rest);
                    });
                }
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

    // Online-side search: ask the server if it knows anyone matching
    // the query so users on freshly-installed devices can find a
    // patient without doing a full pull first.
    const serverSearch = useOnlineSearchCount({
        program: program?.id,
        orgUnit: id,
        query: globalQuery ?? "",
        online,
        enabled: !!globalQuery,
    });

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
            <Col span={24} style={{ display: "flex" }}>
                <EmptyState
                    title={
                        totalLocalClients === 0
                            ? "No patients on this device yet"
                            : "Search before registering"
                    }
                    description={
                        totalLocalClients === 0
                            ? "Pull data from the server, or search the registry first — a patient may already exist before you register them again."
                            : `Enter a name, NIN, phone, or village above to find an existing record. ${totalLocalClients} patient${totalLocalClients === 1 ? "" : "s"} on this device. Search first to avoid duplicates.`
                    }
                    action={
                        <Flex gap={8} wrap justify="center">
                            {totalLocalClients === 0 && (
                                <Button
                                    type="primary"
                                    onClick={() => {
                                        markNextSyncManual();
                                        syncActor.send({
                                            type: "FULL_DATA_SYNC",
                                        });
                                    }}
                                >
                                    Pull data now
                                </Button>
                            )}
                            {openRegistration && (
                                <Button
                                    type={
                                        totalLocalClients === 0
                                            ? "default"
                                            : "primary"
                                    }
                                    icon={<PlusOutlined />}
                                    onClick={openRegistration}
                                >
                                    Register new patient
                                </Button>
                            )}
                        </Flex>
                    }
                />
            </Col>
        );
    }

    if (currentTrackedEntities.length === 0) {
        const serverHasResults =
            online && !!globalQuery && serverSearch.total > 0;
        return (
            <Col span={24} style={{ display: "flex" }}>
                <EmptyState
                    title={
                        serverHasResults ? "On the server" : "No matches"
                    }
                    description={
                        serverHasResults
                            ? `Server has ${serverSearch.total.toLocaleString()} matching patient${serverSearch.total === 1 ? "" : "s"} for "${globalQuery}" that aren't yet on this device. Pull to load them.`
                            : totalLocalClients === 0
                              ? "There are no patients on this device yet. Pull data from the server first, or register a new patient."
                              : `Your search didn't match any of the ${totalLocalClients} patient${totalLocalClients === 1 ? "" : "s"} on this device. Try a shorter term, check spelling, or pull recent server changes.`
                    }
                    action={
                        <Flex gap={8} wrap justify="center">
                            {totalLocalClients === 0 || serverHasResults ? (
                                <Button
                                    type="primary"
                                    onClick={() => {
                                        markNextSyncManual();
                                        syncActor.send({
                                            type: "FULL_DATA_SYNC",
                                        });
                                    }}
                                >
                                    Pull data now
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => {
                                        markNextSyncManual();
                                        syncActor.send({
                                            type: lastDataPull
                                                ? "START_DATA_SYNC"
                                                : "FULL_DATA_SYNC",
                                        });
                                    }}
                                >
                                    Pull changes
                                </Button>
                            )}
                            {openRegistration && (
                                <Button
                                    type={
                                        serverHasResults
                                            ? "default"
                                            : "primary"
                                    }
                                    icon={<PlusOutlined />}
                                    onClick={openRegistration}
                                >
                                    Register new patient
                                </Button>
                            )}
                        </Flex>
                    }
                />
            </Col>
        );
    }

    const serverHasMore =
        online &&
        !!globalQuery &&
        serverSearch.total > currentTrackedEntities.length;

    return (
        <Col span={24}>
            {serverHasMore && (
                <div
                    style={{
                        background: `${token.colorInfo}10`,
                        border: `1px solid ${token.colorInfo}40`,
                        padding: `${token.paddingSM}px ${token.padding}px`,
                        marginBottom: token.marginSM,
                    }}
                >
                    <Flex
                        align="center"
                        justify="space-between"
                        gap={token.marginSM}
                        wrap
                    >
                        <Text style={{ color: token.colorInfoText }}>
                            Server has{" "}
                            <Text strong>
                                {serverSearch.total.toLocaleString()}
                            </Text>{" "}
                            matching patient
                            {serverSearch.total === 1 ? "" : "s"} for{" "}
                            <Text code>{globalQuery}</Text>
                            {currentTrackedEntities.length > 0 && (
                                <>
                                    {" "}
                                    — {currentTrackedEntities.length} on this
                                    device,{" "}
                                    {serverSearch.total -
                                        currentTrackedEntities.length}{" "}
                                    not yet pulled.
                                </>
                            )}
                        </Text>
                        <Button
                            type="primary"
                            size="small"
                            onClick={() => {
                                markNextSyncManual();
                                syncActor.send({
                                    type: lastDataPull
                                        ? "START_DATA_SYNC"
                                        : "FULL_DATA_SYNC",
                                });
                            }}
                        >
                            Pull now
                        </Button>
                    </Flex>
                </div>
            )}
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
                    {openRegistration && (
                        <Button
                            type="primary"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={openRegistration}
                        >
                            Register new patient
                        </Button>
                    )}
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
