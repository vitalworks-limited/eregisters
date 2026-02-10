import React, { useCallback, useEffect } from "react";
import { RootRoute } from "../routes/__root";

import { Card, Form, FormInstance, Row } from "antd";
import { useDexiePersistence } from "../hooks/useDexiePersistence";
import { useProgramRulesWithDexie } from "../hooks/useProgramRules";
import {
    FlattenedEvent,
    FlattenedTrackedEntity,
    ProgramStage,
} from "../schemas";
import { calculateColSpan } from "../utils/utils";
import { DataElementField } from "./data-element-field";

export default function ProgramStageForm({
    form,
    programStage,
    event,
    trackedEntity,
}: {
    form: FormInstance;
    programStage: ProgramStage;
    event: FlattenedEvent;
    trackedEntity: FlattenedTrackedEntity;
}) {
    const {
        program,
        dataElements,
        optionGroups,
        optionSets,
        programRules,
        programRuleVariables,
    } = RootRoute.useLoaderData();
    const currentDataElements = new Map(
        programStage.programStageDataElements.map((psde) => [
            psde.dataElement.id,
            {
                allowFutureDate: psde.allowFutureDate,
                renderOptionsAsRadio: psde.renderType !== undefined,
                compulsory: psde.compulsory,
                desktopRenderType: psde.renderType?.DESKTOP?.type,
            },
        ]),
    );

    const { updateField, updateFields, entity } =
        useDexiePersistence<FlattenedEvent>({
            entityType: "event",
            entityId: event.event,
            debounceMs: 100,
        });

    const { ruleResult, triggerAutoExecute } = useProgramRulesWithDexie({
        form,
        programRules,
        programRuleVariables,
        programStage: programStage.id,
        trackedEntityAttributes: trackedEntity.attributes,
        onAssignments: updateFields,
        applyAssignmentsToForm: true,
        persistAssignments: true,
        program: program.id,
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
        form.setFieldsValue(entity?.dataValues);
    }, [entity]);
    return (
        <Card>
            {programStage.programStageSections.flatMap((section) => {
                if (ruleResult.hiddenSections.has(section.id)) return [];
                return (
                    <Row gutter={[16, 0]} key={section.id}>
                        {section.dataElements.flatMap((dataElement) => {
                            const currentDataElement = dataElements.get(
                                dataElement.id,
                            );
                            const { compulsory = false, desktopRenderType } =
                                currentDataElements.get(dataElement.id) || {};

                            const optionSet =
                                currentDataElement?.optionSet?.id ?? "";

                            const hiddenOptions =
                                ruleResult.hiddenOptions[dataElement.id];

                            const shownOptionGroups =
                                ruleResult.shownOptionGroups[dataElement.id] ||
                                new Set<string>();

                            let finalOptions = optionSets
                                .get(optionSet)
                                ?.flatMap((o) => {
                                    if (hiddenOptions?.has(o.id)) {
                                        return [];
                                    }
                                    return o;
                                });

                            if (ruleResult.hiddenFields.has(dataElement.id)) {
                                return [];
                            }

                            if (shownOptionGroups.size > 0) {
                                const currentOptions =
                                    optionGroups.get(
                                        shownOptionGroups.values().next().value,
                                    ) ?? [];
                                finalOptions = currentOptions.map(
                                    ({ code, id, name }) => ({
                                        id,
                                        code,
                                        name,
                                        optionSet,
                                    }),
                                );
                            }

                            const errors = ruleResult.errors.filter(
                                (msg) => msg.key === dataElement.id,
                            );
                            const messages = ruleResult.messages.filter(
                                (msg) => msg.key === dataElement.id,
                            );
                            const warnings = ruleResult.warnings.filter(
                                (msg) => msg.key === dataElement.id,
                            );

                            return (
                                <DataElementField
                                    dataElement={currentDataElement!}
                                    hidden={false}
                                    desktopRenderType={desktopRenderType!}
                                    finalOptions={finalOptions}
                                    messages={messages}
                                    warnings={warnings}
                                    errors={errors}
                                    required={compulsory}
                                    disabled={
                                        dataElement.id in ruleResult.assignments
                                    }
                                    key={dataElement.id}
                                    form={form}
                                    xs={calculateColSpan(
                                        section.dataElements.length,
                                        24,
                                    )}
                                    sm={calculateColSpan(
                                        section.dataElements.length,
                                        24,
                                    )}
                                    md={calculateColSpan(
                                        section.dataElements.length,
                                        24,
                                    )}
                                    lg={calculateColSpan(
                                        section.dataElements.length,
                                        12,
                                    )}
                                    xl={calculateColSpan(
                                        section.dataElements.length,
                                        6,
                                    )}
                                    onAutoSave={updateFieldWithRules}
                                />
                            );
                        })}
                    </Row>
                );
            })}
        </Card>
    );
}
