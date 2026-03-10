import { Card, Flex, Form, FormInstance, Row } from "antd";
import dayjs from "dayjs";
import React, { useCallback, useEffect, useMemo } from "react";
import { trackedEntitiesCollection } from "../collections";
import { useRuleResultPersistence } from "../hooks/useRuleResultPersistence";
import { RootRoute } from "../routes/__root";
import { FlattenedTrackedEntity } from "../schemas";
import {
    buildCurrentAttributes,
    executeProgramRules,
    spans,
} from "../utils/utils";
import { DataElementField } from "./data-element-field";
import { DataElementRenderer } from "./data-element-renderer";

export interface TrackerRegistrationProps {
    trackedEntity: FlattenedTrackedEntity;
    form: FormInstance;
}

export const TrackerRegistration: React.FC<TrackerRegistrationProps> = ({
    trackedEntity,
    form,
}) => {
    const allValues = Form.useWatch([], form);
    const { program, programRuleVariables, programRules } =
        RootRoute.useLoaderData();

    const allAttributes = buildCurrentAttributes(program);
    const mainStageDataElements = useMemo(
        () =>
            new Set(
                program.programTrackedEntityAttributes.map(
                    ({ trackedEntityAttribute }) => trackedEntityAttribute.id,
                ),
            ),
        [],
    );
    const { ruleResult, saveRuleResult } = useRuleResultPersistence({
        formType: "registration",
    });

    const handleFieldChange = useCallback((fieldId: string, value: any) => {
        form.setFieldValue(fieldId, value);
        const currentData = form.getFieldsValue();
        const result = executeProgramRules({
            programRules,
            programRuleVariables,
            attributeValues: currentData,
            program: program.id,
        });
        saveRuleResult(result);
        const filteredAssignments = Object.fromEntries(
            Object.entries(result.assignments).filter(([k]) =>
                mainStageDataElements.has(k),
            ),
        );
        if (Object.keys(filteredAssignments).length > 0) {
            form.setFieldsValue(filteredAssignments);
        }
        if (result.hiddenFields.length > 0) {
            const fieldsToClear: Record<string, any> = {};
            result.hiddenFields.forEach((hiddenFieldId) => {
                const currentValue = currentData[hiddenFieldId];
                if (
                    currentValue !== undefined &&
                    currentValue !== null &&
                    currentValue !== ""
                ) {
                    fieldsToClear[hiddenFieldId] = undefined;
                    form.setFieldValue(hiddenFieldId, undefined);
                }
            });
        }
        trackedEntitiesCollection.utils.insertLocally({
            ...trackedEntity,
            attributes: { ...trackedEntity.attributes, ...currentData },
        });
    }, []);

    useEffect(() => {
        const currentData = form.getFieldsValue();
        const result = executeProgramRules({
            programRules,
            programRuleVariables,
            attributeValues: currentData,
            program: program.id,
        });
        saveRuleResult(result);
        const filteredAssignments = Object.fromEntries(
            Object.entries(result.assignments).filter(([k]) =>
                mainStageDataElements.has(k),
            ),
        );
        if (Object.keys(filteredAssignments).length > 0) {
            form.setFieldsValue(filteredAssignments);
        }
        if (result.hiddenFields.length > 0) {
            const fieldsToClear: Record<string, any> = {};
            result.hiddenFields.forEach((hiddenFieldId) => {
                const currentValue = currentData[hiddenFieldId];
                if (
                    currentValue !== undefined &&
                    currentValue !== null &&
                    currentValue !== ""
                ) {
                    fieldsToClear[hiddenFieldId] = undefined;
                    form.setFieldValue(hiddenFieldId, undefined);
                }
            });
        }
    }, [allValues]);

    useEffect(() => {
        const currentData = form.getFieldsValue();
        form.setFieldsValue({ ...currentData, ...trackedEntity.attributes });
    }, []);

    return (
        <Flex vertical gap={10}>
            <Card
                title="Registration Details"
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
                        onFieldChange={handleFieldChange}
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
                                        onFieldChange={handleFieldChange}
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
