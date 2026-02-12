import { Card, Flex, Form, FormInstance, Row, Typography } from "antd";
import React, { useCallback, useEffect } from "react";
import { useProgramRulesWithDexie } from "../hooks/useProgramRules";
import { RootRoute } from "../routes/__root";
import { FlattenedTrackedEntity, RenderType } from "../schemas";
import { calculateColSpan, spans } from "../utils/utils";
import { DataElementField } from "./data-element-field";
import { useDexiePersistence } from "../hooks/useDexiePersistence";
export interface TrackerRegistrationProps {
    trackedEntity: FlattenedTrackedEntity;
    form: FormInstance;
}

export const TrackerRegistration: React.FC<TrackerRegistrationProps> = ({
    trackedEntity,
    form,
}) => {
    const {
        program,
        programRuleVariables,
        programRules,
        trackedEntityAttributes,
        optionSets,
    } = RootRoute.useLoaderData();
    const allAttributes: Map<
        string,
        {
            mandatory: boolean;
            desktopRenderType?: RenderType;
        }
    > = new Map(
        program.programTrackedEntityAttributes.map(
            ({ mandatory, renderType, trackedEntityAttribute: { id } }) => [
                id,
                {
                    mandatory,
                    desktopRenderType: renderType?.DESKTOP,
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

    const { ruleResult, executeAndApplyRules, triggerAutoExecute } =
        useProgramRulesWithDexie({
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
                style={{
                    borderRadius: 0,
                }}
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
                    />
                </Row>
            </Card>
            {program.programSections.map(
                ({ name, trackedEntityAttributes: tei, id }) => {
                    const allAreHidden = tei.every(({ id }) =>
                        ruleResult.hiddenFields.has(id),
                    );
                    if (allAreHidden) {
                        return null;
                    }
                    return (
                        <Card
                            title={name}
                            key={id}
                            style={{
                                borderRadius: 0,
                            }}
                            size="small"
                        >
                            <Row gutter={[16, 0]}>
                                {tei.map(({ id }) => {
                                    if (
                                        ruleResult.hiddenFields.has(id) &&
                                        ruleResult.shownOptionGroups[id] ===
                                            undefined
                                    ) {
                                        return [];
                                    }
                                    const current =
                                        trackedEntityAttributes.get(id)!;
                                    if (ruleResult.hiddenSections.has(id))
                                        return [];

                                    const optionSet =
                                        current.optionSet?.id ?? "";

                                    const finalOptions = optionSets
                                        .get(optionSet)
                                        ?.flatMap((o) => {
                                            if (
                                                ruleResult.hiddenOptions[
                                                    o.id
                                                ]?.has(o.id)
                                            ) {
                                                return [];
                                            }
                                            return o;
                                        });

                                    const errors = ruleResult.errors.filter(
                                        (msg) => msg.key === id,
                                    );
                                    const messages = ruleResult.messages.filter(
                                        (msg) => msg.key === id,
                                    );
                                    const warnings = ruleResult.warnings.filter(
                                        (msg) => msg.key === id,
                                    );

                                    const { desktopRenderType, mandatory } =
                                        allAttributes.get(id)!;

                                    return (
                                        <DataElementField
                                            key={id}
                                            dataElement={current}
                                            hidden={false}
                                            finalOptions={finalOptions}
                                            messages={messages}
                                            warnings={warnings}
                                            errors={errors}
                                            required={mandatory}
                                            disabled={
                                                id in ruleResult.assignments
                                            }
                                            xs={calculateColSpan(
                                                tei.length,
                                                24,
                                            )}
                                            sm={calculateColSpan(
                                                tei.length,
                                                24,
                                            )}
                                            md={calculateColSpan(
                                                tei.length,
                                                24,
                                            )}
                                            lg={calculateColSpan(
                                                tei.length,
                                                12,
                                            )}
                                            xl={
                                                spans.get(id) ||
                                                calculateColSpan(tei.length, 6)
                                            }
                                            form={form}
                                            desktopRenderType={
                                                desktopRenderType?.type
                                            }
                                            onAutoSave={updateFieldWithRules}
                                        />
                                    );
                                })}
                            </Row>
                        </Card>
                    );
                },
            )}
        </Flex>
    );
};
