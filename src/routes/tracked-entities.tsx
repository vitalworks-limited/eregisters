import { CalendarOutlined, UserOutlined } from "@ant-design/icons";
import { and, eq, not, useLiveSuspenseQuery } from "@tanstack/react-db";
import { createRoute, Outlet } from "@tanstack/react-router";
import {
    Button,
    Card,
    Col,
    Flex,
    Form,
    Grid,
    Layout,
    Row,
    Statistic,
    Typography,
} from "antd";
import React from "react";
import { DataElementField } from "../components/data-element-field";
import { ClientSchema } from "../schemas";
import { RootRoute } from "./__root";

import dayjs from "dayjs";
import { trackedEntitiesCollection } from "../collections";
import { useMetadata } from "../hooks/useMetadata";

const { Content } = Layout;
const { Title } = Typography;
export const TrackedEntitiesRoute = createRoute({
    getParentRoute: () => RootRoute,
    path: "/tracked-entities",
    component: TrackedEntities,
    validateSearch: ClientSchema,
});

function TrackedEntities() {
    const {
        program,
        trackedEntityAttributes,
        optionSets,
        orgUnit: { id },
    } = useMetadata();

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
    const navigate = TrackedEntitiesRoute.useNavigate();
    const { search } = TrackedEntitiesRoute.useSearch();

    const handleClear = () => {
        form.resetFields();
        navigate({
            search: (prev) => ({ ...prev, search: undefined }),
        });
    };

    const onStageSubmit = (values: any) => {
        navigate({
            search: (prev) => {
                return {
                    ...prev,
                    search: values,
                };
            },
        });
    };

    const onFieldChange = () => {};

    const screens = Grid.useBreakpoint();
    const isMobile = !screens.lg;

    const statsSection = (
        <Flex gap={8} style={{ marginBottom: 8 }}>
            <Card variant="borderless" style={{ flex: 1 }}>
                <Statistic
                    title="Total Clients"
                    value={total.length}
                    prefix={<UserOutlined />}
                    styles={{
                        content: { color: "#1f4788" },
                    }}
                />
            </Card>
            <Card variant="borderless" style={{ flex: 1 }}>
                <Statistic
                    title="Registered Today"
                    value={
                        total.filter(
                            (te) =>
                                dayjs(te.createdAt).format("YYYY-MM-DD") ===
                                dayjs().format("YYYY-MM-DD"),
                        ).length
                    }
                    prefix={<CalendarOutlined />}
                    styles={{
                        content: { color: "#52c41a" },
                    }}
                />
            </Card>
        </Flex>
    );

    return (
        <Content
            style={{
                padding: "16px",
            }}
        >
            <Row gutter={[16, 16]}>
                {isMobile && <Col span={24}>{statsSection}</Col>}
                <Col xs={24} lg={8}>
                    <Card
                        title={<Title level={4}>Search clients</Title>}
                        variant="borderless"
                        style={{
                            height: isMobile
                                ? undefined
                                : "calc(100vh - 144px)",
                        }}
                    >
                        <Form
                            form={form}
                            layout="vertical"
                            onFinish={onStageSubmit}
                            style={{ margin: 0, padding: 0 }}
                            initialValues={search}
                        >
                            <Row gutter={[16, 16]}>
                                {program?.programTrackedEntityAttributes.flatMap(
                                    ({
                                        trackedEntityAttribute: { id },
                                        searchable,
                                    }) => {
                                        if (!searchable) {
                                            return [];
                                        }
                                        const current =
                                            trackedEntityAttributes.get(id);

                                        if (current === undefined) {
                                            return [];
                                        }
                                        const optionSet =
                                            current.optionSet?.id ?? "";

                                        const finalOptions =
                                            optionSets.get(optionSet) ?? [];

                                        return (
                                            <DataElementField
                                                key={id}
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
                                                onFieldChange={onFieldChange}
                                            />
                                        );
                                    },
                                )}
                                <Col span={24}>
                                    <Flex align="center" gap={20}>
                                        <Button
                                            type="primary"
                                            htmlType="submit"
                                        >
                                            Search
                                        </Button>
                                        <Button onClick={handleClear}>
                                            Clear
                                        </Button>
                                    </Flex>
                                </Col>
                            </Row>
                        </Form>
                    </Card>
                </Col>
                <Col xs={24} lg={16}>
                    {!isMobile && statsSection}
                    <Outlet />
                </Col>
            </Row>
        </Content>
    );
}
