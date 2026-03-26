import {
    createRootRouteWithContext,
    Link,
    Outlet,
} from "@tanstack/react-router";
import React from "react";
import relativeTime from "dayjs/plugin/relativeTime";
import dayjs from "dayjs";
import {
    CloudDownloadOutlined,
    HomeOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import { Badge, Button, Flex, Layout, Space, Tooltip, Typography } from "antd";
import { groupBy } from "lodash";

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
        optionGroups: new Map(
            Object.entries(groupBy(optionGroups, "optionGroup")).map(
                ([id, og]) => [id, og],
            ),
        ),
        optionSets: new Map(
            Object.entries(groupBy(optionSets, "optionSet")).map(([id, os]) => [
                id,
                os,
            ]),
        ),
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

            // Safety check: if orgUnit missing, wait and retry once
            if (!data.orgUnit) {
                await new Promise(resolve => setTimeout(resolve, 500));
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

function LayoutWithDrafts() {
    const { orgUnit } = RootRoute.useLoaderData();
    const syncActor = SyncContext.useActorRef();
    const syncingMetadata = SyncContext.useSelector((snapshot) => {
        // Only show button loading if syncing AND have synced before (manual refresh)
        const isManualRefresh =
            (snapshot.matches({ metadataSync: "syncing" }) ||
             snapshot.matches({ metadataSync: "fullRefresh" })) &&
            snapshot.context.lastMetadataPull !== undefined;
        return isManualRefresh;
    });
    const syncingData = SyncContext.useSelector((a) =>
        a.matches({ dataPull: "syncing" }),
    );
    const lastDataPull = SyncContext.useSelector((a) => a.context.lastDataPull);
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
                <Flex align="center" gap="large">
                    <img
                        src="https://upload.wikimedia.org/wikipedia/commons/7/7c/Coat_of_arms_of_Uganda.svg"
                        alt="Uganda Coat of Arms"
                        style={{ height: 54 }}
                    />
                    <Title level={3} style={{ margin: 0, color: "#1f4788" }}>
                        Medical{" "}
                        <Text style={{ fontWeight: 300 }}>eRegistry</Text>
                    </Title>
                </Flex>

                <Flex align="center" justify="center" gap={10}>
                    <Badge
                        count={
                            pendingEnrollments.length +
                            pendingEvents.length +
                            pendingTrackedEntities.length
                        }
                        style={{ backgroundColor: "#faad14" }}
                        title="Pending entities to sync"
                    />
                    <Link to="/">
                        <Flex align="center" justify="center" gap={5}>
                            <HomeOutlined
                                style={{ fontSize: 20, color: "#1890ff" }}
                            />
                            <Text strong>{orgUnit?.name ?? "Loading..."}</Text>
                        </Flex>
                    </Link>
                    <Tooltip title="Pull latest data from server">
                        <Button
                            icon={<CloudDownloadOutlined />}
                            loading={syncingData}
                            onClick={() => {
                                syncActor.send({
                                    type: "START_DATA_SYNC",
                                });
                            }}
                            size="small"
                        >
                            {syncingData
                                ? "Pulling..."
                                : `Pull Data|Updated ${lastDataPull ? dayjs(lastDataPull).fromNow() : ""}`}
                        </Button>
                    </Tooltip>

                    <Tooltip title="Sync metadata">
                        <Button
                            type="primary"
                            icon={<ReloadOutlined />}
                            onClick={() => {
                                syncActor.send({ type: "FULL_METADATA_SYNC" });
                            }}
                            loading={syncingMetadata}
                            size="small"
                        >
                            {syncingMetadata
                                ? "Syncing..."
                                : `Sync Metadata|Updated ${lastMetadataPull ? dayjs(lastMetadataPull).fromNow() : ""}`}
                        </Button>
                    </Tooltip>
                    <Link to="/reports">Reports</Link>
                </Flex>
            </Header>
            <Outlet />
        </Layout>
    );
}
