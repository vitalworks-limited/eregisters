import { MenuOutlined } from "@ant-design/icons";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import {
    Divider,
    Drawer,
    Flex,
    Grid,
    Layout,
    theme,
    Typography,
} from "antd";
import React, { useEffect, useState } from "react";

import { eq, useLiveQuery } from "@tanstack/react-db";
import { AppNav } from "../components/app-nav";
import { MetadataLoadingStrip } from "../components/metadata-loading-strip";
import { AdminNoticeBanner } from "../components/admin-notice-banner";
import { OfflineBanner } from "../components/offline-banner";
import { OnlineIndicator } from "../components/online-indicator";
import { OrgUnitChip } from "../components/org-unit-chip";
import { SupportInfo } from "../components/support-info";
import { SyncPopover } from "../components/sync-popover";
import { ThemeToggle } from "../components/theme-toggle";
import {
    enrollmentsCollection,
    eventsCollection,
    trackedEntitiesCollection,
} from "../collections";
import { SyncContext } from "../machines/sync";

const { Content } = Layout;
const { Title, Text } = Typography;

const BRAND_BAR_HEIGHT = 60;
const UGANDA_LOGO_URL =
    "https://upload.wikimedia.org/wikipedia/commons/7/7c/Coat_of_arms_of_Uganda.svg";

export const RootRoute = createRootRouteWithContext<{
    syncActor: ReturnType<typeof SyncContext.useActorRef>;
}>()({
    component: LayoutWithDrafts,
});

function BrandMark({ showWordmark }: { showWordmark: boolean }) {
    const { token } = theme.useToken();
    return (
        <Flex align="center" gap={token.marginSM}>
            <img
                src={UGANDA_LOGO_URL}
                alt="Uganda Coat of Arms"
                style={{ height: showWordmark ? 34 : 28 }}
            />
            {showWordmark && (
                <Title
                    level={4}
                    style={{
                        margin: 0,
                        color: token.colorPrimary,
                        fontWeight: 600,
                        lineHeight: 1.2,
                        whiteSpace: "nowrap",
                        letterSpacing: -0.2,
                    }}
                >
                    Medical{" "}
                    <Text
                        type="secondary"
                        style={{ fontWeight: 400, fontSize: "inherit" }}
                    >
                        eRegistry
                    </Text>
                </Title>
            )}
        </Flex>
    );
}

