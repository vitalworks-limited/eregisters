import {
    FilterOutlined,
    SearchOutlined,
} from "@ant-design/icons";
import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
import { createRoute, Outlet } from "@tanstack/react-router";
import {
    Badge,
    Button,
    Drawer,
    Flex,
    Form,
    Grid,
    Input,
    Layout,
    Row,
    Space,
    theme,
    Typography,
} from "antd";
import dayjs from "dayjs";
import React, { useMemo, useState } from "react";
import { DataElementField } from "../components/data-element-field";
import { ClientSchema } from "../schemas";
import { trackedEntitiesCollection } from "../collections";
import { useMetadata } from "../hooks/useMetadata";
import { usePatientRegistration } from "../hooks/usePatientRegistration";
import { PatientRegistrationContext } from "../hooks/usePatientRegistrationTrigger";
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
        program,
        trackedEntityAttributes,
        optionSets,
        orgUnit: { id },
    } = useMetadata();

    const navigate = TrackedEntitiesRoute.useNavigate();
    const { search } = TrackedEntitiesRoute.useSearch();
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [form] = Form.useForm();

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
        const fieldFilters = activeFieldFilters(search);
        navigate({
            search: (prev) => ({
                ...prev,
                search: {
                    ...fieldFilters,
                    ...(trimmed ? { _q: trimmed } : {}),
                },
            }),
        });
    };

    const handleAdvancedSubmit = (values: Record<string, unknown>) => {
        const trimmed: Record<string, string> = {};
        for (const [k, v] of Object.entries(values ?? {})) {
            if (v === undefined || v === null || v === "") continue;
            trimmed[k] = String(v);
        }
        const globalQ = (search?._q as string | undefined) ?? "";
        navigate({
            search: (prev) => ({
                ...prev,
                search: {
                    ...trimmed,
                    ...(globalQ ? { _q: globalQ } : {}),
                },
            }),
        });
        setFiltersOpen(false);
    };

    const handleClearAll = () => {
        form.resetFields();
        navigate({ search: (prev) => ({ ...prev, search: undefined }) });
        setFiltersOpen(false);
    };

    const currentQuery = (search?._q as string | undefined) ?? "";

    const searchableAttrIds = useMemo(() => {
        if (!program) return [] as string[];
        return program.programTrackedEntityAttributes
            .filter((a) => a.searchable)
            .map((a) => a.trackedEntityAttribute.id)
            .filter((aid) => trackedEntityAttributes.has(aid));
    }, [program, trackedEntityAttributes]);

    const activeFilterCount = useMemo(() => {
        if (!search) return 0;
        return Object.entries(search).filter(
            ([k, v]) => k !== "_q" && typeof v === "string" && v,
        ).length;
    }, [search]);

    const initialAdvancedValues = useMemo(() => {
        const out: Record<string, string> = {};
        if (!search) return out;
        for (const [k, v] of Object.entries(search)) {
            if (k !== "_q" && typeof v === "string" && v) {
                out[k] = v;
            }
        }
        return out;
    }, [search]);

    return (
        <Content
            style={{
                padding: isMobile ? token.paddingSM : token.padding,
                flex: 1,
                display: "flex",
                flexDirection: "column",
            }}
        >
            <Flex
                align="center"
                justify="space-between"
                gap={token.marginSM}
                wrap
                style={{ marginBottom: token.marginSM }}
            >
                <Flex vertical gap={token.marginXXS}>
                    <Title level={4} style={{ margin: 0, lineHeight: 1.2 }}>
                        Patients
                    </Title>
                    <Text type="secondary">
                        Search the registry or register a new client.
                    </Text>
                </Flex>
            </Flex>

            <div
                style={{
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    padding: token.padding,
                    marginBottom: token.marginSM,
                }}
            >
                <Flex gap={token.marginSM} wrap align="stretch">
                    <Input.Search
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
                        style={{ flex: "1 1 320px", minWidth: 0 }}
                    />
                    <Badge count={activeFilterCount} size="small">
                        <Button
                            icon={<FilterOutlined />}
                            onClick={() => setFiltersOpen(true)}
                        >
                            Advanced filters
                        </Button>
                    </Badge>
                </Flex>
                <Text
                    type="secondary"
                    style={{
                        display: "block",
                        marginTop: token.marginXS,
                    }}
                >
                    Matches across all searchable fields on the program.
                    {activeFilterCount > 0 && (
                        <>
                            {" · "}
                            <Button
                                type="link"
                                size="small"
                                onClick={handleClearAll}
                                style={{ padding: 0, height: "auto" }}
                            >
                                Clear all filters
                            </Button>
                        </>
                    )}
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

            <Row
                gutter={[token.marginSM, token.marginSM]}
                style={{ flex: 1, minHeight: 0 }}
            >
                <PatientRegistrationContext.Provider value={openRegistration}>
                    <Outlet />
                </PatientRegistrationContext.Provider>
            </Row>

            <Drawer
                title="Advanced filters"
                placement="right"
                open={filtersOpen}
                onClose={() => setFiltersOpen(false)}
                size="default"
                extra={
                    <Space>
                        <Button onClick={handleClearAll}>Clear</Button>
                        <Button type="primary" onClick={() => form.submit()}>
                            Apply
                        </Button>
                    </Space>
                }
            >
                <Text type="secondary" style={{ display: "block", marginBottom: token.marginSM }}>
                    Each field is matched exactly (case-insensitive contains).
                    All filled fields combine with AND.
                </Text>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleAdvancedSubmit}
                    initialValues={initialAdvancedValues}
                >
                    <Row gutter={[token.marginSM, token.marginXS]}>
                        {searchableAttrIds.map((aid) => {
                            const current = trackedEntityAttributes.get(aid)!;
                            const optionSet = current.optionSet?.id ?? "";
                            const finalOptions =
                                optionSets.get(optionSet) ?? [];
                            return (
                                <DataElementField
                                    key={aid}
                                    dataElement={current}
                                    hidden={false}
                                    finalOptions={finalOptions}
                                    messages={[]}
                                    warnings={[]}
                                    errors={[]}
                                    required={false}
                                    xs={24}
                                    sm={24}
                                    md={24}
                                    lg={24}
                                    xl={24}
                                    form={form}
                                    onFieldChange={() => undefined}
                                />
                            );
                        })}
                    </Row>
                </Form>
            </Drawer>

            {registrationModal}
        </Content>
    );
}

function activeFieldFilters(
    search: { _q?: string } & Record<string, unknown> | undefined,
): Record<string, string> {
    const out: Record<string, string> = {};
    if (!search) return out;
    for (const [k, v] of Object.entries(search)) {
        if (k !== "_q" && typeof v === "string" && v) out[k] = v;
    }
    return out;
}
