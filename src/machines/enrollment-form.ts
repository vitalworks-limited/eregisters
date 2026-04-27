import { createActorContext } from "@xstate/react";
import {
    assertEvent,
    assign,
    enqueueActions,
    fromPromise,
    setup,
} from "xstate";
import { enrollmentsCollection } from "../collections";
import { FlattenedEnrollment, FlattenedTrackedEntity } from "../schemas";

import { FormEvent } from "./common";

export const enrollmentFormMachine = setup({
    types: {
        events: {} as FormEvent,
        context: {} as {
            enrollment: FlattenedEnrollment;
            trackedEntity: FlattenedTrackedEntity;
            formData: Record<string, any>;
            errors: Record<string, string>;
        },
        input: {} as {
            trackedEntity: FlattenedTrackedEntity;
            enrollment: FlattenedEnrollment;
        },
    },
    actions: {
        updateField: assign({
            formData: ({ context, event }) => {
                assertEvent(event, "FIELD_CHANGED");
                return {
                    ...context.formData,
                    ...event.formData,
                };
            },
        }),
        persistInBackground: enqueueActions(({ context, enqueue }) => {
            const { trackedEntity, enrollment } = context;
            enqueue.spawnChild("persist", {
                input: {
                    formData: trackedEntity.attributes,
                    data: enrollment,
                },
            });
        }),
    },
    actors: {
        persist: fromPromise(
            async ({
                input: { data, formData },
            }: {
                input: {
                    data: FlattenedEnrollment;
                    formData: Record<string, any>;
                };
            }) => {
                await enrollmentsCollection.utils.insertLocally({
                    ...data,
                    attributes: { ...data.attributes, ...formData },
                });
            },
        ),
    },
}).createMachine({
    id: "enrollment-form",
    initial: "idle",
    context: ({ input: { enrollment, trackedEntity } }) => {
        return {
            formData: {},
            errors: {},
            enrollment,
            trackedEntity,
        };
    },
    states: {
        idle: {
            on: {
                FIELD_CHANGED: {
                    target: "editing",
                    actions: "updateField",
                },
            },
        },
        editing: {
            on: {
                FIELD_CHANGED: {
                    target: "debouncing",
                    actions: "updateField",
                },
            },
        },
        debouncing: {
            after: {
                150: "persisting",
            },
            on: {
                FIELD_CHANGED: {
                    target: "debouncing",
                    actions: "updateField",
                    reenter: true,
                },
            },
        },
        persisting: {
            invoke: {
                src: "persist",
                input: ({ context }) => ({
                    formData: context.formData,
                    data: context.enrollment,
                }),
                onDone: "valid",
                onError: {
                    target: "valid",
                    actions: assign({
                        errors: ({ event }: { event: any }) => ({
                            persist: event.error?.message || "Persist failed",
                        }),
                    }),
                },
            },
        },
        valid: {
            on: {
                FIELD_CHANGED: {
                    target: "editing",
                    actions: "updateField",
                },
                RESET: "idle",
            },
        },
    },
});

export const EnrollmentContext = createActorContext(enrollmentFormMachine);
