import { Form, Row, Typography } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import React, { useCallback } from "react";
import { db, BasicTrackedEntity } from "../db";
import { useDexiePersistence } from "../hooks/useDexiePersistence";
import { useProgramRulesWithDexie } from "../hooks/useProgramRules";
import { RootRoute } from "../routes/__root";
import { calculateColSpan } from "../utils/utils";
import { DataElementField } from "./data-element-field";
import { FlattenedEvent, FlattenedRelationship } from "../schemas";

export default function Relation({
    section,
    child,
    mainEvent,
}: {
    section: string;
    child: FlattenedRelationship["to"];
    mainEvent: FlattenedEvent;
}) {
    const {
        program,
        dataElements,
        optionGroups,
        optionSets,
        programRuleVariables,
        programRules,
    } = RootRoute.useLoaderData();

    const [childEventForm] = Form.useForm();
    const occurredAt = mainEvent?.occurredAt;

    const [stage] = program.programStages.filter(
        ({ id }) => id === "K2nxbE9ubSs",
    );

    const [currentSection] = stage.programStageSections.filter(
        ({ name }) => name === "Child Health Services",
    );

    // const childEvent = useLiveQuery(async () => {
    //     const existingEvent = await db.events
    //         .where("enrollment")
    //         .equals(child.enrollments[0].enrollment)
    //         .and((e) => e.programStage === "K2nxbE9ubSs")
    //         .first();
    //     return existingEvent || null;
    // }, [child.enrollments?.[0]?.enrollment, mainEventId]);

    const { updateField, updateFields } = useDexiePersistence({
        entityType: "event",
        entityId: "",
    });

    // Use program rules with autoExecute enabled
    const { ruleResult, executeAndApplyRules, triggerAutoExecute } =
        useProgramRulesWithDexie({
            form: childEventForm,
            programRules,
            programRuleVariables,
            programStage: "K2nxbE9ubSs",
            trackedEntityAttributes: child.fields,
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

    // useTrackerFormInit({
    //     form: childEventForm,
    //     entity: "event",
    //     initialValues: {
    //         UuxHHVp5CnF: section === "Maternity" ? "Newborn" : "Postnatal",
    //         mrKZWf2WMIC: "Child Health Services",
    //         occurredAt,
    //     },
    //     executeRules: executeAndApplyRules,
    //     enabled: !!mainEvent,
    // });

    const currentDataElements = new Map(
        stage.programStageDataElements.map((psde) => [
            psde.dataElement.id,
            {
                allowFutureDate: psde.allowFutureDate,
                renderOptionsAsRadio: psde.renderType !== undefined,
                compulsory: psde.compulsory,
                desktopRenderType: psde.renderType?.DESKTOP?.type,
            },
        ]),
    );

    return (
        <Form
            form={childEventForm}
            layout="vertical"
            style={{ margin: 0, padding: 0 }}
        >
            <Typography.Title level={4} style={{ marginBottom: 16 }}>
                {section}
            </Typography.Title>
            <Row gutter={24}>
                {currentSection.dataElements.flatMap((dataElement) => {
                    const currentDataElement = dataElements.get(dataElement.id);
                    const { compulsory = false, desktopRenderType } =
                        currentDataElements.get(dataElement.id) || {};

                    const optionSet = currentDataElement?.optionSet?.id ?? "";

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
                            key={dataElement.id}
                            form={childEventForm}
                            onAutoSave={updateFieldWithRules}
                            span={calculateColSpan(
                                currentSection.dataElements.length,
                                6,
                            )}
                        />
                    );
                })}
            </Row>
        </Form>
    );
}
