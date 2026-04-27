import { createActorContext } from "@xstate/react";
import { FormInstance } from "antd";
import { assertEvent, assign, fromPromise, setup } from "xstate";
import {
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
import { trackedEntitiesCollection } from "../collections";

export const trackedEntityFormMachine = setup({
    types: {
        events: {} as FormEvent,
        context: {} as {
            formData: Record<string, any>;
            ruleResult: ProgramRuleResult;
            errors: Record<string, string>;
            programRules: ProgramRule[];
            programRuleVariables: ProgramRuleVariable[];
            trackedEntity: FlattenedTrackedEntity;
            program: string;
            validDataElements: Set<string>;
            form: FormInstance;
            persistenceError: string | null;
            previousAssignments: Record<string, any>;
        },
        input: {} as {
            programRules: ProgramRule[];
            programRuleVariables: ProgramRuleVariable[];
            trackedEntity: FlattenedTrackedEntity;
            validDataElements: Set<string>;
            program: string;
            form: FormInstance;
        },
    },
    actions: {
        updateForm: ({ context: { form, trackedEntity } }) => {
            form.setFieldsValue(trackedEntity.attributes);
        },
        updateFormData: assign({
            formData: ({ context: { trackedEntity, formData } }) => {
                return {
                    ...trackedEntity.attributes,
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
                formData,
                ruleResult,
            } = context;
            const result = executeProgramRules({
                programRuleVariables,
                programRules,
                program,
                attributeValues: {
                    ...formData,
                    ...ruleResult.assignments,
                },
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
                input: { data, formData },
            }: {
                input: {
                    data: FlattenedTrackedEntity;
                    formData: Record<string, any>;
                };
            }) => {
                await trackedEntitiesCollection.utils.insertLocally({
                    ...data,
                    attributes: {
                        ...data.attributes,
                        ...formData,
                    },
                });
            },
        ),
    },
}).createMachine({
    id: "tracked-entity-form",
    initial: "initial",
    context: ({
        input: {
            programRuleVariables,
            trackedEntity,
            validDataElements,
            program,
            programRules,
            form,
        },
    }) => {
        return {
            program,
            programRules,
            programRuleVariables,
            errors: {},
            formData: {},
            ruleResult: createEmptyProgramRuleResult(),
            trackedEntity,
            validDataElements,
            form,
            persistenceError: null,
            previousAssignments: {},
            trackedEntitiesCollection,
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
                    formData: context.formData,
                    data: context.trackedEntity,
                }),
                onDone: "editing",
                onError: {
                    target: "editing",
                    actions: assign({
                        errors: ({ event }: { event: any }) => ({
                            persist: event.error?.message || "Persist failed",
                        }),
                    }),
                },
            },
        },
    },
});

export const TrackedEntityContext = createActorContext(
    trackedEntityFormMachine,
);
