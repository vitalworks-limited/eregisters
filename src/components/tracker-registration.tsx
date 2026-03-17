import { Card, Flex, Form, FormInstance, Row } from "antd";
import dayjs from "dayjs";
import React, { useEffect } from "react";
import { TrackedEntityContext } from "../machines";
import { RootRoute } from "../routes/__root";
import { FlattenedTrackedEntity } from "../schemas";
import { buildCurrentAttributes, spans } from "../utils/utils";
import { DataElementField } from "./data-element-field";
import { DataElementRenderer } from "./data-element-renderer";

export interface TrackerRegistrationProps {
    trackedEntity: FlattenedTrackedEntity;
    form: FormInstance;
}

export const TrackerRegistration: React.FC<TrackerRegistrationProps> = ({
    form,
}) => {
    const { program } = RootRoute.useLoaderData();
    const allAttributes = buildCurrentAttributes(program);
    const ruleResult = TrackedEntityContext.useSelector(
        (a) => a.context.ruleResult,
    );
    const state = TrackedEntityContext.useSelector((a) => a.value);
    const trackedEntityActor = TrackedEntityContext.useActorRef();

    const values = Form.useWatch([], form);

    useEffect(() => {
        console.log(values);
        trackedEntityActor.send({
            type: "FIELD_CHANGED",
            formData: {
                ...form.getFieldsValue(),
                ...values,
            },
        });
    }, [values]);
    return (
        <Flex vertical gap={10}>
            <Card
                title={`Registration Details ${state}`}
                style={{ borderRadius: 0 }}
                size="small"
            >
                <Row gutter={[16, 0]}>
                    <DataElementField
                        dataElement={{
                            code: "enrolledAt",
                            id: "enrolledAt",
                            confidential: false,
                            name: "enrolledAt",
                            valueType: "DATE",
                            displayFormName: "Registration Date",
                            generated: false,
                            optionSetValue: false,
                            unique: true,
                            pattern: "",
                            formName: "Registration Date",
                        }}
                        hidden={false}
                        finalOptions={[]}
                        messages={[]}
                        warnings={[]}
                        errors={[]}
                        required={true}
                        form={form}
                        xs={24}
                        sm={24}
                        md={24}
                        lg={24}
                        xl={24}
                        disabledDate={(date) => {
                            if (program.selectEnrollmentDatesInFuture)
                                return true;
                            return date.isAfter(dayjs());
                        }}
                    />
                </Row>
            </Card>
            {program.programSections.map(
                ({ name, trackedEntityAttributes: tei, id }) => {
                    const allAreHidden = tei.every(({ id }) =>
                        ruleResult.hiddenFields.includes(id),
                    );
                    if (allAreHidden) return null;
                    return (
                        <Card
                            title={name}
                            key={id}
                            style={{ borderRadius: 0 }}
                            size="small"
                        >
                            <Row gutter={[16, 0]}>
                                {tei.map(({ id }) => (
                                    <DataElementRenderer
                                        key={id}
                                        dataElementId={id}
                                        currentDataElements={allAttributes}
                                        ruleResult={ruleResult}
                                        sectionLength={tei.length}
                                        form={form}
                                        mode="attribute"
                                        xl={spans.get(id) ?? undefined}
                                    />
                                ))}
                            </Row>
                        </Card>
                    );
                },
            )}
        </Flex>
    );
};
