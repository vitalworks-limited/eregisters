import { Form, Row, Typography } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import React, { useCallback, useEffect, useRef } from "react";
import { db } from "../db";
import { useProgramRulesWithDexie } from "../hooks/useProgramRules";
import { RootRoute } from "../routes/__root";
import { FlattenedEvent, FlattenedTrackedEntity } from "../schemas";
import { calculateColSpan } from "../utils/utils";
import { DataElementField } from "./data-element-field";

export default function Relation({
    section,
    mainEvent,
    trackedEntity,
}: {
    section: string;
    mainEvent: FlattenedEvent;
    trackedEntity: FlattenedTrackedEntity;
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

    const [stage] = program.programStages.filter(
        ({ id }) => id === "K2nxbE9ubSs",
    );

    const [currentSection] = stage.programStageSections.filter(
        ({ name }) => name === "Child Health Services",
    );

    const childEventRef = useRef<typeof childEvent>(undefined);

    const childEvent = useLiveQuery(async () => {
        return db.events
            .where("parentEvent")
            .equals(mainEvent.event)
            .filter((x) => x.trackedEntity === trackedEntity.trackedEntity)
            .first();
    }, [mainEvent.event, trackedEntity.trackedEntity]);

    useEffect(() => {
        childEventRef.current = childEvent;
    }, [childEvent?.event]);

    const persistFields = useCallback(async (fields: Record<string, any>) => {
        const event = childEventRef.current;
        if (!event?.event) return;
        const current = await db.events.get(event.event);
        if (!current) return;
        await db.events.update(event.event, {
            dataValues: { ...current.dataValues, ...fields },
        });
    }, []);

    const { ruleResult, executeAndApplyRules, triggerAutoExecute } =
        useProgramRulesWithDexie({
            form: childEventForm,
            programRules,
            programRuleVariables,
            programStage: "K2nxbE9ubSs",
            trackedEntityAttributes: trackedEntity.attributes,
            onAssignments: persistFields,
            applyAssignmentsToForm: true,
            persistAssignments: true,
            program: program.id,
            autoExecute: true,
        });

    const updateFieldWithRules = useCallback(
        async (fieldId: string, value: any) => {
            triggerAutoExecute();
            const current = await db.events.get(childEvent?.event ?? "");
            if (!current) return;
            await db.events.update(current.event, {
                dataValues: { ...current.dataValues, [fieldId]: value },
                syncStatus: "pending",
            });
        },
        [triggerAutoExecute],
    );

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
    const executeAndApplyRulesRef = useRef(executeAndApplyRules);
    useEffect(() => {
        executeAndApplyRulesRef.current = executeAndApplyRules;
    });

    useEffect(() => {
        if (!childEvent) return;
        childEventForm.setFieldsValue({
            ...childEvent.dataValues,
            UuxHHVp5CnF: section === "Maternity" ? "Newborn" : "Postnatal",
            mrKZWf2WMIC: "Child Health Services",
        });
        executeAndApplyRulesRef.current({
            ...childEvent.dataValues,
            UuxHHVp5CnF: section === "Maternity" ? "Newborn" : "Postnatal",
            mrKZWf2WMIC: "Child Health Services",
        });
    }, [childEvent?.event]);

    return (
        <Form
            form={childEventForm}
            layout="vertical"
            style={{ margin: 0, padding: 0 }}
        >
            <Typography.Title level={4} style={{ marginBottom: 16 }}>
                {section}
            </Typography.Title>
            <Row gutter={[16, 0]}>
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
                            xs={calculateColSpan(
                                currentSection.dataElements.length,
                                24,
                            )}
                            sm={calculateColSpan(
                                currentSection.dataElements.length,
                                24,
                            )}
                            md={calculateColSpan(
                                currentSection.dataElements.length,
                                24,
                            )}
                            lg={calculateColSpan(
                                currentSection.dataElements.length,
                                12,
                            )}
                            xl={calculateColSpan(
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
