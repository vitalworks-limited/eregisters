import { createActorContext } from "@xstate/react";
import { FormInstance } from "antd";
import { assertEvent, assign, fromPromise, setup } from "xstate";
import { createEventCollection } from "../collections";
import {
    FlattenedEnrollment,
    FlattenedEvent,
    FlattenedTrackedEntity,
    ProgramRule,
    ProgramRuleResult,
    ProgramRuleVariable,
} from "../schemas";
import {
    createEmptyProgramRuleResult,
    executeProgramRules,
    programRuleResultsEqual,
} from "../utils/utils";

import { applyRuleResultsToForm, FormEvent } from "./common";

export const eventFormMachine = setup({
    types: {
        events: {} as FormEvent,
        context: {} as {
            formData: Record<string, any>;
            ruleResult: ProgramRuleResult;
            errors: Record<string, string>;
            programRules: ProgramRule[];
            programRuleVariables: ProgramRuleVariable[];
            trackedEntity: FlattenedTrackedEntity;
            enrollment: FlattenedEnrollment;
            event: FlattenedEvent;
            program: string;
            programStage: string;
            validDataElements: Set<string>;
            form: FormInstance;
            persistenceError: string | null;
            previousAssignments: Record<string, any>;
            eventsCollection: ReturnType<typeof createEventCollection>;
        },
        input: {} as {
            programRules: ProgramRule[];
            programRuleVariables: ProgramRuleVariable[];
            event: FlattenedEvent;
            enrollment: FlattenedEnrollment;
            programStage: string;
            trackedEntity: FlattenedTrackedEntity;
            validDataElements: Set<string>;
            program: string;
            form: FormInstance;
            eventsCollection: ReturnType<typeof createEventCollection>;
        },
    },
    actions: {
        updateForm: ({ context: { form, event } }) => {
            form.setFieldsValue(event.dataValues);
        },
        updateFormData: assign({
            formData: ({ context: { event, formData } }) => {
                return {
                    ...event.dataValues,
                    ...formData,
                };
            },
        }),
        updateField: assign({
            formData: ({ context, event }) => {
                assertEvent(event, "FIELD_CHANGED");
                return {
                    ...context.formData,
                    ...event.formData,
                };
            },
        }),
        applyRuleResults: assign(({ context }) =>
            applyRuleResultsToForm(context.ruleResult, context.form),
        ),
        executeRulesSync: assign(({ context }) => {
            const {
                programRules,
                programRuleVariables,
                program,
                ruleResult,
                formData,
            } = context;

            const result = executeProgramRules({
                dataValues: {
                    ...formData,
                    ...ruleResult.assignments,
                },
                programRuleVariables,
                programRules,
                program,
                attributeValues: context.trackedEntity?.attributes || {},
                programStage: context.programStage,
            });

            return {
                ruleResult: programRuleResultsEqual(result, ruleResult)
                    ? ruleResult
                    : result,
            };
        }),
    },
    actors: {
        persist: fromPromise(
            async ({
                input: { event, formData, eventsCollection },
            }: {
                input: {
                    event: FlattenedEvent;
                    formData: Record<string, any>;
                    eventsCollection: ReturnType<typeof createEventCollection>;
                };
            }) => {
                await eventsCollection.utils.insertLocally({
                    ...event,
                    dataValues: {
                        ...event.dataValues,
                        ...formData,
                    },
                });
            },
        ),
    },
}).createMachine({
    id: "event-form",
    initial: "initial",
    context: ({
        input: {
            event,
            programRuleVariables,
            programRules,
            enrollment,
            trackedEntity,
            validDataElements,
            programStage,
            program,
            form,
            eventsCollection,
        },
    }) => {
        return {
            formData: {},
            errors: {},
            programRuleVariables,
            event,
            programRules,
            program,
            enrollment,
            programStage,
            trackedEntity,
            validDataElements,
            form,
            ruleResult: createEmptyProgramRuleResult(),
            persistenceError: null,
            previousAssignments: {},
            eventsCollection,
        };
    },
    states: {
        initial: {
            entry: ["updateFormData", "updateForm"],
            always: {
                target: "editing",
            },
        },
        editing: {
            entry: ["executeRulesSync", "applyRuleResults"],
            on: {
                FIELD_CHANGED: {
                    target: "persisting",
                    actions: "updateField",
                },
            },
        },
        persisting: {
            invoke: {
                src: "persist",
                input: ({ context }) => ({
                    formData: context.form.getFieldsValue(),
                    event: context.event,
                    eventsCollection: context.eventsCollection,
                }),
                onDone: "editing",
                onError: {
                    target: "editing",
                    actions: assign({
                        errors: ({ event }: { event: any }) => {
                            return {
                                persist:
                                    event.error?.message || "Persist failed",
                            };
                        },
                    }),
                },
            },
        },
    },
});

export const EventContext = createActorContext(eventFormMachine);
