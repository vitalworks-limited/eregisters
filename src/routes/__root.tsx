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
import React, { useState } from "react";

import { eq, useLiveSuspenseQuery } from "@tanstack/react-db";
import { waitFor } from "xstate";
import { Spinner } from "../components/spinner";
import { useMetadata } from "../hooks/useMetadata";
import { SyncContext } from "../machines/sync";
import {
    isDataPullLoading,
    isDataPushLoading,
    isMetadataSyncLoading,
} from "../machines/sync-metadata-mode";
import {
    trackedEntitiesCollection,
    enrollmentsCollection,
    eventsCollection,
} from "../collections";

dayjs.extend(relativeTime);

const { Header } = Layout;
const { Title, Text } = Typography;

export const RootRoute = createRootRouteWithContext<{
    syncActor: ReturnType<typeof SyncContext.useActorRef>;
}>()({
    component: LayoutWithDrafts,
    pendingComponent: () => (
        <Spinner
            component={<Typography.Text>Loading Metadata</Typography.Text>}
        />
    ),
    loader: async ({ context: { syncActor } }) => {
        await waitFor(syncActor, (snapshot) => {
            return snapshot.matches({ metadataSync: "waiting" });
        });
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
    const syncActor = SyncContext.useActorRef();
    const { orgUnit } = useMetadata();
    const syncingMetadata = SyncContext.useSelector((snapshot) => {
        return isMetadataSyncLoading(
            snapshot.matches({ metadataSync: "syncing" }) ||
                snapshot.matches({ metadataSync: "deletingMetadata" }) ||
                snapshot.matches({ metadataSync: "savingMetadata" }),
            snapshot.context.lastMetadataPull,
        );
    });

    const syncingData = SyncContext.useSelector((snapshot) =>
        isDataPullLoading(
            snapshot.matches({ dataPull: "syncing" }),
            snapshot.context.lastDataPull,
        ),
    );

    const pushingData = SyncContext.useSelector((snapshot) =>
        isDataPushLoading(
            snapshot.matches({ dataSync: "directSync" }) ||
                snapshot.matches({ dataSync: "uploadingDirect" }) ||
                snapshot.matches({ dataSync: "batchSync" }),
        ),
    );
    const lastDataPull = SyncContext.useSelector((a) => a.context.lastDataPull);
    const lastDataPush = SyncContext.useSelector((a) => a.context.lastDataPush);
    const lastMetadataPull = SyncContext.useSelector(
        (a) => a.context.lastMetadataPull,
    );
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
    const isMobile = !screens.lg;
    const isLarge = !screens.xl;
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
                lastTime={
                    lastDataPull ? dayjs(lastDataPull).fromNow() : undefined
                }
                onClick={() => syncActor.send({ type: "START_DATA_SYNC" })}
            />
            <SyncButton
                tooltip="Sync metadata"
                icon={<ReloadOutlined />}
                isLoading={syncingMetadata}
                idleLabel="Sync Metadata"
                loadingLabel="Syncing..."
                lastTime={
                    lastMetadataPull
                        ? dayjs(lastMetadataPull).fromNow()
                        : undefined
                }
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
                        lastTime={
                            lastDataPush
                                ? dayjs(lastDataPush).fromNow()
                                : undefined
                        }
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

                {isMobile || isLarge ? (
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
