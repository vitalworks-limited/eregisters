import {
    CloudDownloadOutlined,
    CloudUploadOutlined,
    HomeOutlined,
    MenuOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import {
    createRootRouteWithContext,
    Link,
    Outlet,
} from "@tanstack/react-router";
import {
    Badge,
    Button,
    Drawer,
    Flex,
    Grid,
    Layout,
    Tooltip,
    Typography,
} from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { groupBy } from "lodash";
import React, { useState } from "react";

import { eq, useLiveSuspenseQuery } from "@tanstack/react-db";
import { Spinner } from "../components/spinner";
import { db } from "../db";
import { SyncContext } from "../machines/sync";

dayjs.extend(relativeTime);

const { Header } = Layout;
const { Title, Text } = Typography;

const queryInfo = async (user: string) => {
    const dataElements = await db.dataElements.toArray();
    const trackedEntityAttributes = await db.trackedEntityAttributes.toArray();
    const programRules = await db.programRules.toArray();
    const programRuleVariables = await db.programRuleVariables.toArray();
    const optionGroups = await db.optionGroups.toArray();
    const optionSets = await db.optionSets.toArray();
    const [program] = await db.programs.toArray();
    const [orgUnit] = await db.organisationUnits.where({ user }).toArray();
    return {
        dataElements: new Map(dataElements.map((de) => [de.id, de])),
        trackedEntityAttributes: new Map(
            trackedEntityAttributes.map((ta) => [ta.id, ta]),
        ),
        programRules,
        programRuleVariables,
        optionGroups: new Map(Object.entries(groupBy(optionGroups, "optionGroup"))),
        optionSets: new Map(Object.entries(groupBy(optionSets, "optionSet"))),
        program,
        programOrgUnits: new Set(
            program?.organisationUnits.map(({ id }) => id),
        ),
        organisations: new Map(
            program?.organisationUnits.map((ou) => [ou.id, ou.name]),
        ),
        orgUnit,
    };
};

export const RootRoute = createRootRouteWithContext<{
    syncActor: ReturnType<typeof SyncContext.useActorRef>;
    user: string;
}>()({
    component: LayoutWithDrafts,
    pendingComponent: () => (
        <Spinner
            component={<Typography.Text>Loading Metadata</Typography.Text>}
        />
    ),
    loader: async ({ context: { user } }) => {
        try {
            let data = await queryInfo(user);
            if (!data.orgUnit) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                data = await queryInfo(user);
            }

            return data;
        } catch (error) {
            await db.delete();
            await db.open();
            return await queryInfo(user);
        }
    },
});

function SyncButton({
    tooltip,
    icon,
    isLoading,
    idleLabel,
    loadingLabel,
    lastTime,
    onClick,
    type,
    danger,
}: {
    tooltip: string;
    icon: React.ReactNode;
    isLoading: boolean;
    idleLabel: string;
    loadingLabel: string;
    lastTime?: string;
    onClick: () => void;
    type?: "primary" | "default";
    danger?: boolean;
}) {
    return (
        <Tooltip title={tooltip}>
            <Button
                icon={icon}
                loading={isLoading}
                onClick={onClick}
                type={type}
                danger={danger}
                style={{ height: "auto", padding: "4px 12px" }}
            >
                <Flex vertical align="flex-start" gap={0}>
                    <span>{isLoading ? loadingLabel : idleLabel}</span>
                    {lastTime && (
                        <Text
                            type="secondary"
                            style={{ fontSize: 10, lineHeight: 1 }}
                        >
                            {lastTime}
                        </Text>
                    )}
                </Flex>
            </Button>
        </Tooltip>
    );
}

