import { Card, Flex, Form, FormInstance, Row } from "antd";
import React, { useCallback, useEffect } from "react";
import { useProgramRulesWithDexie } from "../hooks/useProgramRules";
import { RootRoute } from "../routes/__root";
import { FlattenedTrackedEntity } from "../schemas";
import { spans } from "../utils/utils";
import { useDexiePersistence } from "../hooks/useDexiePersistence";
import { DataElementRenderer } from "./data-element-renderer";
import { DataElementField } from "./data-element-field";
import dayjs from "dayjs";

export interface TrackerRegistrationProps {
    trackedEntity: FlattenedTrackedEntity;
    form: FormInstance;
}

export const TrackerRegistration: React.FC<TrackerRegistrationProps> = ({
    trackedEntity,
    form,
}) => {
    const { program, programRuleVariables, programRules } =
        RootRoute.useLoaderData();

    const allAttributes = new Map(
        program.programTrackedEntityAttributes.map(
            ({ mandatory, renderType, trackedEntityAttribute: { id } }) => [
                id,
                {
                    compulsory: mandatory,
                    desktopRenderType: renderType?.DESKTOP?.type,
                },
            ],
        ),
    );

    const { updateField, updateFields } =
        useDexiePersistence<FlattenedTrackedEntity>({
            entityType: "trackedEntity",
            entityId: trackedEntity.trackedEntity,
        });

    const values = Form.useWatch("xcYGVzmcWvi", form);

    const { ruleResult, triggerAutoExecute } = useProgramRulesWithDexie({
        form,
        programRules,
        programRuleVariables,
        trackedEntityAttributes: trackedEntity.attributes,
        onAssignments: updateFields,
        applyAssignmentsToForm: true,
        persistAssignments: true,
        clearHiddenFields: true,
        program: program.id,
        isRegistration: true,
        autoExecute: true,
    });

    const updateFieldWithRules = useCallback(
        (fieldId: string, value: any) => {
            updateField(fieldId, value);
            triggerAutoExecute();
        },
        [updateField, triggerAutoExecute],
    );

    useEffect(() => {
        triggerAutoExecute();
    }, [values]);

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
                        onAutoSave={updateFieldWithRules}
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
                        ruleResult.hiddenFields.has(id),
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
                                        onAutoSave={updateFieldWithRules}
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