function LayoutWithDrafts() {
    const syncActor = SyncContext.useActorRef();
    const { token } = theme.useToken();

    // Read metadata directly off the sync machine so we never throw during
    // the initial load — the chrome stays put and only the body swaps.
    const orgUnit = SyncContext.useSelector(
        (s) => s.context.metadata?.orgUnit,
    );

    // Metadata is ready when the sync machine reaches either of these
    // states. `failure` is treated as ready so the app surfaces an error
    // route instead of spinning forever (see Phase 5 of the earlier work).
    const metadataReady = SyncContext.useSelector(
        (s) =>
            s.matches({ metadataSync: "waiting" }) ||
            s.matches({ metadataSync: "failure" }),
    );

    // Non-suspense versions so the chrome can render before any data has
    // landed in the Dexie tables (i.e. on the first cold start).
    const { data: pendingTrackedEntities = [] } = useLiveQuery((q) =>
        q
            .from({ trackedEntities: trackedEntitiesCollection })
            .where(({ trackedEntities }) =>
                eq(trackedEntities.syncStatus, "pending"),
            ),
    );
    const { data: pendingEnrollments = [] } = useLiveQuery((q) =>
        q
            .from({ enrollments: enrollmentsCollection })
            .where(({ enrollments }) => eq(enrollments.syncStatus, "pending")),
    );
    const { data: pendingEvents = [] } = useLiveQuery((q) =>
        q
            .from({ events: eventsCollection })
            .where(({ events }) => eq(events.syncStatus, "pending")),
    );
    const pendingCount =
        pendingTrackedEntities.length +
        pendingEnrollments.length +
        pendingEvents.length;

    useEffect(() => {
        const handleOnline = () =>
            syncActor.send({ type: "NETWORK_RECONNECT" });
        window.addEventListener("online", handleOnline);
        return () => window.removeEventListener("online", handleOnline);
    }, [syncActor]);

    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const showWordmark = !!screens.sm;
    const [drawerOpen, setDrawerOpen] = useState(false);

    const brandBar = (
        <div
            style={{
                background: token.colorBgContainer,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                padding: `0 ${token.padding}px`,
                height: BRAND_BAR_HEIGHT,
                display: "flex",
                alignItems: "stretch",
                justifyContent: "space-between",
                gap: token.marginLG,
            }}
        >
            <Flex
                align="center"
                gap={token.marginLG}
                style={{ minWidth: 0, flex: "0 1 auto" }}
            >
                <Flex
                    align="center"
                    gap={token.marginSM}
                    style={{ minWidth: 0 }}
                >
                    {isMobile && metadataReady && (
                        <button
                            type="button"
                            aria-label="Open navigation"
                            onClick={() => setDrawerOpen(true)}
                            style={{
                                background: "transparent",
                                border: "none",
                                padding: token.paddingXS,
                                cursor: "pointer",
                                color: token.colorTextSecondary,
                                display: "inline-flex",
                                alignItems: "center",
                            }}
                        >
                            <MenuOutlined style={{ fontSize: 20 }} />
                        </button>
                    )}
                    <BrandMark showWordmark={showWordmark} />
                </Flex>
                {!isMobile && metadataReady && (
                    <nav
                        role="navigation"
                        aria-label="Primary"
                        style={{ display: "flex", alignItems: "stretch" }}
                    >
                        <AppNav orientation="horizontal" />
                    </nav>
                )}
            </Flex>
            <Flex align="center" gap={token.marginSM}>
                <OnlineIndicator />
                {!isMobile && orgUnit?.name && (
                    <OrgUnitChip name={orgUnit.name} id={orgUnit.id} />
                )}
                <SyncPopover
                    pendingCount={pendingCount}
                    compact={isMobile}
                />
                <ThemeToggle />
            </Flex>
        </div>
    );

    return (
        <Layout
            style={{
                minHeight: "calc(100vh - 48px)",
                background: token.colorBgLayout,
            }}
        >
            <a
                href="#main-content"
                style={{
                    position: "absolute",
                    insetInlineStart: 8,
                    insetBlockStart: 8,
                    background: token.colorBgContainer,
                    color: token.colorPrimary,
                    padding: `${token.paddingXXS}px ${token.paddingSM}px`,
                    border: `1px solid ${token.colorBorder}`,
                    zIndex: 100,
                    transform: "translateY(-200%)",
                    transition: "transform 120ms",
                }}
                onFocus={(e) =>
                    (e.currentTarget.style.transform = "translateY(0)")
                }
                onBlur={(e) =>
                    (e.currentTarget.style.transform = "translateY(-200%)")
                }
            >
                Skip to main content
            </a>
            <OfflineBanner />
            <AdminNoticeBanner />
            <header role="banner">{brandBar}</header>
            <Drawer
                title="Navigation"
                placement="left"
                onClose={() => setDrawerOpen(false)}
                open={drawerOpen}
                size="default"
                styles={{ body: { padding: 0 } }}
            >
                {orgUnit?.name && (
                    <>
                        <Flex
                            vertical
                            gap={token.marginSM}
                            style={{ padding: token.padding }}
                        >
                            <OrgUnitChip name={orgUnit.name} id={orgUnit.id} />
                        </Flex>
                        <Divider style={{ margin: 0 }} />
                    </>
                )}
                <div style={{ padding: `${token.padding}px 0` }}>
                    <AppNav
                        orientation="vertical"
                        onItemClick={() => setDrawerOpen(false)}
                    />
                </div>
            </Drawer>
            <Content
                id="main-content"
                role="main"
                style={{ display: "flex", flexDirection: "column", flex: 1 }}
            >
                {metadataReady ? <Outlet /> : <MetadataLoadingStrip />}
            </Content>
            <footer role="contentinfo">
                <SupportInfo />
            </footer>
        </Layout>
    );
}
