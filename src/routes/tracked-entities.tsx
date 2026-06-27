import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
import { createRoute, Outlet } from "@tanstack/react-router";
import {
    Button,
    Flex,
    Grid,
    Input,
    Layout,
    Row,
    theme,
    Typography,
} from "antd";
import dayjs from "dayjs";
import React, { useMemo } from "react";
import { ClientSchema } from "../schemas";
import { trackedEntitiesCollection } from "../collections";
import { useMetadata } from "../hooks/useMetadata";
import { usePatientRegistration } from "../hooks/usePatientRegistration";
import { RootRoute } from "./__root";

const { Content } = Layout;
const { Title, Text } = Typography;

export const TrackedEntitiesRoute = createRoute({
    getParentRoute: () => RootRoute,
    path: "/tracked-entities",
    component: TrackedEntities,
    validateSearch: ClientSchema,
});

function StatChip({
    label,
    value,
    accent,
}: {
    label: string;
    value: React.ReactNode;
    accent: string;
}) {
    const { token } = theme.useToken();
    return (
        <Flex
            align="center"
            gap={token.marginXS}
            style={{
                paddingInline: token.paddingSM,
                paddingBlock: token.paddingXXS,
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
            }}
        >
            <span
                style={{
                    width: 6,
                    height: 6,
                    background: accent,
                    display: "inline-block",
                }}
            />
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                {label}
            </Text>
            <Text strong>{value}</Text>
        </Flex>
    );
}

function TrackedEntities() {
    const { token } = theme.useToken();
    const {
        orgUnit: { id },
    } = useMetadata();

    const navigate = TrackedEntitiesRoute.useNavigate();
    const { search } = TrackedEntitiesRoute.useSearch();

    const { data: total } = useLiveSuspenseQuery(
        (q) =>
            q
                .from({ trackedEntities: trackedEntitiesCollection })
                .where(({ trackedEntities }) =>
                    and(
                        not(eq(trackedEntities.syncStatus, "draft")),
                        eq(trackedEntities.orgUnit, id),
                    ),
                ),
        [id],
    );

    const registeredToday = useMemo(
        () =>
            total.filter(
                (te) =>
                    dayjs(te.createdAt).format("YYYY-MM-DD") ===
                    dayjs().format("YYYY-MM-DD"),
            ).length,
        [total],
    );

    const pendingSync = useMemo(
        () => total.filter((te) => te.syncStatus === "pending").length,
        [total],
    );

    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;

    const { openRegistration, registrationModal } = usePatientRegistration({
        onSaved: (trackedEntityId) =>
            navigate({
                to: "/tracked-entity/$trackedEntity",
                params: { trackedEntity: trackedEntityId },
            }),
    });

    const handleSearchSubmit = (raw: string) => {
        const trimmed = raw.trim();
        navigate({
            search: (prev) => ({
                ...prev,
                search: trimmed ? { _q: trimmed } : undefined,
            }),
        });
    };

    const currentQuery = (search?._q as string | undefined) ?? "";

    return (
        <Content
            style={{
                padding: isMobile ? token.paddingSM : token.padding,
            }}
        >
            <Flex
                align="center"
                justify="space-between"
                gap={token.marginSM}
                wrap
                style={{ marginBottom: token.margin }}
            >
                <Flex vertical gap={token.marginXXS}>
                    <Title level={3} style={{ margin: 0 }}>
                        Patients
                    </Title>
                    <Text type="secondary">
                        Search the registry or register a new client.
                    </Text>
                </Flex>
                <Button
                    type="primary"
                    size="large"
                    icon={<PlusOutlined />}
                    onClick={openRegistration}
                >
                    Register new patient
                </Button>
            </Flex>

            <div
                style={{
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    padding: token.padding,
                    marginBottom: token.marginSM,
                }}
            >
                <Input.Search
                    size="large"
                    allowClear
                    enterButton={
                        <span>
                            <SearchOutlined /> Search
                        </span>
                    }
                    prefix={
                        <SearchOutlined
                            style={{ color: token.colorTextTertiary }}
                        />
                    }
                    placeholder="Search by name, NIN, phone, village…"
                    defaultValue={currentQuery}
                    onSearch={handleSearchSubmit}
                />
                <Text
                    type="secondary"
                    style={{
                        display: "block",
                        marginTop: token.marginXXS,
                        fontSize: token.fontSizeSM,
                    }}
                >
                    Matches across all searchable fields on the program.
                </Text>
            </div>

            <Flex
                gap={token.marginSM}
                wrap
                style={{ marginBottom: token.marginSM }}
            >
                <StatChip
                    label="Total clients"
                    value={total.length}
                    accent={token.colorPrimary}
                />
                <StatChip
                    label="Registered today"
                    value={registeredToday}
                    accent={token.colorSuccess}
                />
                <StatChip
                    label="Pending sync"
                    value={pendingSync}
                    accent={token.colorWarning}
                />
            </Flex>

            <Row gutter={[token.marginSM, token.marginSM]}>
                <Outlet />
            </Row>
            {registrationModal}
        </Content>
    );
}
