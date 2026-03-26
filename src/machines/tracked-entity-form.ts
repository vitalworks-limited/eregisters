import { createActorContext } from "@xstate/react";
import { FormInstance } from "antd";
import { assertEvent, assign, fromPromise, setup } from "xstate";
import { createTrackedEntityCollection } from "../collections";
import {
    FlattenedTrackedEntity,
    ProgramRule,
    ProgramRuleResult,
    ProgramRuleVariable,
} from "../schemas";
import {
    createEmptyProgramRuleResult,
    executeProgramRules,
} from "../utils/utils";
import { FormEvent } from "./common";

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
            trackedEntitiesCollection: ReturnType<
                typeof createTrackedEntityCollection
            >;
        },
        input: {} as {
            programRules: ProgramRule[];
            programRuleVariables: ProgramRuleVariable[];
            trackedEntity: FlattenedTrackedEntity;
            validDataElements: Set<string>;
            program: string;
            form: FormInstance;
            trackedEntitiesCollection: ReturnType<
                typeof createTrackedEntityCollection
            >;
        },
    },
    actions: {
        updateForm: ({ context: { formData, form, trackedEntity } }) => {
            form.setFieldsValue({
                ...formData,
                ...trackedEntity.attributes,
            });
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
        applyRuleResults: assign(({ context }) => {
            const { ruleResult, form } = context;
            if (ruleResult && Object.keys(ruleResult.assignments).length > 0) {
                form.setFieldsValue(ruleResult.assignments);
            }
            if (ruleResult && ruleResult.hiddenFields.length > 0) {
                const currentData = form.getFieldsValue();
                const fieldsToClear: Record<string, any> = {};
                ruleResult.hiddenFields.forEach((hiddenFieldId) => {
                    const currentValue = currentData[hiddenFieldId];
                    if (
                        currentValue !== undefined &&
                        currentValue !== null &&
                        currentValue !== ""
                    ) {
                        fieldsToClear[hiddenFieldId] = undefined;
                    }
                });
                if (Object.keys(fieldsToClear).length > 0) {
                    form.setFieldsValue(fieldsToClear);
                }
            }
            return {
                previousAssignments: { ...ruleResult.assignments },
            };
        }),
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
                ruleResult: result,
            };
        }),
    },
    actors: {
        persist: fromPromise(
            async ({
                input: { data, formData, trackedEntitiesCollection },
            }: {
                input: {
                    data: FlattenedTrackedEntity;
                    formData: Record<string, any>;
                    trackedEntitiesCollection: ReturnType<
                        typeof createTrackedEntityCollection
                    >;
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
            trackedEntitiesCollection,
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
                    trackedEntitiesCollection:
                        context.trackedEntitiesCollection,
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
