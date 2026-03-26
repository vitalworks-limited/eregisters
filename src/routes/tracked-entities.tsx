import {
    CalendarOutlined,
    ScheduleOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { createRoute, Outlet } from "@tanstack/react-router";
import {
    Button,
    Card,
    Col,
    Flex,
    Form,
    Layout,
    Row,
    Statistic,
    Typography,
} from "antd";
import React from "react";
import { DataElementField } from "../components/data-element-field";
import { ClientSchema } from "../schemas";
import { RootRoute } from "./__root";
import { eq, useLiveSuspenseQuery, not, and } from "@tanstack/react-db";

import dayjs from "dayjs";
import { SyncContext } from "../machines";
import { useCurrentUserInfo } from "@dhis2/app-runtime";

const { Content } = Layout;
const { Title } = Typography;
export const TrackedEntitiesRoute = createRoute({
    getParentRoute: () => RootRoute,
    path: "/tracked-entities",
    component: TrackedEntities,
    validateSearch: ClientSchema,
});

function TrackedEntities() {
    const { enrollmentsCollection, trackedEntitiesCollection } =
        SyncContext.useSelector((a) => ({
            enrollmentsCollection: a.context.enrollmentsCollection,
            trackedEntitiesCollection: a.context.trackedEntitiesCollection,
        }));

    const currentUser = useCurrentUserInfo();

    const orgUnit = (
        currentUser?.organisationUnits.map((a) => a.id) ?? []
    ).join(";");
    const [form] = Form.useForm();
    const { program, trackedEntityAttributes, optionSets } =
        RootRoute.useLoaderData();
    const { data: total } = useLiveSuspenseQuery(
        (q) =>
            q
                .from({ trackedEntities: trackedEntitiesCollection })
                .where(({ trackedEntities }) =>
                    and(
                        not(eq(trackedEntities.syncStatus, "draft")),
                        eq(trackedEntities.orgUnit, orgUnit),
                    ),
                ),
        [orgUnit],
    );
    const { data: enrollments } = useLiveSuspenseQuery((q) =>
        q
            .from({ enrollments: enrollmentsCollection })
            .where(({ enrollments }) =>
                and(
                    eq(enrollments.enrolledAt, dayjs().format("YYYY-MM-DD")),
                    not(eq(enrollments.syncStatus, "draft")),
                    eq(enrollments.orgUnit, orgUnit),
                ),
            ),
    );
    const appointments = 0;
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

    return (
        <Content
            style={{
                padding: "16px",
            }}
        >
            <Row gutter={[8, 8]}>
                <Col xs={24} lg={8}>
                    <Card
                        title={<Title level={4}>Search clients</Title>}
                        variant="borderless"
                        style={{ height: "100%" }}
                    >
                        <Form
                            form={form}
                            layout="vertical"
                            onFinish={onStageSubmit}
                            style={{ margin: 0, padding: 0 }}
                            initialValues={search}
                        >
                            <Row gutter={[0, 0]}>
                                {program?.programTrackedEntityAttributes.flatMap(
                                    ({
                                        trackedEntityAttribute: { id },
                                        searchable,
                                    }) => {
                                        if (!searchable) {
                                            return [];
                                        }
                                        const current =
                                            trackedEntityAttributes.get(id)!;

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
                    <Row gutter={[8, 8]} style={{ marginBottom: 8 }}>
                        <Col xs={24} sm={8}>
                            <Card variant="borderless">
                                <Statistic
                                    title="Total Clients"
                                    value={total.length}
                                    prefix={<UserOutlined />}
                                    styles={{
                                        content: { color: "#1f4788" },
                                    }}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Card variant="borderless">
                                <Statistic
                                    title="Registered Today"
                                    value={enrollments.length}
                                    prefix={<CalendarOutlined />}
                                    styles={{
                                        content: { color: "#52c41a" },
                                    }}
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Card variant="borderless">
                                <Statistic
                                    title="Upcoming Appointments"
                                    value={appointments}
                                    prefix={<ScheduleOutlined />}
                                    styles={{
                                        content: { color: "#faad14" },
                                    }}
                                />
                            </Card>
                        </Col>
                    </Row>
                    <Outlet />
                </Col>
            </Row>
        </Content>
    );
}
