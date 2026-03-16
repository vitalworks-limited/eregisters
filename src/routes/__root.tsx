import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import React from "react";

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

const { Header } = Layout;
const { Title, Text } = Typography;

const queryInfo = async () => {
    const dataElements = await db.dataElements.toArray();
    const trackedEntityAttributes = await db.trackedEntityAttributes.toArray();
    const programRules = await db.programRules.toArray();
    const programRuleVariables = await db.programRuleVariables.toArray();
    const optionGroups = await db.optionGroups.toArray();
    const optionSets = await db.optionSets.toArray();
    const [program] = await db.programs.toArray();
    const [orgUnit] = await db.organisationUnits.toArray();

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
}>()({
    component: LayoutWithDrafts,
    pendingComponent: () => (
        <Spinner
            component={<Typography.Text>Loading Metadata</Typography.Text>}
        />
    ),
    loader: async ({ context: { syncActor } }) => {
        try {
            const data = await queryInfo();
            if (!data.program || !data.orgUnit) {
                syncActor.send({ type: "FULL_METADATA_SYNC" });
            }
            return data;
        } catch (error) {
            syncActor.send({ type: "FULL_METADATA_SYNC" });
            await db.delete();
            await db.open();
            return await queryInfo();
        }
    },
});

function LayoutWithDrafts() {
    const { orgUnit } = RootRoute.useLoaderData();
    const syncActor = SyncContext.useActorRef();
    const syncingMetadata = SyncContext.useSelector((a) =>
        a.matches({ metadataSync: "syncing" }),
    );
    const syncingData = SyncContext.useSelector((a) =>
        a.matches({ dataPull: "syncing" }),
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
    if (syncingMetadata && orgUnit === undefined) {
        return (
            <Spinner
                component={<Typography.Text>Loading Metadata</Typography.Text>}
            />
        );
    }

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

                <Space>
                    <Badge
                        count={
                            pendingEnrollments.length +
                            pendingEvents.length +
                            pendingTrackedEntities.length
                        }
                        style={{ backgroundColor: "#faad14" }}
                        title="Pending entities to sync"
                    />
                    <HomeOutlined style={{ fontSize: 20, color: "#1890ff" }} />
                    <Text strong>{orgUnit.name}</Text>
                    {/* <SyncStatus syncManager={syncManager} /> */}
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
                            {syncingData ? "Pulling..." : "Pull Data"}
                        </Button>
                    </Tooltip>
                    {/* <MetadataSyncComponent
                        metadataSync={syncManager.getMetadataSync()}
                    /> */}
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
                            {syncingMetadata ? "Syncing..." : "Sync Metadata"}
                        </Button>
                    </Tooltip>
                </Space>
            </Header>
            <Outlet />
        </Layout>
    );
}
