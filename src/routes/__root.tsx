import { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import React from "react";

import { HomeOutlined } from "@ant-design/icons";
import { useDataEngine } from "@dhis2/app-runtime";
import { Layout, Space, Typography } from "antd";
import { groupBy } from "lodash";

import { Flex } from "antd";
import { OrgUnit } from "../schemas";

import MetadataSyncComponent from "../components/metadata-sync";
import MetadataProgress from "../components/metdata-progress";
import { SyncStatus } from "../components/sync-status";
import { db } from "../db";
import { createMetadataSync } from "../db/metadata-sync";
import { createSyncManager } from "../db/sync";
import { Spinner } from "../components/spinner";

const { Header } = Layout;
const { Title, Text } = Typography;

const queryInfo = async (engine: ReturnType<typeof useDataEngine>) => {
    const metadataSync = createMetadataSync(engine);
    const updateInfo = await metadataSync.checkForUpdates();

    if (updateInfo.hasUpdates) {
        await metadataSync.fullSync();
    }
    const dataElements = await db.dataElements.toArray();
    const trackedEntityAttributes = await db.trackedEntityAttributes.toArray();
    const programRules = await db.programRules.toArray();
    const programRuleVariables = await db.programRuleVariables.toArray();
    const optionGroups = await db.optionGroups.toArray();
    const optionSets = await db.optionSets.toArray();
    const [program] = await db.programs.toArray();
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
        programOrgUnits: new Set(program.organisationUnits.map(({ id }) => id)),
        organisations: new Map(
            program.organisationUnits.map((ou) => [ou.id, ou.name]),
        ),
    };
};

export const RootRoute = createRootRouteWithContext<{
    queryClient: QueryClient;
    engine: ReturnType<typeof useDataEngine>;
    orgUnit: OrgUnit;
    syncManager: ReturnType<typeof createSyncManager>;
}>()({
    component: LayoutWithDrafts,
    pendingComponent: Spinner,
    loader: async ({ context: { engine, syncManager } }) => {
        try {
            return await queryInfo(engine);
        } catch (error) {
            await db.delete();
            await db.open();
            return await queryInfo(engine);
        }
    },
});

function LayoutWithDrafts() {
    const { orgUnit, syncManager } = RootRoute.useRouteContext();
    return (
        <>
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
                        <Title
                            level={3}
                            style={{ margin: 0, color: "#1f4788" }}
                        >
                            Medical{" "}
                            <Text style={{ fontWeight: 300 }}>eRegistry</Text>
                        </Title>
                    </Flex>

                    <Space>
                        <HomeOutlined
                            style={{ fontSize: 20, color: "#1890ff" }}
                        />
                        <Text strong>{orgUnit.name}</Text>
                        <SyncStatus syncManager={syncManager} />
                        <MetadataSyncComponent
                            metadataSync={syncManager.getMetadataSync()}
                        />
                    </Space>
                </Header>

                <Outlet />
            </Layout>
        </>
    );
}
