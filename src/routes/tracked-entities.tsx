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
import dayjs from "dayjs";
import React from "react";
import { DataElementField } from "../components/data-element-field";
import { resourceQueryOptions } from "../query-options";
import { ClientSchema, TrackedEntityResponse } from "../schemas";
import { RootRoute } from "./__root";

const { Content } = Layout;
const { Title } = Typography;
export const TrackedEntitiesRoute = createRoute({
    getParentRoute: () => RootRoute,
    path: "/tracked-entities",
    component: TrackedEntities,
    validateSearch: ClientSchema,
    loader: async ({
        context: { queryClient, engine, orgUnit, syncManager },
    }) => {
        const params = new URLSearchParams({
            pageSize: "1",
            page: "1",
            totalPages: "true",
            program: "ueBhWkWll5v",
            orgUnitMode: "ACCESSIBLE",
            fields: "trackedEntity",
        });
        const params2 = new URLSearchParams({
            pageSize: "1",
            page: "1",
            totalPages: "true",
            program: "ueBhWkWll5v",
            orgUnitMode: "ACCESSIBLE",
            fields: "trackedEntity",
            enrollmentEnrolledAfter: dayjs().format("YYYY-MM-DD"),
            enrollmentEnrolledBefore: dayjs().format("YYYY-MM-DD"),
        });
        const params3 = new URLSearchParams({
            pageSize: "1",
            page: "1",
            totalPages: "true",
            program: "ueBhWkWll5v",
            orgUnitMode: "ACCESSIBLE",
            fields: "event",
            status: "SCHEDULE",
            scheduledAfter: dayjs().format("YYYY-MM-DD"),
        });

        const {
            pager: { total },
        } = await queryClient.ensureQueryData(
            resourceQueryOptions<TrackedEntityResponse>({
                engine,
                resource: `tracker/trackedEntities?${params.toString()}`,
                queryKey: [
                    "trackedEntities",
                    orgUnit.id,
                    Array.from(params.values()).sort().join(","),
                ],
                refetchInterval: 1 * 60 * 1000,
            }),
        );
        const {
            pager: { total: enrollments },
        } = await queryClient.ensureQueryData(
            resourceQueryOptions<TrackedEntityResponse>({
                engine,
                resource: `tracker/trackedEntities?${params2.toString()}`,
                queryKey: [
                    "trackedEntities",
                    orgUnit.id,
                    Array.from(params2.values()).sort().join(","),
                ],
                refetchInterval: 1 * 60 * 1000,
            }),
        );
        const {
            pager: { total: appointments },
        } = await queryClient.ensureQueryData(
            resourceQueryOptions<TrackedEntityResponse>({
                engine,
                resource: `tracker/events?${params3.toString()}`,
                queryKey: [
                    "events",
                    orgUnit.id,
                    Array.from(params3.values()).sort().join(","),
                ],
                refetchInterval: 1 * 60 * 1000,
            }),
        );
        return { total, enrollments, appointments };
    },
});

function TrackedEntities() {
    const [form] = Form.useForm();
    const { program, trackedEntityAttributes, optionSets } =
        RootRoute.useLoaderData();
    const { total, enrollments, appointments } =
        TrackedEntitiesRoute.useLoaderData();
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
                                {program.programTrackedEntityAttributes.flatMap(
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
                                                onAutoSave={() => {}}
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
                                    value={total}
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
                                    value={enrollments}
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