function LayoutWithDrafts() {
    const { orgUnit } = RootRoute.useLoaderData();
    const syncActor = SyncContext.useActorRef();
    const syncingMetadata = SyncContext.useSelector((snapshot) => {
        const isManualRefresh =
            (snapshot.matches({ metadataSync: "syncing" }) ||
                snapshot.matches({ metadataSync: "fullRefresh" })) &&
            snapshot.context.lastMetadataPull !== undefined;
        return isManualRefresh;
    });
    const syncingData = SyncContext.useSelector((a) =>
        a.matches({ dataPull: "syncing" }),
    );

    const pushingData = SyncContext.useSelector((a) =>
        a.matches({ dataSync: "batchSync" }),
    );
    const lastDataPull = SyncContext.useSelector((a) => a.context.lastDataPull);
    const lastDataPush = SyncContext.useSelector((a) => a.context.lastDataPush);
    const lastMetadataPull = SyncContext.useSelector(
        (a) => a.context.lastMetadataPull,
    );
    const {
        trackedEntitiesCollection,
        enrollmentsCollection,
        eventsCollection,
    } = SyncContext.useSelector((a) => ({
        trackedEntitiesCollection: a.context.trackedEntitiesCollection,
        enrollmentsCollection: a.context.enrollmentsCollection,
        eventsCollection: a.context.eventsCollection,
    }));
    const { data: pendingTrackedEntities } = useLiveSuspenseQuery((q) =>
        q
            .from({ trackedEntities: trackedEntitiesCollection })
            .where(({ trackedEntities }) =>
                eq(trackedEntities.syncStatus, "pending"),
            ),
    );
    const { data: pendingEnrollments } = useLiveSuspenseQuery((q) =>
        q
            .from({ enrollments: enrollmentsCollection })
            .where(({ enrollments }) => eq(enrollments.syncStatus, "pending")),
    );
    const { data: pendingEvents } = useLiveSuspenseQuery((q) =>
        q
            .from({ events: eventsCollection })
            .where(({ events }) => eq(events.syncStatus, "pending")),
    );

    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const [drawerOpen, setDrawerOpen] = useState(false);

    const navItems = (vertical: boolean) => (
        <Flex
            align={vertical ? "flex-start" : "center"}
            justify="center"
            gap={vertical ? 16 : 10}
            vertical={vertical}
        >
            <Link to="/" onClick={() => setDrawerOpen(false)}>
                <Flex align="center" justify="center" gap={5}>
                    <HomeOutlined style={{ fontSize: 20, color: "#1890ff" }} />
                    <Text strong>{orgUnit?.name ?? "Loading..."}</Text>
                </Flex>
            </Link>
            <SyncButton
                tooltip="Pull latest data from server"
                icon={<CloudDownloadOutlined />}
                isLoading={syncingData}
                idleLabel="Pull Data"
                loadingLabel="Pulling..."
                lastTime={lastDataPull ? dayjs(lastDataPull).fromNow() : undefined}
                onClick={() => syncActor.send({ type: "START_DATA_SYNC" })}
            />
            <SyncButton
                tooltip="Sync metadata"
                icon={<ReloadOutlined />}
                isLoading={syncingMetadata}
                idleLabel="Sync Metadata"
                loadingLabel="Syncing..."
                lastTime={lastMetadataPull ? dayjs(lastMetadataPull).fromNow() : undefined}
                onClick={() => syncActor.send({ type: "FULL_METADATA_SYNC" })}
                type="primary"
            />
            <Tooltip title="Push Data">
                <Badge
                    count={
                        pendingEnrollments.length +
                        pendingEvents.length +
                        pendingTrackedEntities.length
                    }
                    style={{ backgroundColor: "#faad14" }}
                    title="Pending entities to sync"
                    showZero
                >
                    <SyncButton
                        tooltip="Push Data"
                        icon={<CloudUploadOutlined />}
                        isLoading={pushingData}
                        idleLabel="Push Data"
                        loadingLabel="Pushing..."
                        lastTime={lastDataPush ? dayjs(lastDataPush).fromNow() : undefined}
                        onClick={() => syncActor.send({ type: "PUSH_DATA" })}
                        danger
                    />
                </Badge>
            </Tooltip>
            <Link to="/reports" onClick={() => setDrawerOpen(false)}>
                Reports
            </Link>
        </Flex>
    );

    return (
        <Layout
            style={{
                minHeight: "calc(100vh - 48px)",
                background: "#f0f2f5",
            }}
        >
            <Header
                style={{
                    background: "#fff",
                    padding: "0 16px",
                    display: "flex",
                    alignItems: "center",
                    alignContent: "center",
                    justifyItems: "center",
                    justifyContent: "space-between",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
            >
                <Flex align="center" gap={isMobile ? "middle" : "large"}>
                    <img
                        src="https://upload.wikimedia.org/wikipedia/commons/7/7c/Coat_of_arms_of_Uganda.svg"
                        alt="Uganda Coat of Arms"
                        style={{ height: isMobile ? 36 : 54 }}
                    />
                    <Title
                        level={isMobile ? 5 : 3}
                        style={{ margin: 0, color: "#1f4788" }}
                    >
                        Medical{" "}
                        <Text style={{ fontWeight: 300 }}>eRegistry</Text>
                    </Title>
                </Flex>

                {isMobile ? (
                    <Button
                        type="text"
                        icon={<MenuOutlined style={{ fontSize: 20 }} />}
                        onClick={() => setDrawerOpen(true)}
                    />
                ) : (
                    navItems(false)
                )}
            </Header>
            <Drawer
                title="Navigation"
                placement="right"
                onClose={() => setDrawerOpen(false)}
                open={drawerOpen}
                size={280}
            >
                {navItems(true)}
            </Drawer>
            <Outlet />
        </Layout>
    );
}
